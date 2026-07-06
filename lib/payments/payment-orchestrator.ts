import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOrderItems, type OrderItemInput } from '@/lib/orders/resolve-order-items';
import { createOrderWithItems } from '@/lib/orders/create-order';
import { resolveActiveSessionId } from '@/lib/orders/session-guard';
import { resolveCouponDiscount } from '@/lib/orders/apply-coupon-discount';
import { MockPaymentProvider } from './providers/mock-provider';
import type { PaymentProvider } from './providers/payment-provider.interface';
import {
  DEFAULT_TAX_RATE_PERCENT,
  DEFAULT_SERVICE_FEE_PERCENT,
  isTipPercentOption,
  roundCurrency,
  type TipPercentOption,
} from './pricing-defaults';

// Swap point for a future real provider (e.g. StripeProvider) — the rest of
// this module never branches on which provider is active.
function getPaymentProvider(): PaymentProvider {
  return new MockPaymentProvider();
}

export type ProcessPaymentParams = {
  supabase: SupabaseClient;
  restaurantId: string;
  items: OrderItemInput[];
  tableIdentifier: string | null;
  customerName: string | null;
  legacySessionId: string | null;
  visitSessionId: string | null;
  rawGuestId: string | null | undefined;
  idempotencyKey: string;
  tipAmount?: number;
  tipPercent?: number;
  currency?: string;
  couponRedemptionId?: string | null;
};

export type ChargeBreakdown = {
  subtotal: number;
  tax_amount: number;
  service_fee_amount: number;
  tip_amount: number;
  discount_amount: number;
  total: number;
};

export type ProcessPaymentResult =
  | {
      ok: true;
      idempotent: boolean;
      payment: { id: string; status: string; transaction_id: string; amount: number; currency: string };
      order: { id: string; order_number: number; status: string; subtotal: number };
      charge_breakdown: ChargeBreakdown;
      sessionOrdersCount: number;
      sessionTotalSpend: number;
    }
  | { ok: false; status: number; error: string; message?: string };

async function fetchRestaurantSettingValue(
  supabase: SupabaseClient,
  restaurantId: string,
  key: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('restaurant_settings')
    .select('value')
    .eq('restaurant_id', restaurantId)
    .eq('key', key)
    .maybeSingle();

  const raw = data?.value;
  return typeof raw === 'number' ? raw : null;
}

function computeTipAmount(
  subtotal: number,
  tipPercent: number | undefined,
  tipAmount: number | undefined,
): number {
  if (tipPercent !== undefined && isTipPercentOption(tipPercent)) {
    return roundCurrency(subtotal * (tipPercent / 100));
  }
  if (typeof tipAmount === 'number' && Number.isFinite(tipAmount) && tipAmount >= 0) {
    // Sanity bound — a flat custom tip is never trusted beyond the subtotal itself.
    return roundCurrency(Math.min(tipAmount, subtotal));
  }
  return 0;
}

// The orchestration boundary: validates the cart/prices server-side, charges
// via the active PaymentProvider, and — only on success — creates the order.
// Independent of which PaymentProvider implementation is active (Rule: payment
// layer exists as orchestration boundary before order creation, independent of
// payment provider implementation).
export async function processPayment(params: ProcessPaymentParams): Promise<ProcessPaymentResult> {
  const {
    supabase,
    restaurantId,
    items,
    tableIdentifier,
    customerName,
    legacySessionId,
    visitSessionId,
    rawGuestId,
    idempotencyKey,
    tipAmount,
    tipPercent,
    currency = 'usd',
    couponRedemptionId,
  } = params;

  // 1. Idempotency check — a previously succeeded checkout attempt with an
  // order already attached is returned as-is, never re-charged or re-ordered.
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id, status, transaction_id, amount, currency, order_id, metadata')
    .eq('restaurant_id', restaurantId)
    .eq('metadata->>idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existingPayment?.status === 'succeeded' && existingPayment.order_id) {
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id, order_number, status, subtotal')
      .eq('id', existingPayment.order_id)
      .maybeSingle();

    if (existingOrder) {
      const metadata = (existingPayment.metadata ?? {}) as Record<string, unknown>;
      const numeric = (key: string, fallback: number) =>
        typeof metadata[key] === 'number' ? (metadata[key] as number) : fallback;
      return {
        ok: true,
        idempotent: true,
        payment: {
          id: existingPayment.id,
          status: existingPayment.status,
          transaction_id: existingPayment.transaction_id,
          amount: existingPayment.amount,
          currency: existingPayment.currency,
        },
        order: existingOrder,
        charge_breakdown: {
          subtotal: numeric('subtotal', existingOrder.subtotal),
          tax_amount: numeric('tax_amount', 0),
          service_fee_amount: numeric('service_fee_amount', 0),
          tip_amount: numeric('tip_amount', 0),
          discount_amount: numeric('coupon_discount_amount', 0),
          total: existingPayment.amount,
        },
        sessionOrdersCount: 0,
        sessionTotalSpend: 0,
      };
    }
  }

  // 2. payment_simulation capability check (defense-in-depth; the client should
  // never reach this route for a capability-disabled restaurant).
  const { data: capability } = await supabase
    .from('restaurant_capabilities')
    .select('enabled')
    .eq('restaurant_id', restaurantId)
    .eq('capability_name', 'payment_simulation')
    .maybeSingle();

  if (!capability?.enabled) {
    return { ok: false, status: 403, error: 'Payment simulation is not enabled for this restaurant.' };
  }

  // 3. Server-authoritative price resolution — never trust frontend prices (Invariant #5).
  const resolution = await resolveOrderItems(supabase, restaurantId, items);
  if (!resolution.ok) {
    return { ok: false, status: resolution.status, error: resolution.error };
  }
  const { resolvedItems, subtotal } = resolution;

  // 3b. "Redeem Now" coupon discount — re-derived and re-validated entirely
  // server-side (redemption status, expiry, item match). A coupon that can't
  // be applied is silently skipped, never blocks checkout (product decision).
  const { discountAmount, appliedRedemptionId } = await resolveCouponDiscount(
    supabase,
    restaurantId,
    couponRedemptionId,
    resolvedItems,
  );
  const chargeSubtotal = roundCurrency(subtotal - discountAmount);

  // 4. Tax / service fee — sourced from restaurant_settings, fallback constants if unset.
  // Computed on the post-discount subtotal, matching standard retail tax treatment.
  const [taxRatePercent, serviceFeePercent] = await Promise.all([
    fetchRestaurantSettingValue(supabase, restaurantId, 'tax_rate_percent'),
    fetchRestaurantSettingValue(supabase, restaurantId, 'service_fee_percent'),
  ]);
  const taxAmount = roundCurrency(chargeSubtotal * ((taxRatePercent ?? DEFAULT_TAX_RATE_PERCENT) / 100));
  const serviceFeeAmount = roundCurrency(
    chargeSubtotal * ((serviceFeePercent ?? DEFAULT_SERVICE_FEE_PERCENT) / 100),
  );

  // 5. Tip — percentage tips are recomputed server-side; a flat custom tip is bounds-checked.
  const tip = computeTipAmount(chargeSubtotal, tipPercent, tipAmount);

  const total = roundCurrency(chargeSubtotal + taxAmount + serviceFeeAmount + tip);

  // 6. Reject up front if the session already ended — never charge into a dead session.
  if (visitSessionId) {
    const activeSessionId = await resolveActiveSessionId(supabase, restaurantId, visitSessionId);
    if (!activeSessionId) {
      return {
        ok: false,
        status: 409,
        error: 'SESSION_INVALID',
        message: 'Dining session is no longer active.',
      };
    }
  }

  // 7. Create the payment row (pending), then run the provider's checkout/authorize/capture
  // sequence — structurally mirrors a real Stripe PaymentIntent create -> confirm -> capture flow.
  const provider = getPaymentProvider();

  const { data: paymentRow, error: paymentInsertError } = await supabase
    .from('payments')
    .insert({
      restaurant_id: restaurantId,
      order_id: null,
      provider: 'mock',
      transaction_id: `pending_${idempotencyKey}`,
      amount: total,
      currency,
      status: 'pending',
      metadata: {
        idempotency_key: idempotencyKey,
        subtotal,
        tax_amount: taxAmount,
        service_fee_amount: serviceFeeAmount,
        tip_amount: tip,
        coupon_redemption_id: appliedRedemptionId,
        coupon_discount_amount: discountAmount,
      },
    })
    .select('id')
    .single();

  if (paymentInsertError || !paymentRow) {
    // 23505 = unique_violation on the idempotency index — a concurrent request won the race.
    if (paymentInsertError?.code === '23505') {
      return processPayment(params);
    }
    return { ok: false, status: 500, error: paymentInsertError?.message || 'Failed to start payment.' };
  }

  const checkout = await provider.createCheckout({
    restaurantId,
    amount: { amount: total, currency },
    idempotencyKey,
    metadata: { subtotal, tax_amount: taxAmount, service_fee_amount: serviceFeeAmount, tip_amount: tip, coupon_discount_amount: discountAmount },
  });

  const authorization = await provider.authorizePayment({ transactionId: checkout.transactionId });
  const capture =
    authorization.status === 'succeeded'
      ? await provider.capturePayment({ transactionId: checkout.transactionId, amount: { amount: total, currency } })
      : { transactionId: checkout.transactionId, status: 'failed' as const, failureReason: authorization.failureReason };

  // 8. Failure branch — structurally present, unreachable via the mock provider today.
  // A real provider decline lands here: mark the payment failed, never create an order.
  if (capture.status !== 'succeeded') {
    await supabase
      .from('payments')
      .update({ status: 'failed', transaction_id: checkout.transactionId })
      .eq('id', paymentRow.id);

    return {
      ok: false,
      status: 402,
      error: 'PAYMENT_DECLINED',
      message: capture.failureReason ?? 'Payment was declined.',
    };
  }

  // 9. Payment succeeded — mark it, then create the order via the exact same
  // shared logic the direct-order route uses (identical order/order_items rows,
  // identical session analytics). Session status is re-validated immediately
  // before the insert inside createOrderWithItems, since this payment step
  // introduced a real time gap since step 6's up-front check.
  await supabase
    .from('payments')
    .update({ status: 'succeeded', transaction_id: checkout.transactionId })
    .eq('id', paymentRow.id);

  const created = await createOrderWithItems({
    supabase,
    restaurantId,
    resolvedItems,
    subtotal,
    tableIdentifier,
    customerName,
    legacySessionId,
    visitSessionId,
    rawGuestId,
    idempotencyKey: `${idempotencyKey}:order`,
    couponRedemptionId: appliedRedemptionId,
  });

  if (!created.ok) {
    // Order creation failed after a successful mock charge — refund immediately
    // (structurally correct even though the mock refund is a no-op) and surface
    // the underlying error rather than silently orphaning a succeeded payment.
    await provider.refundPayment({ transactionId: checkout.transactionId, amount: { amount: total, currency } });
    await supabase.from('payments').update({ status: 'refunded' }).eq('id', paymentRow.id);
    return created;
  }

  await supabase.from('payments').update({ order_id: created.order.id }).eq('id', paymentRow.id);

  // Best-effort — a failure here doesn't unwind the payment/order, it just
  // leaves the redemption row eligible for a future silent-skip re-check
  // (resolveCouponDiscount always re-validates status/expiry from scratch).
  if (appliedRedemptionId) {
    const { error: redeemError } = await supabase
      .from('coupon_redemptions')
      .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
      .eq('id', appliedRedemptionId)
      .eq('status', 'issued');
    if (redeemError) {
      console.error('[payment-orchestrator] failed to mark coupon redeemed', redeemError.message, { appliedRedemptionId });
    }
  }

  return {
    ok: true,
    idempotent: false,
    payment: {
      id: paymentRow.id,
      status: 'succeeded',
      transaction_id: checkout.transactionId,
      amount: total,
      currency,
    },
    order: created.order,
    charge_breakdown: {
      // Full pre-discount subtotal — matches payments.metadata.subtotal and the
      // idempotent-replay branch above, which both read/store the undiscounted value.
      subtotal,
      tax_amount: taxAmount,
      service_fee_amount: serviceFeeAmount,
      tip_amount: tip,
      discount_amount: discountAmount,
      total,
    },
    sessionOrdersCount: created.sessionOrdersCount,
    sessionTotalSpend: created.sessionTotalSpend,
  };
}

export type { TipPercentOption };

import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateSession } from '@/engine/decision-runtime/runtime';
import type { ResolvedItem } from './resolve-order-items';
import { resolveActiveSessionId } from './session-guard';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CreateOrderParams = {
  supabase: SupabaseClient;
  restaurantId: string;
  resolvedItems: ResolvedItem[];
  subtotal: number;
  tableIdentifier: string | null;
  customerName: string | null;
  legacySessionId: string | null; // @deprecated orders.session_id (text) passthrough
  visitSessionId: string | null;
  rawGuestId: string | null | undefined;
  idempotencyKey: string;
  couponRedemptionId?: string | null;
};

export type CreateOrderResult =
  | {
      ok: true;
      idempotent: boolean;
      order: { id: string; order_number: number; status: string; subtotal: number };
      sessionOrdersCount: number;
      sessionTotalSpend: number;
    }
  | { ok: false; status: number; error: string; message?: string };

// Order creation — extracted verbatim from the original app/api/public/orders/route.ts
// pipeline (steps 12, 15-17) so the direct-order route and the payment-checkout
// route create identical order/order_items rows and fire identical session
// analytics. Called only after payment has succeeded on the payment-gated path.
export async function createOrderWithItems(params: CreateOrderParams): Promise<CreateOrderResult> {
  const {
    supabase,
    restaurantId,
    resolvedItems,
    subtotal,
    tableIdentifier,
    customerName,
    legacySessionId,
    visitSessionId,
    rawGuestId,
    idempotencyKey,
    couponRedemptionId,
  } = params;

  // Atomic restaurant-scoped order number — single UPSERT+increment, no race condition
  const { data: counterData, error: counterError } = await supabase.rpc('next_order_number', {
    p_restaurant_id: restaurantId,
  });

  if (counterError || counterData == null) {
    return { ok: false, status: 500, error: 'Failed to generate order number.' };
  }
  const nextOrderNumber = counterData as number;

  // Re-validate visit_session_id immediately before insert. On the payment-gated
  // path a mock (or future real) payment attempt now sits between the caller's
  // own up-front session check and this insert — never insert an orphan order
  // into a session that ended during that window (Rules 34/39).
  let resolvedSessionId: string | null = null;
  if (visitSessionId) {
    resolvedSessionId = await resolveActiveSessionId(supabase, restaurantId, visitSessionId);

    if (!resolvedSessionId) {
      console.warn('[SESSION][ORDER_REJECTED]', {
        visit_session_id: visitSessionId,
        restaurant_id: restaurantId,
        reason: 'session_not_active',
      });
      return {
        ok: false,
        status: 409,
        error: 'SESSION_INVALID',
        message: 'Dining session is no longer active.',
      };
    }
  }

  // Sanitize guest_id — must be a valid UUID if provided; reject silently otherwise
  const resolvedGuestId =
    rawGuestId && typeof rawGuestId === 'string' && UUID_RE.test(rawGuestId.trim())
      ? rawGuestId.trim()
      : null;

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      restaurant_id: restaurantId,
      order_number: nextOrderNumber,
      status: 'pending',
      order_origin: resolvedSessionId ? 'restaurant_qr' : 'direct_link',
      table_identifier: tableIdentifier ?? null,
      customer_name: customerName ?? null,
      // @deprecated orders.session_id (text) — use visit_session_id (uuid FK) for all session linkage.
      // Retained for backward compatibility; always null for current clients.
      session_id: legacySessionId ?? null,
      visit_session_id: resolvedSessionId,
      guest_id: resolvedGuestId,
      idempotency_key: idempotencyKey,
      subtotal,
      coupon_id: couponRedemptionId ?? null,
    })
    .select('id, order_number, status, subtotal')
    .single();

  if (orderError || !order) {
    // 23505 = unique_violation — concurrent idempotency_key race
    if (orderError?.code === '23505') {
      const { data: raceExisting } = await supabase
        .from('orders')
        .select('id, order_number, status, subtotal')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (raceExisting) {
        return { ok: true, idempotent: true, order: raceExisting, sessionOrdersCount: 0, sessionTotalSpend: 0 };
      }
    }
    return { ok: false, status: 500, error: orderError?.message || 'Failed to create order.' };
  }

  const orderItems = resolvedItems.map((ri) => ({
    order_id: order.id,
    restaurant_id: restaurantId,
    menu_item_id: ri.menu_item_id,
    name_snapshot: ri.name_snapshot,
    price_snapshot: ri.price_snapshot,
    effective_price_snapshot: ri.effective_price_snapshot,
    special_active_snapshot: ri.special_active_snapshot,
    quantity: ri.quantity,
    line_total: ri.line_total,
  }));

  const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

  if (itemsError) {
    return { ok: false, status: 500, error: 'Order created but items failed to save.' };
  }

  // Update session analytics and fetch post-increment session totals for frontend sync.
  // increment_session_counters is awaited so orders_count is authoritative before returning.
  // append_session_interaction is fire-and-forget (analytics, non-blocking).
  let sessionOrdersCount = 0;
  let sessionTotalSpend = 0;
  if (resolvedSessionId) {
    const sid = resolvedSessionId;
    const { error: incrErr } = await supabase.rpc('increment_session_counters', {
      p_session_id: sid,
      p_orders_delta: 1,
      p_spend_delta: subtotal,
    });
    if (incrErr) {
      console.error('[SESSION][COUNTER_UPDATE_FAILED]', incrErr.message);
    }

    // Write ORDER_PLACED to session_events (server-side; not fireable by client)
    Promise.resolve(
      supabase.from('session_events').insert({
        session_id: sid,
        restaurant_id: restaurantId,
        event_type: 'ORDER_PLACED',
        metadata: {
          order_id: order.id,
          order_number: nextOrderNumber,
          item_count: resolvedItems.length,
          subtotal,
        },
      }),
    ).catch((err: unknown) => {
      console.error('[spinbite:orders] session_events ORDER_PLACED failed', err);
    });

    // Trigger Decision Runtime — ORDER_PLACED unlocks dessert_interest opportunity
    void evaluateSession(sid, resolvedGuestId).catch(() => {
      /* runtime is self-contained */
    });

    // @deprecated visit_sessions.session_interaction_log — use session_events table instead.
    // append_session_interaction writes to the JSONB column retained for backward compat only.
    Promise.resolve(
      supabase.rpc('append_session_interaction', {
        p_session_id: sid,
        p_event: {
          event: 'order_submitted',
          order_id: order.id,
          order_number: nextOrderNumber,
          subtotal,
          ts: new Date().toISOString(),
        },
      }),
    ).catch((err: unknown) => {
      console.error('[spinbite:orders] session interaction log failed', err);
    });

    // Fetch updated session totals so frontend can sync count/spend without a separate GET.
    const { data: updatedSession } = await supabase
      .from('visit_sessions')
      .select('orders_count, total_spend')
      .eq('id', sid)
      .maybeSingle();
    sessionOrdersCount = updatedSession?.orders_count ?? 0;
    sessionTotalSpend = Number(updatedSession?.total_spend ?? 0);
  }

  return { ok: true, idempotent: false, order, sessionOrdersCount, sessionTotalSpend };
}

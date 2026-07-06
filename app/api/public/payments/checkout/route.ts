import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { processPayment } from '@/lib/payments/payment-orchestrator';
import { createIpRateLimiter, checkRestaurantRateLimit, extractClientIp } from '@/lib/http/rate-limit';

// ── Payload limits — mirrors app/api/public/orders/route.ts ────────────────────
const MAX_BODY_BYTES = 8 * 1024; // 8 KB
const MAX_ITEMS = 20;
const MAX_QUANTITY = 99;
const MAX_KEY_LENGTH = 128;

// ── Rate limits — independent bucket from the orders route (separate action) ───
const IP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const IP_MAX = 20;
const ipLimiter = createIpRateLimiter(IP_WINDOW_MS, IP_MAX);

const RESTAURANT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RESTAURANT_MAX = 200;

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url) throw new Error('Supabase URL is missing.');
  if (!serviceKey) throw new Error('Service key is not configured.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type CheckoutRequest = {
  restaurant_id: string;
  items: { menu_item_id: string; quantity: number }[];
  table_identifier?: string | null;
  customer_name?: string | null;
  visit_session_id?: string | null;
  guest_id?: string | null;
  tip_amount?: number;
  tip_percent?: number;
  idempotency_key: string;
  coupon_redemption_id?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const ip = extractClientIp(req);
    if (ipLimiter.check(ip)) {
      console.warn('[spinbite:payments] rate-limit:ip', { ip });
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request body too large.' }, { status: 413 });
    }

    let body: CheckoutRequest;
    try {
      body = JSON.parse(rawBody) as CheckoutRequest;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
    }

    const {
      restaurant_id,
      items,
      table_identifier,
      customer_name,
      visit_session_id,
      guest_id,
      tip_amount,
      tip_percent,
      idempotency_key,
      coupon_redemption_id,
    } = body;

    if (!restaurant_id || !idempotency_key || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'restaurant_id, idempotency_key, and items are required.' },
        { status: 400 },
      );
    }

    if (idempotency_key.length > MAX_KEY_LENGTH) {
      return NextResponse.json(
        { error: `idempotency_key must be ${MAX_KEY_LENGTH} characters or fewer.` },
        { status: 400 },
      );
    }

    if (items.length > MAX_ITEMS) {
      return NextResponse.json(
        { error: `Order cannot exceed ${MAX_ITEMS} distinct items.` },
        { status: 400 },
      );
    }

    for (const item of items) {
      if (!item.menu_item_id || !Number.isInteger(item.quantity) || item.quantity < 1) {
        return NextResponse.json(
          { error: 'Each item must have a valid menu_item_id and quantity >= 1.' },
          { status: 400 },
        );
      }
      if (item.quantity > MAX_QUANTITY) {
        return NextResponse.json(
          { error: `Item quantity cannot exceed ${MAX_QUANTITY}.` },
          { status: 400 },
        );
      }
    }

    const supabase = makeServiceClient();

    const restaurantLimited = await checkRestaurantRateLimit(
      supabase,
      'payments',
      restaurant_id,
      RESTAURANT_WINDOW_MS,
      RESTAURANT_MAX,
    );
    if (restaurantLimited) {
      console.warn('[spinbite:payments] rate-limit:restaurant', { restaurant_id });
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    }

    const result = await processPayment({
      supabase,
      restaurantId: restaurant_id,
      items,
      tableIdentifier: table_identifier ?? null,
      customerName: customer_name ?? null,
      legacySessionId: null,
      visitSessionId: visit_session_id ?? null,
      rawGuestId: guest_id,
      idempotencyKey: idempotency_key,
      tipAmount: tip_amount,
      tipPercent: tip_percent,
      couponRedemptionId: coupon_redemption_id ?? null,
    });

    if (!result.ok) {
      if (result.status === 409) {
        return NextResponse.json({ error: result.error, message: result.message }, { status: 409 });
      }
      if (result.status === 402) {
        return NextResponse.json({ error: result.error, message: result.message }, { status: 402 });
      }
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    console.log('[spinbite:payments] succeeded', {
      restaurant_id,
      payment_id: result.payment.id,
      order_id: result.order.id,
      order_number: result.order.order_number,
      idempotent: result.idempotent,
    });

    return NextResponse.json(
      {
        payment: result.payment,
        order: result.order,
        charge_breakdown: result.charge_breakdown,
        session_orders_count: result.sessionOrdersCount,
        session_total_spend: result.sessionTotalSpend,
      },
      { status: result.idempotent ? 200 : 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

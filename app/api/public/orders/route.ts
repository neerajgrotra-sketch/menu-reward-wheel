import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { resolveOrderItems } from '@/lib/orders/resolve-order-items';
import { createOrderWithItems } from '@/lib/orders/create-order';
import { createIpRateLimiter, checkRestaurantRateLimit, extractClientIp } from '@/lib/http/rate-limit';

// ── Payload limits ─────────────────────────────────────────────────────────────
const MAX_BODY_BYTES = 8 * 1024; // 8 KB
const MAX_ITEMS = 20;
const MAX_QUANTITY = 99;
const MAX_KEY_LENGTH = 128;

// ── Rate limits ─────────────────────────────────────────────────────────────────
const IP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const IP_MAX = 20;
const ipLimiter = createIpRateLimiter(IP_WINDOW_MS, IP_MAX);

const RESTAURANT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RESTAURANT_MAX = 200;

// ── Service client factory ─────────────────────────────────────────────────────
function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url) throw new Error('Supabase URL is missing.');
  if (!serviceKey) throw new Error('Service key is not configured.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Types ──────────────────────────────────────────────────────────────────────
type OrderItemInput = {
  menu_item_id: string;
  quantity: number;
};

type OrderRequest = {
  restaurant_id: string;
  items: OrderItemInput[];
  table_identifier?: string | null;
  customer_name?: string | null;
  session_id?: string | null;          // legacy text field — accepted but not used
  visit_session_id?: string | null;    // FK to visit_sessions — canonical session linkage
  guest_id?: string | null;            // FK to session_guests.id — per-guest order attribution
  idempotency_key: string;
};

// ── POST handler ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // 1. Per-IP rate limit — cheapest check first, no DB
    const ip = extractClientIp(req);

    if (ipLimiter.check(ip)) {
      console.warn('[spinbite:orders] rate-limit:ip', { ip });
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }

    // 2. Body size limit — read as text for authoritative byte count, then parse
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request body too large.' }, { status: 413 });
    }

    let body: OrderRequest;
    try {
      body = JSON.parse(rawBody) as OrderRequest;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
    }

    const {
      restaurant_id,
      items,
      table_identifier,
      customer_name,
      session_id,
      visit_session_id,
      guest_id: rawGuestId,
      idempotency_key,
    } = body;

    // 3. Required field presence
    if (!restaurant_id || !idempotency_key || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'restaurant_id, idempotency_key, and items are required.' },
        { status: 400 },
      );
    }

    // 4. Idempotency key length — prevents large-string DB storage attack
    if (idempotency_key.length > MAX_KEY_LENGTH) {
      console.warn('[spinbite:orders] validation:key-too-long', { length: idempotency_key.length });
      return NextResponse.json(
        { error: `idempotency_key must be ${MAX_KEY_LENGTH} characters or fewer.` },
        { status: 400 },
      );
    }

    // 5. Items count limit
    if (items.length > MAX_ITEMS) {
      console.warn('[spinbite:orders] validation:items-overflow', { count: items.length });
      return NextResponse.json(
        { error: `Order cannot exceed ${MAX_ITEMS} distinct items.` },
        { status: 400 },
      );
    }

    // 6. Per-item validation (quantity range)
    for (const item of items) {
      if (!item.menu_item_id || !Number.isInteger(item.quantity) || item.quantity < 1) {
        return NextResponse.json(
          { error: 'Each item must have a valid menu_item_id and quantity >= 1.' },
          { status: 400 },
        );
      }
      if (item.quantity > MAX_QUANTITY) {
        console.warn('[spinbite:orders] validation:qty-overflow', { menu_item_id: item.menu_item_id, quantity: item.quantity });
        return NextResponse.json(
          { error: `Item quantity cannot exceed ${MAX_QUANTITY}.` },
          { status: 400 },
        );
      }
    }

    const supabase = makeServiceClient();

    // 7. Idempotency check — return existing order if same key already committed
    // Idempotent replays bypass downstream rate limits (they create no new data)
    const { data: existing } = await supabase
      .from('orders')
      .select('id, order_number, status, subtotal')
      .eq('idempotency_key', idempotency_key)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ order: existing, idempotent: true }, { status: 200 });
    }

    // 8. Ordering capability check
    const { data: capability } = await supabase
      .from('restaurant_capabilities')
      .select('enabled')
      .eq('restaurant_id', restaurant_id)
      .eq('capability_name', 'ordering')
      .maybeSingle();

    if (!capability?.enabled) {
      return NextResponse.json(
        { error: 'Online ordering is not enabled for this restaurant.' },
        { status: 403 },
      );
    }

    // 9. Per-restaurant rate limit — DB-backed COUNT, globally accurate
    const restaurantLimited = await checkRestaurantRateLimit(
      supabase,
      'orders',
      restaurant_id,
      RESTAURANT_WINDOW_MS,
      RESTAURANT_MAX,
    );
    if (restaurantLimited) {
      console.warn('[spinbite:orders] rate-limit:restaurant', { restaurant_id });
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    }

    // 10-11. Fetch menu items server-side and compute server-authoritative prices —
    // never trust frontend prices (Invariant #5)
    const resolution = await resolveOrderItems(supabase, restaurant_id, items);
    if (!resolution.ok) {
      return NextResponse.json({ error: resolution.error }, { status: resolution.status });
    }
    const { resolvedItems, subtotal } = resolution;

    // 12, 15-17. Atomic order number, session (re-)validation, order + order_items insert,
    // session analytics — extracted so this route and the payment-checkout route create
    // identical order rows.
    const created = await createOrderWithItems({
      supabase,
      restaurantId: restaurant_id,
      resolvedItems,
      subtotal,
      tableIdentifier: table_identifier ?? null,
      customerName: customer_name ?? null,
      legacySessionId: session_id ?? null,
      visitSessionId: visit_session_id ?? null,
      rawGuestId,
      idempotencyKey: idempotency_key,
    });

    if (!created.ok) {
      // Rule 4: 409 SESSION_INVALID means the session ended between confirmation and order placement
      if (created.status === 409) {
        return NextResponse.json(
          { error: created.error, message: created.message },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: created.error }, { status: created.status });
    }

    if (created.idempotent) {
      return NextResponse.json({ order: created.order, idempotent: true }, { status: 200 });
    }

    console.log('[POST_ROUTE_DB]', {
      visit_session_id,
      session_orders_count: created.sessionOrdersCount,
    });

    console.log('[spinbite:orders] created', {
      order_id: created.order.id,
      order_number: created.order.order_number,
      restaurant_id,
      item_count: resolvedItems.length,
      session_orders_count: created.sessionOrdersCount,
    });

    return NextResponse.json(
      {
        order: created.order,
        session_orders_count: created.sessionOrdersCount,
        session_total_spend: created.sessionTotalSpend,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

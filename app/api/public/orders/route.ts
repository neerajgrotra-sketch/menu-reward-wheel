import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isSpecialOfferActive, calculateSpecialPrice } from '@/lib/menu/special-offer';
import { evaluateSession } from '@/engine/decision-runtime/runtime';

// ── Payload limits ─────────────────────────────────────────────────────────────
const MAX_BODY_BYTES = 8 * 1024; // 8 KB
const MAX_ITEMS = 20;
const MAX_QUANTITY = 99;
const MAX_KEY_LENGTH = 128;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Per-IP rate limit (in-memory, per Lambda instance — soft limit) ────────────
// Stops naive single-origin attacks. Not globally distributed across Vercel instances.
const IP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const IP_MAX = 20;
const ipBuckets = new Map<string, number[]>();
let ipCleanupCounter = 0;

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - IP_WINDOW_MS;

  // Prune stale entries every 100 requests to prevent unbounded memory growth
  ipCleanupCounter++;
  if (ipCleanupCounter % 100 === 0) {
    ipBuckets.forEach((ts, key) => {
      const fresh = ts.filter((t: number) => t > cutoff);
      if (fresh.length === 0) ipBuckets.delete(key);
      else ipBuckets.set(key, fresh);
    });
  }

  const timestamps = (ipBuckets.get(ip) ?? []).filter((t) => t > cutoff);
  if (timestamps.length >= IP_MAX) return true;
  timestamps.push(now);
  ipBuckets.set(ip, timestamps);
  return false;
}

// ── Per-restaurant rate limit constants ────────────────────────────────────────
// DB-backed — globally accurate across all Lambda instances
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

type RawMenuItem = {
  id: string;
  name: string;
  price: number | null;
  available: boolean;
  special_enabled: boolean;
  special_type: string | null;
  special_percent: number | null;
  special_price: number | null;
  special_start_at: string | null;
  special_end_at: string | null;
  special_no_expiry: boolean;
};

// ── POST handler ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // 1. Per-IP rate limit — cheapest check first, no DB
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';

    if (checkIpRateLimit(ip)) {
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
    const restaurantWindowStart = new Date(Date.now() - RESTAURANT_WINDOW_MS).toISOString();
    const { count: recentOrderCount, error: countError } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurant_id)
      .gte('created_at', restaurantWindowStart);

    // Fail open on count error (DB connectivity issue would block order insert too)
    if (!countError && (recentOrderCount ?? 0) >= RESTAURANT_MAX) {
      console.warn('[spinbite:orders] rate-limit:restaurant', { restaurant_id, recent_count: recentOrderCount });
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    }

    // 10. Fetch menu items server-side — never trust frontend prices
    const menuItemIds = items.map((i) => i.menu_item_id);
    const { data: menuItemsRaw, error: menuError } = await supabase
      .from('menu_items')
      .select(
        'id,name,price,available,special_enabled,special_type,special_percent,special_price,special_start_at,special_end_at,special_no_expiry',
      )
      .eq('restaurant_id', restaurant_id)
      .is('deleted_at', null)
      .in('id', menuItemIds);

    if (menuError || !menuItemsRaw) {
      return NextResponse.json({ error: 'Failed to load menu items.' }, { status: 500 });
    }

    const menuItemMap = new Map<string, RawMenuItem>(
      (menuItemsRaw as RawMenuItem[]).map((m) => [m.id, m]),
    );

    // 11. Validate items and compute server-authoritative prices
    const now = new Date();
    let subtotal = 0;

    type ResolvedItem = {
      menu_item_id: string;
      name_snapshot: string;
      price_snapshot: number;
      effective_price_snapshot: number;
      special_active_snapshot: boolean;
      quantity: number;
      line_total: number;
    };

    const resolvedItems: ResolvedItem[] = [];

    for (const input of items) {
      const mi = menuItemMap.get(input.menu_item_id);
      if (!mi) {
        return NextResponse.json(
          { error: `Menu item ${input.menu_item_id} not found.` },
          { status: 400 },
        );
      }
      if (!mi.available) {
        return NextResponse.json(
          { error: `"${mi.name}" is currently unavailable.` },
          { status: 400 },
        );
      }
      if (mi.price == null) {
        return NextResponse.json({ error: `"${mi.name}" has no price set.` }, { status: 400 });
      }

      const specialActive = isSpecialOfferActive(mi, now);
      const effectivePrice =
        specialActive && mi.special_type
          ? calculateSpecialPrice(mi.price, mi.special_type, mi.special_percent, mi.special_price)
          : mi.price;

      const lineTotal = Math.round(effectivePrice * input.quantity * 100) / 100;
      subtotal = Math.round((subtotal + lineTotal) * 100) / 100;

      resolvedItems.push({
        menu_item_id: input.menu_item_id,
        name_snapshot: mi.name,
        price_snapshot: mi.price,
        effective_price_snapshot: effectivePrice,
        special_active_snapshot: specialActive,
        quantity: input.quantity,
        line_total: lineTotal,
      });
    }

    // 12. Atomic restaurant-scoped order number — single UPSERT+increment, no race condition
    const { data: counterData, error: counterError } = await supabase.rpc('next_order_number', {
      p_restaurant_id: restaurant_id,
    });

    if (counterError || counterData == null) {
      return NextResponse.json({ error: 'Failed to generate order number.' }, { status: 500 });
    }

    const nextOrderNumber = counterData as number;

    // 13. Validate visit_session_id if provided
    // Rule 4: if a session ID is supplied but is not active, reject with 409.
    // Never silently detach the session and insert an orphan order.
    let resolvedSessionId: string | null = null;
    if (visit_session_id) {
      const { data: sessionRow } = await supabase
        .from('visit_sessions')
        .select('id')
        .eq('id', visit_session_id)
        .eq('restaurant_id', restaurant_id)
        .eq('status', 'active')
        .maybeSingle();

      if (!sessionRow) {
        console.warn('[SESSION][ORDER_REJECTED]', { visit_session_id, restaurant_id, reason: 'session_not_active' });
        return NextResponse.json(
          { error: 'SESSION_INVALID', message: 'Dining session is no longer active.' },
          { status: 409 },
        );
      }
      resolvedSessionId = sessionRow.id;
    }

    // 14. Sanitize guest_id — must be a valid UUID if provided; reject silently otherwise
    const resolvedGuestId =
      rawGuestId && typeof rawGuestId === 'string' && UUID_RE.test(rawGuestId.trim())
        ? rawGuestId.trim()
        : null;

    // 15. Insert order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        restaurant_id,
        order_number: nextOrderNumber,
        status: 'pending',
        order_origin: resolvedSessionId ? 'restaurant_qr' : 'direct_link',
        table_identifier: table_identifier ?? null,
        customer_name: customer_name ?? null,
        // @deprecated orders.session_id (text) — use visit_session_id (uuid FK) for all session linkage.
        // Retained for backward compatibility; always null for current clients.
        session_id: session_id ?? null,
        visit_session_id: resolvedSessionId,
        guest_id: resolvedGuestId,
        idempotency_key,
        subtotal,
      })
      .select('id, order_number, status, subtotal')
      .single();

    if (orderError || !order) {
      // 23505 = unique_violation — concurrent idempotency_key race
      if (orderError?.code === '23505') {
        const { data: raceExisting } = await supabase
          .from('orders')
          .select('id, order_number, status, subtotal')
          .eq('idempotency_key', idempotency_key)
          .maybeSingle();
        if (raceExisting) {
          return NextResponse.json({ order: raceExisting, idempotent: true }, { status: 200 });
        }
      }
      return NextResponse.json(
        { error: orderError?.message || 'Failed to create order.' },
        { status: 500 },
      );
    }

    // 16. Insert order items
    const orderItems = resolvedItems.map((ri) => ({
      order_id: order.id,
      restaurant_id,
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
      return NextResponse.json(
        { error: 'Order created but items failed to save.' },
        { status: 500 },
      );
    }

    // 17. Update session analytics and fetch post-increment session totals for frontend sync.
    // increment_session_counters is awaited so orders_count is authoritative before 201 returns.
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
      Promise.resolve(supabase.from('session_events').insert({
        session_id: sid,
        restaurant_id,
        event_type: 'ORDER_PLACED',
        metadata: {
          order_id: order.id,
          order_number: nextOrderNumber,
          item_count: resolvedItems.length,
          subtotal,
        },
      })).catch((err: unknown) => {
        console.error('[spinbite:orders] session_events ORDER_PLACED failed', err);
      });

      // Trigger Decision Runtime — ORDER_PLACED unlocks dessert_interest opportunity
      void evaluateSession(sid, resolvedGuestId).catch(() => { /* runtime is self-contained */ });

      // @deprecated visit_sessions.session_interaction_log — use session_events table instead.
      // append_session_interaction writes to the JSONB column retained for backward compat only.
      Promise.resolve(supabase.rpc('append_session_interaction', {
        p_session_id: sid,
        p_event: {
          event: 'order_submitted',
          order_id: order.id,
          order_number: nextOrderNumber,
          subtotal,
          ts: new Date().toISOString(),
        },
      })).catch((err: unknown) => {
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

    console.log('[POST_ROUTE_DB]', {
      visit_session_id,
      resolved_session_id: resolvedSessionId,
      session_orders_count: sessionOrdersCount,
    });

    console.log('[spinbite:orders] created', {
      order_id: order.id,
      order_number: nextOrderNumber,
      restaurant_id,
      item_count: resolvedItems.length,
      session_orders_count: sessionOrdersCount,
    });
    return NextResponse.json({ order, session_orders_count: sessionOrdersCount, session_total_spend: sessionTotalSpend }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

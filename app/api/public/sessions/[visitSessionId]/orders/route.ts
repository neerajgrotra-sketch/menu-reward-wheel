import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase service client is not configured.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input as RequestInfo, { ...(init as RequestInit), cache: 'no-store' }),
    },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { visitSessionId: string } },
) {
  try {
    const { visitSessionId } = params;

    if (!UUID_RE.test(visitSessionId)) {
      return NextResponse.json({ error: 'Invalid session ID.' }, { status: 400 });
    }

    const supabase = makeServiceClient();

    // Verify session exists (UUID is the capability token — possession = access)
    const { data: session, error: sessionError } = await supabase
      .from('visit_sessions')
      .select('id, status, restaurant_id, orders_count')
      .eq('id', visitSessionId)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }

    console.log('[session-orders-api] sessionId', visitSessionId);

    // Fetch all orders for this session, with items
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, customer_name, table_identifier, subtotal, created_at, order_items(id, name_snapshot, quantity, effective_price_snapshot, line_total, special_instructions)',
      )
      .eq('visit_session_id', visitSessionId)
      .order('created_at', { ascending: true });

    if (ordersError) {
      console.error('[spinbite:sessions] orders fetch failed', ordersError.message);
      return NextResponse.json({ error: 'Failed to fetch session orders.' }, { status: 500 });
    }

    const orderList = orders ?? [];
    console.log('[session-orders-api] orders count', orderList.length);
    console.log('[session-orders-api] order numbers returned', orderList.map((o) => o.order_number));

    // Attach each order's payment confirmation number (payments.transaction_id),
    // if one exists — orders placed via the direct (no payment_simulation)
    // flow never have a payments row, so this stays null for them.
    const orderIds = orderList.map((o) => o.id);
    const confirmationByOrderId = new Map<string, string>();
    if (orderIds.length > 0) {
      const { data: paymentRows } = await supabase
        .from('payments')
        .select('order_id, transaction_id')
        .in('order_id', orderIds)
        .eq('status', 'succeeded');

      for (const p of paymentRows ?? []) {
        if (p.order_id) confirmationByOrderId.set(p.order_id as string, p.transaction_id as string);
      }
    }

    const ordersWithPayment = orderList.map((o) => ({
      ...o,
      payment_confirmation: confirmationByOrderId.get(o.id as string) ?? null,
    }));

    console.log('[GET_ROUTE_DB]', {
      visitSessionId,
      session_status: session.status,
      orders_count: session.orders_count,
      orders_length: orderList.length,
    });

    console.log('[ORDERS][SESSION_ORDERS_FETCHED]', { visitSessionId, orders_count: session.orders_count, returned: orderList.length });
    return NextResponse.json(
      { orders: ordersWithPayment, session_status: session.status, orders_count: session.orders_count ?? 0 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase service client is not configured.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
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
      .select('id, status, restaurant_id')
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

    return NextResponse.json({ orders: orderList, session_status: session.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

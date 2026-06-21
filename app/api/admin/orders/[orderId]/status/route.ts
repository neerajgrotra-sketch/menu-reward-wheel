import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url) throw new Error('Supabase URL is missing.');
  if (!serviceKey) throw new Error('Service key is not configured.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const STATUS_TIMESTAMP_FIELD: Partial<Record<OrderStatus, string>> = {
  preparing: 'preparing_at',
  ready: 'ready_at',
  completed: 'completed_at',
  cancelled: 'cancelled_at',
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;

    const authClient = createServerAuthClient();
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = await req.json();
    const { status: newStatus } = body as { status: string };

    const validStatuses: OrderStatus[] = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(newStatus as OrderStatus)) {
      return NextResponse.json({ error: `Invalid status: ${newStatus}` }, { status: 400 });
    }

    const supabase = makeServiceClient();

    // Fetch order and verify restaurant ownership in one query
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, restaurant_id, restaurants!inner(owner_id)')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const restaurant = (order as unknown as { restaurants: { owner_id: string } }).restaurants;
    if (restaurant.owner_id !== userData.user.id) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const currentStatus = order.status as OrderStatus;
    const target = newStatus as OrderStatus;

    const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(target)) {
      return NextResponse.json(
        { error: `Cannot transition from ${currentStatus} to ${target}.` },
        { status: 422 },
      );
    }

    const timestampField = STATUS_TIMESTAMP_FIELD[target];
    const updatePayload: Record<string, unknown> = {
      status: target,
      updated_at: new Date().toISOString(),
    };
    if (timestampField) {
      updatePayload[timestampField] = new Date().toISOString();
    }

    console.log('[spinbite:status] transition', {
      order_id: orderId,
      from: currentStatus,
      to: target,
      by: userData.user.id,
    });

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId)
      .select('id, order_number, status, updated_at')
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message || 'Update failed.' }, { status: 500 });
    }

    return NextResponse.json({ order: updated }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

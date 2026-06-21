import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { OrderTracker } from './OrderTracker';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TrackedOrder = {
  id: string;
  order_number: number;
  status: string;
  customer_name: string | null;
  table_identifier: string | null;
  subtotal: number;
  created_at: string;
  preparing_at: string | null;
  ready_at: string | null;
  restaurant_id: string;
  restaurant_name: string;
};

export type TrackedOrderItem = {
  id: string;
  name_snapshot: string;
  quantity: number;
  line_total: number;
};

// ── Server helpers ─────────────────────────────────────────────────────────────

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) throw new Error('Service client not configured.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orderId: string }>;
}): Promise<Metadata> {
  const { orderId } = await params;
  try {
    const supabase = makeServiceClient();
    const { data } = await supabase
      .from('orders')
      .select('order_number')
      .eq('id', orderId)
      .maybeSingle();
    if (!data) return { title: 'Order Tracking' };
    return { title: `Order #${(data as { order_number: number }).order_number} — SpinBite` };
  } catch {
    return { title: 'Order Tracking' };
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  let order: TrackedOrder;
  let items: TrackedOrderItem[];

  try {
    const supabase = makeServiceClient();

    const { data: orderRaw } = await supabase
      .from('orders')
      .select('id,order_number,status,customer_name,table_identifier,subtotal,created_at,preparing_at,ready_at,restaurant_id')
      .eq('id', orderId)
      .maybeSingle();

    if (!orderRaw) return notFound();

    const { data: restaurantRaw } = await supabase
      .from('restaurants')
      .select('name')
      .eq('id', (orderRaw as { restaurant_id: string }).restaurant_id)
      .maybeSingle();

    const { data: itemsRaw } = await supabase
      .from('order_items')
      .select('id,name_snapshot,quantity,line_total')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    order = {
      ...(orderRaw as Omit<TrackedOrder, 'restaurant_name'>),
      restaurant_name: (restaurantRaw as { name: string } | null)?.name ?? 'Restaurant',
    };
    items = (itemsRaw || []) as TrackedOrderItem[];
  } catch {
    return notFound();
  }

  return <OrderTracker initialOrder={order} initialItems={items} />;
}

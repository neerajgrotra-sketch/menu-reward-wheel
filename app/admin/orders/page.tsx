'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { type OrderStatus, ACTIVE_ORDER_STATUSES } from '@/lib/orders/order-status';

type OrderItem = {
  id: string;
  name_snapshot: string;
  quantity: number;
  effective_price_snapshot: number;
  line_total: number;
  special_instructions: string | null;
};

type Order = {
  id: string;
  order_number: number;
  status: OrderStatus;
  customer_name: string | null;
  table_identifier: string | null;
  subtotal: number;
  created_at: string;
  restaurant_id: string;
  order_items: OrderItem[];
};

type Restaurant = {
  id: string;
  name: string;
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  preparing: 'bg-blue-100 text-blue-800',
  ready: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-stone-100 text-stone-500',
  cancelled: 'bg-red-100 text-red-500',
};

const INBOX_STATUSES = ACTIVE_ORDER_STATUSES;

function timeElapsed(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function OrderCard({
  order,
  onStatusChange,
  transitioning,
}: {
  order: Order;
  onStatusChange: (orderId: string, newStatus: OrderStatus) => void;
  transitioning: boolean;
}) {
  const actions: Array<{ label: string; next: OrderStatus }> = [];
  if (order.status === 'pending') actions.push({ label: 'Start Preparing', next: 'preparing' });
  if (order.status === 'preparing') actions.push({ label: 'Mark Ready', next: 'ready' });
  if (order.status === 'ready') actions.push({ label: 'Complete', next: 'completed' });
  if (['pending', 'preparing', 'ready'].includes(order.status)) {
    actions.push({ label: 'Cancel', next: 'cancelled' });
  }

  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm border ${order.status === 'pending' ? 'border-amber-200' : 'border-stone-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-base font-black text-stone-800">Order #{order.order_number}</span>
          <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-black ${STATUS_COLOR[order.status]}`}>
            {STATUS_LABEL[order.status]}
          </span>
        </div>
        <span className="text-xs text-stone-400 shrink-0">{timeElapsed(order.created_at)}</span>
      </div>

      {(order.customer_name || order.table_identifier) && (
        <p className="mt-1 text-xs text-stone-500">
          {[order.customer_name, order.table_identifier].filter(Boolean).join(' · ')}
        </p>
      )}

      <ul className="mt-3 space-y-1">
        {order.order_items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-2">
            <span className="text-sm text-stone-700">
              <span className="font-bold">{item.quantity}×</span> {item.name_snapshot}
              {item.special_instructions && (
                <span className="block text-xs text-stone-400 italic">&quot;{item.special_instructions}&quot;</span>
              )}
            </span>
            <span className="shrink-0 text-sm font-semibold text-stone-600">
              ${Number(item.line_total).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
        <span className="text-sm font-black text-stone-800">
          ${Number(order.subtotal).toFixed(2)}
        </span>
        <div className="flex gap-2">
          {actions.map((action) => (
            <button
              key={action.next}
              type="button"
              disabled={transitioning}
              onClick={() => onStatusChange(order.id, action.next)}
              className={`rounded-xl px-3 py-1.5 text-xs font-black transition-opacity disabled:opacity-50 ${
                action.next === 'cancelled'
                  ? 'bg-red-100 text-red-700 active:bg-red-200'
                  : 'bg-[#FF6B00] text-white active:opacity-80'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminOrdersPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'inbox' | 'completed'>('inbox');

  const supabase = createClient();

  const fetchRestaurant = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from('restaurants')
      .select('id,name')
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    return data as Restaurant | null;
  }, [supabase]);

  const fetchOrders = useCallback(async (restaurantId: string) => {
    const { data, error: err } = await (supabase as any)
      .from('orders')
      .select('id,order_number,status,customer_name,table_identifier,subtotal,created_at,restaurant_id,order_items(id,name_snapshot,quantity,effective_price_snapshot,line_total,special_instructions)')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (err) throw new Error((err as { message: string }).message);
    return (data || []) as Order[];
  }, [supabase]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rest = await fetchRestaurant();
        if (cancelled) return;
        if (!rest) {
          setError('No restaurant found for your account.');
          setLoading(false);
          return;
        }
        setRestaurant(rest);
        const loaded = await fetchOrders(rest.id);
        if (!cancelled) setOrders(loaded);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load orders.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchRestaurant, fetchOrders]);

  // Realtime subscription
  useEffect(() => {
    if (!restaurant) return;

    const channel = supabase
      .channel(`orders:restaurant:${restaurant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        async () => {
          // Re-fetch full order list with items on any change
          try {
            const updated = await fetchOrders(restaurant.id);
            setOrders(updated);
          } catch {
            // Non-fatal: existing orders remain visible
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurant, supabase, fetchOrders]);

  async function handleStatusChange(orderId: string, newStatus: OrderStatus) {
    setTransitioning((prev) => new Set(prev).add(orderId));
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Status update failed.');
      }
      // Realtime will update the list; optimistic update for speed
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)),
      );
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setTransitioning((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  }

  const inboxOrders = orders.filter((o) => INBOX_STATUSES.includes(o.status));
  const completedOrders = orders.filter((o) => o.status === 'completed' || o.status === 'cancelled');

  const displayed = activeTab === 'inbox' ? inboxOrders : completedOrders;

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FFF8F0] p-4">
        <p className="text-center text-sm text-stone-400 pt-12">Loading orders…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#FFF8F0] p-4">
        <p className="text-center text-sm text-red-500 pt-12">{error}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FFF8F0]">
      <div className="mx-auto max-w-2xl px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-black text-[#FF6B00]">Orders</h1>
          {restaurant && (
            <p className="text-sm text-stone-500">{restaurant.name}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-2">
          {(['inbox', 'completed'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-4 py-2 text-sm font-black transition-colors ${
                activeTab === tab
                  ? 'bg-[#FF6B00] text-white'
                  : 'bg-white text-stone-500 shadow-sm'
              }`}
            >
              {tab === 'inbox' ? `Inbox (${inboxOrders.length})` : `Completed (${completedOrders.length})`}
            </button>
          ))}
        </div>

        {/* Order list */}
        {displayed.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="text-stone-400 text-sm">
              {activeTab === 'inbox' ? 'No active orders right now.' : 'No completed orders yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayed.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onStatusChange={handleStatusChange}
                transitioning={transitioning.has(order.id)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

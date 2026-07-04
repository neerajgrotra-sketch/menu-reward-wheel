'use client';

import { useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionOrder = {
  id: string;
  order_number: number;
  status: string;
  customer_name: string | null;
  subtotal: number;
  created_at: string;
  payment_confirmation: string | null;
  order_items: Array<{
    id: string;
    name_snapshot: string;
    quantity: number;
    effective_price_snapshot: number;
    line_total: number;
    special_instructions: string | null;
  }>;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TICK_MS = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'Pending', preparing: 'Preparing',
    ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled',
  };
  return map[status] ?? status;
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    preparing: 'bg-blue-100 text-blue-800',
    ready: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-stone-100 text-stone-500',
    cancelled: 'bg-red-100 text-red-500',
  };
  return map[status] ?? 'bg-stone-100 text-stone-600';
}

export function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

// ─── Orders Drawer ─────────────────────────────────────────────────────────────

export function OrdersDrawer({
  orders,
  brandColor,
  touchpointLabel,
  onClose,
  fetching,
}: {
  orders: SessionOrder[];
  brandColor: string;
  touchpointLabel: string;
  onClose: () => void;
  fetching: boolean;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);
  void tick;

  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  const totalSpend = orders.reduce((s, o) => s + Number(o.subtotal), 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />

      <div className="relative z-10 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl">
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-stone-300" />
        </div>

        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
          <div>
            <h2 className="text-lg font-black text-stone-900">My Orders</h2>
            <p className="text-xs font-semibold text-stone-400">{touchpointLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close orders"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-600 active:bg-stone-200"
          >
            ✕
          </button>
        </div>

        {orders.length > 0 && (
          <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-5 py-2.5">
            <p className="text-xs font-semibold text-stone-500">
              {orders.length} order{orders.length !== 1 ? 's' : ''} this session
            </p>
            <p className="text-sm font-black text-stone-800">
              Total ${totalSpend.toFixed(2)}
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-8">
          {orders.length === 0 && fetching ? (
            <p className="py-12 text-center text-sm text-stone-400">Loading orders…</p>
          ) : orders.length === 0 ? (
            <p className="py-12 text-center text-sm text-stone-400">No orders placed yet.</p>
          ) : (
            orders.slice().reverse().map((order) => (
              <div
                key={order.id}
                className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-stone-900">
                      Order #{order.order_number}
                    </p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${statusColor(order.status)}`}>
                      {statusLabel(order.status)}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-stone-400">
                    {relativeTime(order.created_at)}
                  </p>
                </div>

                {order.customer_name && (
                  <p className="mt-1 text-xs font-semibold text-stone-500">
                    Ordered by {order.customer_name}
                  </p>
                )}

                <div className="mt-2 space-y-0.5">
                  {order.order_items.map((item) => (
                    <p key={item.id} className="text-xs text-stone-600">
                      {item.quantity}× {item.name_snapshot}
                    </p>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2">
                  <p className="text-xs font-semibold text-stone-400">Subtotal</p>
                  <p className="text-sm font-black text-stone-800">
                    ${Number(order.subtotal).toFixed(2)}
                  </p>
                </div>

                {order.payment_confirmation && (
                  <p className="mt-2 text-[10px] text-stone-400">
                    Payment confirmation{' '}
                    <span className="font-mono font-semibold text-stone-500">
                      {order.payment_confirmation}
                    </span>
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

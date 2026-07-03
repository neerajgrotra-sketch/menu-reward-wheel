'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TrackedOrder, TrackedOrderItem } from './page';

type Props = {
  initialOrder: TrackedOrder;
  initialItems: TrackedOrderItem[];
};

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';

const STATUS_CONFIG: Record<OrderStatus, { label: string; emoji: string; color: string; bg: string }> = {
  pending:   { label: 'Order Received',    emoji: '🕐', color: 'text-amber-700',   bg: 'bg-amber-50'   },
  preparing: { label: 'Being Prepared',    emoji: '👨‍🍳', color: 'text-blue-700',    bg: 'bg-blue-50'    },
  ready:     { label: 'Ready for Pickup!', emoji: '✅', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  completed: { label: 'Completed',         emoji: '🎉', color: 'text-stone-600',   bg: 'bg-stone-50'   },
  cancelled: { label: 'Cancelled',         emoji: '✕',  color: 'text-red-600',    bg: 'bg-red-50'     },
};

const WAIT_MESSAGE: Record<OrderStatus, string> = {
  pending:   'Your order has been received and will be started soon.',
  preparing: 'The kitchen is working on your order now.',
  ready:     'Your order is ready! Please pick it up.',
  completed: 'This order has been completed. Enjoy your meal!',
  cancelled: 'This order was cancelled. Please speak with a team member.',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function elapsed(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} mins ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

const ACTIVE_STEPS: OrderStatus[] = ['pending', 'preparing', 'ready', 'completed'];

export function OrderTracker({ initialOrder, initialItems }: Props) {
  const [order, setOrder] = useState<TrackedOrder>(initialOrder);
  const [, setTick] = useState(0);

  // Re-render every minute to keep elapsed time fresh
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Realtime subscription — anon user can SELECT orders (policy added in hardening migration)
  useEffect(() => {
    const supabase = createClient();

    const channel = (supabase as unknown as ReturnType<typeof createClient>)
      .channel(`order-track:${order.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${order.id}`,
        },
        (payload: { new: Partial<TrackedOrder> }) => {
          console.log('[spinbite:tracker] realtime:update', { order_id: order.id, new_status: payload.new.status });
          setOrder((prev) => ({ ...prev, ...payload.new }));
        },
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log('[spinbite:tracker] realtime:subscribed', { order_id: order.id });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.error('[spinbite:tracker] realtime:error', { order_id: order.id, status });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [order.id]);

  const status = order.status as OrderStatus;
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const currentStep = ACTIVE_STEPS.indexOf(status);

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-8">
      <div className="mx-auto max-w-sm space-y-5">

        {/* Restaurant + order header */}
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
            {order.restaurant_name}
          </p>
          <h1 className="mt-1 text-3xl font-black text-stone-800">
            Order #{order.order_number}
          </h1>
          {(order.customer_name || order.table_identifier) && (
            <p className="mt-1 text-sm text-stone-500">
              {[order.customer_name, order.table_identifier].filter(Boolean).join(' · ')}
            </p>
          )}
          <p className="mt-1 text-xs text-stone-400">
            Placed at {formatTime(order.created_at)} · {elapsed(order.created_at)}
          </p>
          {order.payment_confirmation && (
            <p className="mt-1 text-xs text-stone-400">
              Payment confirmation{' '}
              <span className="font-mono font-semibold text-stone-500">
                {order.payment_confirmation}
              </span>
            </p>
          )}
        </div>

        {/* Status card */}
        <div className={`rounded-3xl p-6 text-center ${config.bg}`}>
          <div className="text-5xl">{config.emoji}</div>
          <p className={`mt-3 text-xl font-black ${config.color}`}>{config.label}</p>
          <p className="mt-2 text-sm text-stone-600">{WAIT_MESSAGE[status]}</p>
        </div>

        {/* Progress steps — shown for non-cancelled orders */}
        {status !== 'cancelled' && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              {ACTIVE_STEPS.map((step, i) => {
                const done = currentStep >= i;
                const isLast = i === ACTIVE_STEPS.length - 1;
                return (
                  <div key={step} className="flex flex-1 flex-col items-center">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black transition-colors ${
                        done ? 'bg-[#FF6B00] text-white' : 'bg-stone-200 text-stone-400'
                      }`}
                    >
                      {done ? '✓' : i + 1}
                    </div>
                    <p className={`mt-1 text-[9px] font-semibold text-center leading-tight ${done ? 'text-stone-700' : 'text-stone-400'}`}>
                      {STATUS_CONFIG[step].label}
                    </p>
                    {!isLast && (
                      <div
                        className={`absolute mt-3.5 h-0.5 w-full ${done && currentStep > i ? 'bg-[#FF6B00]' : 'bg-stone-200'}`}
                        style={{ position: 'relative', top: '-18px', zIndex: -1 }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Order items */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-black uppercase tracking-wider text-stone-400">
            Your Items
          </p>
          <ul className="divide-y divide-stone-100">
            {initialItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm text-stone-700">
                  <span className="font-bold">{item.quantity}×</span> {item.name_snapshot}
                </span>
                <span className="shrink-0 text-sm font-semibold text-stone-600">
                  ${Number(item.line_total).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
            <span className="text-sm font-semibold text-stone-500">Subtotal</span>
            <span className="text-base font-black text-stone-800">
              ${Number(order.subtotal).toFixed(2)}
            </span>
          </div>
        </div>

        <p className="text-center text-xs text-stone-400">
          This page updates automatically. No need to refresh.
        </p>
      </div>
    </main>
  );
}

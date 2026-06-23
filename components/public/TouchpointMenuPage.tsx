'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RestaurantPublicPage } from '@/components/public/RestaurantPublicPage';
import type {
  PublicRestaurant,
  PublicSection,
  PublicPromotion,
  PublicReward,
} from '@/app/r/[restaurantSlug]/page';
import type { PublicTouchpoint } from '@/app/r/[restaurantSlug]/[touchpointCode]/page';

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionOrder = {
  id: string;
  order_number: number;
  status: string;
  customer_name: string | null;
  subtotal: number;
  created_at: string;
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

const SESSIONSTORE_KEY_PREFIX = 'spinbite_vs_';
const POLL_INTERVAL_MS = 15_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sessionStoreKey(touchpointCode: string): string {
  return `${SESSIONSTORE_KEY_PREFIX}${touchpointCode}`;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending',
    preparing: 'Preparing',
    ready: 'Ready for Pickup',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return labels[status] ?? status;
}

function statusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    preparing: 'bg-blue-100 text-blue-800',
    ready: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-stone-100 text-stone-500',
    cancelled: 'bg-red-100 text-red-500',
  };
  return colors[status] ?? 'bg-stone-100 text-stone-600';
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

// ─── Session Orders Panel ─────────────────────────────────────────────────────

function SessionOrdersPanel({
  visitSessionId,
  brandColor,
}: {
  visitSessionId: string;
  brandColor: string;
}) {
  const [orders, setOrders] = useState<SessionOrder[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0); // triggers re-render for relative time

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/sessions/${visitSessionId}/orders`);
      if (!res.ok) return;
      const data = await res.json();
      const fetched: SessionOrder[] = data.orders ?? [];
      setOrders(fetched);
      if (fetched.length > 0) setExpanded(true);
    } catch {
      // analytics — silent fail
    }
  }, [visitSessionId]);

  useEffect(() => {
    fetchOrders();
    const poll = setInterval(fetchOrders, POLL_INTERVAL_MS);
    const clock = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [fetchOrders]);

  // Suppress unused variable warning
  void tick;

  if (orders.length === 0) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-6">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-black text-white"
            style={{ backgroundColor: brandColor }}
          >
            {orders.length}
          </span>
          <p className="text-sm font-black text-stone-800">Table Orders</p>
        </div>
        <span className="text-xs font-semibold text-stone-400">
          {expanded ? 'Hide' : 'Show'}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-2xl border border-stone-100 bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black text-stone-800">
                    Order #{order.order_number}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black ${statusColor(order.status)}`}
                  >
                    {statusLabel(order.status)}
                  </span>
                </div>
                <p className="text-xs font-semibold text-stone-400">
                  {relativeTime(order.created_at)}
                </p>
              </div>
              <div className="mt-1.5 space-y-0.5">
                {order.order_items.map((item) => (
                  <p key={item.id} className="text-xs text-stone-500">
                    {item.quantity}× {item.name_snapshot}
                  </p>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-stone-400">Subtotal</p>
                <p className="text-sm font-black text-stone-800">
                  ${Number(order.subtotal).toFixed(2)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  restaurant: PublicRestaurant;
  sections: PublicSection[];
  promotion: PublicPromotion | null;
  promotionRewards: PublicReward[];
  orderingEnabled: boolean;
  touchpoint: PublicTouchpoint;
}

export function TouchpointMenuPage({
  restaurant,
  sections,
  promotion,
  promotionRewards,
  orderingEnabled,
  touchpoint,
}: Props) {
  const [visitSessionId, setVisitSessionId] = useState<string | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const viewBatchRef = useRef(0);
  const viewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const brandColor = restaurant.brand_color || '#FF6B00';
  const storeKey = sessionStoreKey(touchpoint.touchpoint_code);

  // ── Session resolution on mount (Task 5, 6, 7) ───────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      // Read device's known session for this touchpoint from sessionStorage
      let knownSessionId: string | null = null;
      try {
        knownSessionId = sessionStorage.getItem(storeKey);
      } catch {
        // sessionStorage unavailable (private browsing, etc.) — continue
      }

      try {
        const res = await fetch('/api/public/sessions/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant_id: restaurant.id,
            touchpoint_id: touchpoint.id,
            known_session_id: knownSessionId,
          }),
        });

        if (!res.ok || cancelled) return;

        const data = await res.json();
        const sessionId: string = data.visit_session_id;

        // Store this session in sessionStorage so returning devices are recognised
        try {
          sessionStorage.setItem(storeKey, sessionId);
        } catch {
          // sessionStorage unavailable — degrade gracefully
        }

        if (!cancelled) {
          setVisitSessionId(sessionId);
          setSessionResolved(true);
        }
      } catch {
        // Network error — degrade to sessionless mode silently
        if (!cancelled) setSessionResolved(true);
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [restaurant.id, touchpoint.id, storeKey]);

  // ── Debounced item view tracking (Task 9) ────────────────────────────────

  const handleItemViewed = useCallback(
    (itemId?: string) => {
      if (!visitSessionId) return;

      viewBatchRef.current += 1;

      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
      viewTimerRef.current = setTimeout(() => {
        const count = viewBatchRef.current;
        viewBatchRef.current = 0;

        fetch(`/api/public/sessions/${visitSessionId}/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items_viewed_count: count,
            event_type: 'item_view',
            item_id: itemId,
          }),
        }).catch(() => {/* analytics — silent fail */});
      }, 3_000);
    },
    [visitSessionId],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    };
  }, []);

  // ── Session chip label ────────────────────────────────────────────────────

  const touchpointLabel = touchpoint.section_name
    ? `${touchpoint.section_name} — ${touchpoint.name}`
    : touchpoint.name;

  return (
    <div>
      {/* Session active chip */}
      {sessionResolved && visitSessionId && (
        <div
          className="sticky top-0 z-30 flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-black text-white shadow-sm"
          style={{ backgroundColor: brandColor }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
          {touchpointLabel}
          <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
        </div>
      )}

      {/* Main public menu — passes session context down */}
      <RestaurantPublicPage
        restaurant={restaurant}
        sections={sections}
        promotion={promotion}
        promotionRewards={promotionRewards}
        orderingEnabled={orderingEnabled}
        visitSessionId={visitSessionId}
        touchpointName={touchpointLabel}
        onItemViewed={handleItemViewed}
      />

      {/* Session orders panel — appears below menu when orders exist */}
      {visitSessionId && (
        <SessionOrdersPanel
          visitSessionId={visitSessionId}
          brandColor={brandColor}
        />
      )}
    </div>
  );
}

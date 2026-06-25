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

const SS_PREFIX = 'spinbite_vs_';
const POLL_MS = 15_000;
const TICK_MS = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sessionKey(code: string) { return `${SS_PREFIX}${code}`; }
function ordersKey(code: string)  { return `${SS_PREFIX}${code}_orders`; }

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'Pending', preparing: 'Preparing',
    ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled',
  };
  return map[status] ?? status;
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    preparing: 'bg-blue-100 text-blue-800',
    ready: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-stone-100 text-stone-500',
    cancelled: 'bg-red-100 text-red-500',
  };
  return map[status] ?? 'bg-stone-100 text-stone-600';
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

// ─── Orders Drawer ─────────────────────────────────────────────────────────────
// Task 4: Full-screen drawer showing all session orders

function OrdersDrawer({
  orders,
  brandColor,
  touchpointLabel,
  onClose,
}: {
  orders: SessionOrder[];
  brandColor: string;
  touchpointLabel: string;
  onClose: () => void;
}) {
  // Local tick for relative-time re-renders without prop drilling
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);
  void tick;

  // iOS scroll lock while drawer is open
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
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />

      {/* Sheet */}
      <div className="relative z-10 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-stone-300" />
        </div>

        {/* Header */}
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

        {/* Summary bar */}
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

        {/* Order list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-8">
          {orders.length === 0 ? (
            <p className="py-12 text-center text-sm text-stone-400">No orders placed yet.</p>
          ) : (
            orders.slice().reverse().map((order) => (
              <div
                key={order.id}
                className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm"
              >
                {/* Order header */}
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

                {/* Items */}
                <div className="mt-2 space-y-0.5">
                  {order.order_items.map((item) => (
                    <p key={item.id} className="text-xs text-stone-600">
                      {item.quantity}× {item.name_snapshot}
                    </p>
                  ))}
                </div>

                {/* Subtotal */}
                <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2">
                  <p className="text-xs font-semibold text-stone-400">Subtotal</p>
                  <p className="text-sm font-black text-stone-800">
                    ${Number(order.subtotal).toFixed(2)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
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
  // ── Session state ───────────────────────────────────────────────────────────
  const [visitSessionId, setVisitSessionId] = useState<string | null>(null);
  // Task 7: false when restaurant ends the session
  const [sessionActive, setSessionActive] = useState(true);

  // ── Orders state (Task 2) ───────────────────────────────────────────────────
  const [sessionOrders, setSessionOrders] = useState<SessionOrder[]>([]);
  const [ordersDrawerOpen, setOrdersDrawerOpen] = useState(false);
  // Optimistic flag: set true when CartSheet fires onOrderPlaced so My Orders
  // button appears instantly without waiting for fetchOrders to resolve.
  const [hasOptimisticOrder, setHasOptimisticOrder] = useState(false);

  // Tracks the sequence of fetchOrders calls so stale responses never overwrite
  // a more-recent result (race condition: resolve-fetch vs handleOrderPlaced-fetch).
  const fetchOrdersSeqRef = useRef(0);

  // ── View tracking ───────────────────────────────────────────────────────────
  const viewBatchRef = useRef(0);
  const viewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const brandColor = restaurant.brand_color || '#FF6B00';
  const sKey = sessionKey(touchpoint.touchpoint_code);
  const oKey = ordersKey(touchpoint.touchpoint_code);

  // ── Task 2: Restore cached orders immediately on mount (no flicker) ─────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(oKey);
      if (raw) setSessionOrders(JSON.parse(raw) as SessionOrder[]);
    } catch { /* sessionStorage unavailable */ }
  }, [oKey]);

  // ── fetchOrders — also handles session invalidation ─────────────────────────
  const fetchOrders = useCallback(async (sid: string) => {
    // Claim a sequence number. Any response that arrives after a newer call
    // was started is discarded — prevents a stale resolve-fetch from wiping
    // out orders that a later handleOrderPlaced-fetch already wrote.
    const seq = ++fetchOrdersSeqRef.current;
    try {
      const res = await fetch(`/api/public/sessions/${sid}/orders`);
      if (!res.ok) return;
      if (seq !== fetchOrdersSeqRef.current) return; // superseded by a newer call
      const data = await res.json() as { orders?: SessionOrder[]; session_status?: string };

      if (data.session_status && data.session_status !== 'active') {
        // Restaurant ended the session — clear all session state
        try {
          sessionStorage.removeItem(sKey);
          sessionStorage.removeItem(oKey);
        } catch { /* ignore */ }
        setVisitSessionId(null);
        setSessionOrders([]);
        setHasOptimisticOrder(false);
        setSessionActive(false);
        setOrdersDrawerOpen(false);
        return;
      }

      const orders: SessionOrder[] = data.orders ?? [];
      setSessionOrders(orders);
      // Once we have real server data, the optimistic flag is no longer needed
      if (orders.length > 0) setHasOptimisticOrder(false);
      try {
        sessionStorage.setItem(oKey, JSON.stringify(orders));
      } catch { /* ignore */ }
    } catch { /* network error — silent, analytics never block */ }
  }, [sKey, oKey]);

  // ── Session resolution on mount ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      let knownSessionId: string | null = null;
      try { knownSessionId = sessionStorage.getItem(sKey); } catch { /* ignore */ }

      // Optimistically restore cached session identity before the server round-trip.
      // This eliminates the "new session" visual flash on refresh and ensures any
      // order placed during resolve latency is sent with the correct session ID.
      if (knownSessionId && !cancelled) {
        setVisitSessionId(knownSessionId);
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

        const data = await res.json() as { visit_session_id: string };
        const sessionId = data.visit_session_id;

        try { sessionStorage.setItem(sKey, sessionId); } catch { /* ignore */ }

        if (!cancelled) {
          setVisitSessionId(sessionId);
          // Immediately fetch orders so returning customers see their history
          fetchOrders(sessionId);
        }
      } catch { /* network error — session resolve failed, optimistic ID (if any) remains */ }
    }

    resolve();
    return () => { cancelled = true; };
  }, [restaurant.id, touchpoint.id, sKey, fetchOrders]);

  // ── Polling after session is known ──────────────────────────────────────────
  useEffect(() => {
    if (!visitSessionId) return;
    const poll = setInterval(() => fetchOrders(visitSessionId), POLL_MS);
    return () => clearInterval(poll);
  }, [visitSessionId, fetchOrders]);

  // ── Task 5: onOrderPlaced — optimistic update + immediate server refresh ─────
  const handleOrderPlaced = useCallback(() => {
    // Show My Orders button immediately without waiting for fetchOrders to resolve
    setHasOptimisticOrder(true);
    if (visitSessionId) fetchOrders(visitSessionId);
  }, [visitSessionId, fetchOrders]);

  // ── Debounced item view tracking ─────────────────────────────────────────────
  const handleItemViewed = useCallback((itemId?: string) => {
    if (!visitSessionId) return;
    viewBatchRef.current += 1;
    if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    viewTimerRef.current = setTimeout(() => {
      const count = viewBatchRef.current;
      viewBatchRef.current = 0;
      fetch(`/api/public/sessions/${visitSessionId}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items_viewed_count: count, event_type: 'item_view', item_id: itemId }),
      }).catch(() => {/* analytics — silent */});
    }, 3_000);
  }, [visitSessionId]);

  useEffect(() => {
    return () => { if (viewTimerRef.current) clearTimeout(viewTimerRef.current); };
  }, []);

  const touchpointLabel = touchpoint.section_name
    ? `${touchpoint.section_name} — ${touchpoint.name}`
    : touchpoint.name;

  const showSession = !!visitSessionId && sessionActive;
  const hasOrders = sessionOrders.length > 0;

  return (
    <div>
      {/* Session ribbon — informational only: touchpoint location */}
      {showSession && (
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
        onOrderPlaced={handleOrderPlaced}
        sessionOrderCount={hasOptimisticOrder ? sessionOrders.length + 1 : sessionOrders.length}
        onMyOrdersClick={() => {
          setOrdersDrawerOpen(true);
          // Fetch fresh orders each time the drawer opens so the customer
          // always sees the latest state, even if the background fetch
          // from handleOrderPlaced hasn't completed yet.
          if (visitSessionId) fetchOrders(visitSessionId);
        }}
      />

      {/* Task 4: Orders drawer */}
      {ordersDrawerOpen && (
        <OrdersDrawer
          orders={sessionOrders}
          brandColor={brandColor}
          touchpointLabel={touchpointLabel}
          onClose={() => setOrdersDrawerOpen(false)}
        />
      )}
    </div>
  );
}

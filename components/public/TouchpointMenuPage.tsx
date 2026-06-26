'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RestaurantPublicPage } from '@/components/public/RestaurantPublicPage';
import type { PlacedOrder } from '@/components/public/CartSheet';
import { useSessionTracking, useItemViewTracking } from '@/hooks/useSessionTracking';
import type {
  PublicRestaurant,
  PublicSection,
  PublicPromotion,
  PublicReward,
} from '@/app/r/[restaurantSlug]/page';
import type { PublicTouchpoint } from '@/app/r/[restaurantSlug]/[touchpointCode]/page';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionPhase = 'resolving' | 'confirmed' | 'session_ended' | 'resolve_failed';

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
const TICK_MS = 30_000;
const RESOLVE_TIMEOUT_MS = 3_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sessionKey(code: string) { return `${SS_PREFIX}${code}`; }

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

function OrdersDrawer({
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
  // ── Session state machine ───────────────────────────────────────────────────
  // Rule 1: Browser cache is NEVER authoritative. Backend is the sole authority.
  // Rule 2: candidateSessionId is read from sessionStorage as a hint ONLY, never put in state.
  // Rule 3: All transactional actions blocked until sessionPhase === 'confirmed'.
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('resolving');
  const [confirmedSessionId, setConfirmedSessionId] = useState<string | null>(null);
  const [resolveAttempt, setResolveAttempt] = useState(0);

  // ── Orders state ─────────────────────────────────────────────────────────────
  // sessionOrders is fetched fresh from the orders table on every relevant event.
  // Button count and drawer count both derive from sessionOrders.length so they
  // are always identical. visit_sessions.orders_count is analytics-only.
  const [sessionOrders, setSessionOrders] = useState<SessionOrder[]>([]);
  const [ordersDrawerOpen, setOrdersDrawerOpen] = useState(false);
  const [ordersFetching, setOrdersFetching] = useState(false);

  // ── Session intelligence tracking ────────────────────────────────────────────
  const { fireEvent } = useSessionTracking(confirmedSessionId);
  const { onItemOpen, onItemClose } = useItemViewTracking(fireEvent);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const brandColor = restaurant.brand_color || '#FF6B00';
  const sKey = sessionKey(touchpoint.touchpoint_code);

  // ── fetchOrders — always fetches from server, no local cache ─────────────────
  const fetchOrders = useCallback(async (sid: string) => {
    setOrdersFetching(true);
    console.log('[STEP_3_FETCH_ORDERS_START]', sid);
    console.log('[MYORDERS][DRAWER_FETCH]', { sid });
    try {
      const res = await fetch(`/api/public/sessions/${sid}/orders`, { cache: 'no-store' });
      console.log('[TRACE_1_STATUS]', res.status);
      if (!res.ok) return;
      const data = await res.json() as {
        orders?: SessionOrder[];
        session_status?: string;
        orders_count?: number;
      };
      console.log('[STEP_4_FETCH_RESPONSE]', { session_status: data.session_status, orders: data.orders?.length });
      console.log('[TRACE_2_RAW_RESPONSE]', data);
      console.log('[SESSION_STATUS_FROM_API]', data.session_status);

      if (data.session_status && data.session_status !== 'active') {
        try { sessionStorage.removeItem(sKey); } catch { /* ignore */ }
        setConfirmedSessionId(null);
        console.log('[STEP_5_CLEAR_ORDERS]');
        setSessionOrders([]);
        console.log('[STEP_5_PHASE_CHANGE]', 'session_ended (status_check)');
        setSessionPhase('session_ended');
        setOrdersDrawerOpen(false);
        console.log('[SESSION][PHASE_TRANSITION]', { to: 'session_ended', reason: 'session_status', status: data.session_status });
        return;
      }

      const orders = data.orders ?? [];
      console.log('[TRACE_3_ORDERS_BEFORE_SET]', orders);
      console.log('[STEP_5_SET_ORDERS]', orders.length);
      setSessionOrders(orders);
      console.log('[TRACE_4_SET_SESSION_ORDERS]', orders.length);
    } catch { /* network error — silent */ }
    finally {
      setOrdersFetching(false);
    }
  }, [sKey]);

  // ── Session resolution — runs on mount and on explicit retry ─────────────────
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

    console.log('[STEP_5_PHASE_CHANGE]', 'resolving');
    setSessionPhase('resolving');
    setConfirmedSessionId(null);

    async function resolve() {
      // candidateSessionId is a hint ONLY — never assigned to state directly
      let candidateSessionId: string | null = null;
      try { candidateSessionId = sessionStorage.getItem(sKey); } catch { /* ignore */ }

      console.log('[SESSION][RESOLVE_START]', { candidateSessionId, attempt: resolveAttempt });

      try {
        const res = await fetch('/api/public/sessions/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant_id: restaurant.id,
            touchpoint_id: touchpoint.id,
            known_session_id: candidateSessionId,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        if (cancelled) return;

        if (!res.ok) {
          console.log('[SESSION][PHASE_TRANSITION]', { to: 'resolve_failed', reason: 'non_ok_response' });
          console.log('[STEP_5_PHASE_CHANGE]', 'resolve_failed (non_ok)');
          setSessionPhase('resolve_failed');
          return;
        }

        const data = await res.json() as { visit_session_id: string };
        const sessionId = data.visit_session_id;

        // Write confirmed session to cache so future resolves can send the correct hint
        try { sessionStorage.setItem(sKey, sessionId); } catch { /* ignore */ }

        setConfirmedSessionId(sessionId);
        console.log('[STEP_5_PHASE_CHANGE]', 'confirmed');
        setSessionPhase('confirmed');
        console.log('[SESSION][PHASE_TRANSITION]', { to: 'confirmed', confirmedSessionId: sessionId });
        fetchOrders(sessionId);
        // Fire MENU_OPENED once per session confirm — first intelligence event
        fetch(`/api/public/sessions/${sessionId}/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_type: 'MENU_OPENED', metadata: { touchpoint_code: touchpoint.touchpoint_code } }),
        }).catch(() => { /* analytics — silent */ });
      } catch (err) {
        if (cancelled) return;
        clearTimeout(timeout);
        const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout_3000ms' : 'network_error';
        console.log('[SESSION][PHASE_TRANSITION]', { to: 'resolve_failed', reason });
        console.log('[STEP_5_PHASE_CHANGE]', `resolve_failed (${reason})`);
        setSessionPhase('resolve_failed');
      }
    }

    resolve();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  // resolveAttempt is the retry counter — incrementing it re-runs this effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant.id, touchpoint.id, sKey, resolveAttempt, fetchOrders]);

  // ── Supabase realtime subscription — order INSERT/UPDATE triggers a server refetch ─
  useEffect(() => {
    if (!confirmedSessionId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`session-orders-${confirmedSessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `visit_session_id=eq.${confirmedSessionId}`,
        },
        () => {
          console.log('[MYORDERS][REALTIME_EVENT]', { confirmedSessionId });
          fetchOrders(confirmedSessionId);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [confirmedSessionId, fetchOrders]);

  // ── Retry resolve ────────────────────────────────────────────────────────────
  const retryResolve = useCallback(() => {
    setResolveAttempt((n) => n + 1);
  }, []);

  // ── Order placed — optimistic append + deferred background reconcile ────────
  // No immediate GET: the order is appended locally from the POST response to
  // avoid the read-after-write race on the session orders endpoint.
  // After 2 s the server is queried and its truth replaces local state.
  const handleOrderPlaced = useCallback((placedOrder: PlacedOrder) => {
    console.log('[STEP_2_ON_ORDER_PLACED]', { order_id: placedOrder.id, session_orders_count: placedOrder.session_orders_count });

    // Append the new order immediately from POST response data.
    setSessionOrders((prev) => [
      ...prev,
      {
        id: placedOrder.id,
        order_number: placedOrder.order_number,
        status: placedOrder.status,
        customer_name: placedOrder.customer_name,
        subtotal: placedOrder.subtotal,
        created_at: placedOrder.created_at,
        order_items: placedOrder.order_items,
      },
    ]);

    // Background reconcile: let the DB settle, then replace with server truth.
    if (confirmedSessionId) {
      const sid = confirmedSessionId;
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
      reconcileTimerRef.current = setTimeout(() => {
        fetchOrders(sid);
      }, 2000);
    }
  }, [confirmedSessionId, fetchOrders]);

  // ── Session ended (from 409 in CartSheet) ───────────────────────────────────
  const handleSessionEnded = useCallback(() => {
    try { sessionStorage.removeItem(sKey); } catch { /* ignore */ }
    setConfirmedSessionId(null);
    console.log('[STEP_5_CLEAR_ORDERS]');
    setSessionOrders([]);
    console.log('[STEP_5_PHASE_CHANGE]', 'session_ended (409)');
    setSessionPhase('session_ended');
    console.log('[SESSION][PHASE_TRANSITION]', { to: 'session_ended', reason: '409_session_invalid' });
  }, [sKey]);

  useEffect(() => {
    return () => {
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
    };
  }, []);

  const touchpointLabel = touchpoint.section_name
    ? `${touchpoint.section_name} — ${touchpoint.name}`
    : touchpoint.name;

  const ordersLength = sessionOrders.length;
  const showMyOrders = sessionPhase === 'confirmed' && ordersLength > 0;
  console.log('[TRACE_5_RENDER]', {
    sessionPhase,
    ordersCount: ordersLength,
    sessionOrdersLength: sessionOrders.length,
    showMyOrders,
  });

  return (
    <div>
      {/* Session ribbon — shown only when session is confirmed */}
      {sessionPhase === 'confirmed' && (
        <div
          className="sticky top-0 z-30 flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-black text-white shadow-sm"
          style={{ backgroundColor: brandColor }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
          {touchpointLabel}
          <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
        </div>
      )}

      {/* Connecting banner */}
      {sessionPhase === 'resolving' && (
        <div className="sticky top-0 z-30 flex items-center justify-center gap-2 px-4 py-1.5 bg-stone-100 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-stone-400 animate-pulse" />
          <span className="text-xs font-semibold text-stone-500">
            Connecting to {touchpointLabel}…
          </span>
        </div>
      )}

      {/* Resolve failed banner + retry */}
      {sessionPhase === 'resolve_failed' && (
        <div className="sticky top-0 z-30 flex items-center justify-center gap-3 px-4 py-1.5 bg-red-50 shadow-sm">
          <span className="text-xs font-semibold text-red-600">
            Unable to connect to table session.
          </span>
          <button
            type="button"
            onClick={retryResolve}
            className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700 active:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Session ended banner */}
      {sessionPhase === 'session_ended' && (
        <div className="sticky top-0 z-30 flex items-center justify-center px-4 py-1.5 bg-amber-50 shadow-sm">
          <span className="text-xs font-semibold text-amber-700">
            Your dining session has ended. Please rescan the QR code to order.
          </span>
        </div>
      )}

      {/* Main public menu — always renders regardless of session phase.
          Promotions, menu browsing, and AI recommendations are always accessible.
          Transactional actions are gated by sessionConfirmed inside RestaurantPublicPage. */}
      <RestaurantPublicPage
        restaurant={restaurant}
        sections={sections}
        promotion={promotion}
        promotionRewards={promotionRewards}
        orderingEnabled={orderingEnabled}
        confirmedSessionId={confirmedSessionId}
        touchpointName={touchpointLabel}
        onItemViewed={onItemOpen}
        onItemClosed={onItemClose}
        onOrderPlaced={handleOrderPlaced}
        sessionOrderCount={sessionOrders.length}
        sessionConfirmed={sessionPhase === 'confirmed'}
        onMyOrdersClick={() => {
          setOrdersDrawerOpen(true);
          if (confirmedSessionId) fetchOrders(confirmedSessionId);
          console.log('[MYORDERS][RENDER]', { ordersLen: sessionOrders.length, sessionPhase, confirmedSessionId });
        }}
        onSessionEnded={handleSessionEnded}
      />

      {ordersDrawerOpen && (
        <OrdersDrawer
          orders={sessionOrders}
          brandColor={brandColor}
          touchpointLabel={touchpointLabel}
          onClose={() => setOrdersDrawerOpen(false)}
          fetching={ordersFetching}
        />
      )}
    </div>
  );
}

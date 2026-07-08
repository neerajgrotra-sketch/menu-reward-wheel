'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RestaurantPublicPage } from '@/components/public/RestaurantPublicPage';
import { GuestNameModal } from '@/components/public/GuestNameModal';
import { SessionGuestListPopover } from '@/components/public/SessionGuestListPopover';
import { OrdersDrawer, type SessionOrder } from '@/components/public/OrdersDrawer';
import type { PlacedOrder } from '@/components/public/CartSheet';
import { useSessionTracking, useItemViewTracking } from '@/hooks/useSessionTracking';
import { clearStoredCart } from '@/hooks/useCart';
import type {
  PublicRestaurant,
  PublicSection,
  PublicPromotion,
  PublicReward,
} from '@/app/r/[restaurantSlug]/page';
import type { PublicTouchpoint } from '@/app/r/[restaurantSlug]/[touchpointCode]/page';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionPhase = 'resolving' | 'confirmed' | 'session_ended' | 'resolve_failed';

// ─── Constants ────────────────────────────────────────────────────────────────

const SS_PREFIX = 'spinbite_vs_';
const TICK_MS = 30_000;
const RESOLVE_TIMEOUT_MS = 3_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sessionKey(code: string) { return `${SS_PREFIX}${code}`; }

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  restaurant: PublicRestaurant;
  sections: PublicSection[];
  promotion: PublicPromotion | null;
  promotionRewards: PublicReward[];
  orderingEnabled: boolean;
  paymentSimulationEnabled?: boolean;
  taxRatePercent?: number;
  serviceFeePercent?: number;
  touchpoint: PublicTouchpoint;
}

export function TouchpointMenuPage({
  restaurant,
  sections,
  promotion,
  promotionRewards,
  orderingEnabled,
  paymentSimulationEnabled = false,
  taxRatePercent = 0,
  serviceFeePercent = 0,
  touchpoint,
}: Props) {
  // ── Session state machine ───────────────────────────────────────────────────
  // Rule 1: Browser cache is NEVER authoritative. Backend is the sole authority.
  // Rule 2: candidateSessionId is read from sessionStorage as a hint ONLY, never put in state.
  // Rule 3: All transactional actions blocked until sessionPhase === 'confirmed'.
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('resolving');
  const [confirmedSessionId, setConfirmedSessionId] = useState<string | null>(null);
  const [resolveAttempt, setResolveAttempt] = useState(0);

  // Session-ended redirect countdown — once staff closes the dining session,
  // there's nothing left for the guest to do at this table's URL, so after a
  // short grace period to read the message we send them somewhere useful:
  // the restaurant's own site if they've set one, otherwise this restaurant's
  // SpinBite page (no table/touchpoint context, so it doesn't just re-trigger
  // the same "closed" state).
  const SESSION_ENDED_REDIRECT_SECONDS = 10;
  const [sessionEndedCountdown, setSessionEndedCountdown] = useState(SESSION_ENDED_REDIRECT_SECONDS);
  useEffect(() => {
    if (sessionPhase !== 'session_ended') {
      setSessionEndedCountdown(SESSION_ENDED_REDIRECT_SECONDS);
      return;
    }
    const timer = window.setInterval(() => {
      setSessionEndedCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          clearStoredCart();
          window.location.href = restaurant.website_url || `/r/${restaurant.slug}`;
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sessionPhase, restaurant.website_url, restaurant.slug]);

  // ── Guest identity state (V1) ────────────────────────────────────────────────
  // guestId:    session_guests.id returned by the resolve API. Used for event + order attribution.
  // guestToken: opaque bearer credential for heartbeat + name update calls.
  // guestName:  captured via GuestNameModal; persisted in sessionStorage across soft navigations.
  // showNameModal: true once after session confirm when no stored name exists for this session.
  const [guestId, setGuestId] = useState<string | null>(null);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);

  // ── Presence state ───────────────────────────────────────────────────────────
  // activeGuestCount: null = not yet fetched, number = the database's current
  // count (session_guests, status='active'). Always set directly from the API
  // response — never merged with a prior value. See the presence effect below.
  const [activeGuestCount, setActiveGuestCount] = useState<number | null>(null);

  // ── Guest list popover ───────────────────────────────────────────────────────
  const [guestListOpen, setGuestListOpen] = useState(false);

  // ── Orders state ─────────────────────────────────────────────────────────────
  // sessionOrders is fetched fresh from the orders table on every relevant event.
  // Button count and drawer count both derive from sessionOrders.length so they
  // are always identical. visit_sessions.orders_count is analytics-only.
  const [sessionOrders, setSessionOrders] = useState<SessionOrder[]>([]);
  const [ordersDrawerOpen, setOrdersDrawerOpen] = useState(false);
  const [ordersFetching, setOrdersFetching] = useState(false);

  // ── Session intelligence tracking ────────────────────────────────────────────
  // Pass guestId (session_guests.id) so all events link to the named guest record.
  const { fireEvent } = useSessionTracking(confirmedSessionId, guestId);
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
        setGuestListOpen(false);
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

      // If we've resolved this session before (e.g. a page refresh), send our
      // existing guest_token so the server reattaches to the same session_guests
      // row instead of creating a duplicate one. Best-effort hint only — if the
      // session turned out to be stale/recreated server-side, the token simply
      // won't match and a fresh guest row is created, same as having none.
      let candidateGuestToken: string | null = null;
      if (candidateSessionId) {
        try {
          const stored = sessionStorage.getItem(`spinbite_guest_${candidateSessionId}`);
          if (stored) candidateGuestToken = (JSON.parse(stored) as { guest_token?: string }).guest_token ?? null;
        } catch { /* ignore */ }
      }

      console.log('[SESSION][RESOLVE_START]', { candidateSessionId, hasGuestToken: !!candidateGuestToken, attempt: resolveAttempt });

      try {
        const res = await fetch('/api/public/sessions/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant_id: restaurant.id,
            touchpoint_id: touchpoint.id,
            known_session_id: candidateSessionId,
            known_guest_token: candidateGuestToken,
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

        const data = await res.json() as {
          visit_session_id: string;
          guest_id?: string;
          guest_token?: string;
        };
        const sessionId = data.visit_session_id;
        const serverGuestId = data.guest_id || null;
        const serverGuestToken = data.guest_token || null;

        // Write confirmed session to cache so future resolves can send the correct hint
        try { sessionStorage.setItem(sKey, sessionId); } catch { /* ignore */ }

        // Persist guest identity so a page refresh reattaches to this exact
        // session_guests row (via known_guest_token above) instead of the
        // server minting a brand new one every reload.
        if (serverGuestToken) {
          try {
            sessionStorage.setItem(
              `spinbite_guest_${sessionId}`,
              JSON.stringify({ guest_token: serverGuestToken, guest_id: serverGuestId, visit_session_id: sessionId }),
            );
          } catch { /* ignore */ }
        }

        setGuestId(serverGuestId);
        setGuestToken(serverGuestToken);
        setConfirmedSessionId(sessionId);
        console.log('[STEP_5_PHASE_CHANGE]', 'confirmed');
        setSessionPhase('confirmed');
        console.log('[SESSION][PHASE_TRANSITION]', { to: 'confirmed', confirmedSessionId: sessionId });
        fetchOrders(sessionId);

        // ── Guest identity: name persistence across reconnects ─────────────────
        // Check if this guest already entered their name in a previous tab session.
        const nameKey = `spinbite_gn_${sessionId}`;
        let storedName: string | null = null;
        try { storedName = sessionStorage.getItem(nameKey); } catch { /* ignore */ }

        if (storedName && serverGuestToken) {
          // Reconnect with stored name — silently apply it to the new session_guests row
          setGuestName(storedName);
          fetch(`/api/public/sessions/${sessionId}/guest-name`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guest_token: serverGuestToken, guest_name: storedName }),
          }).catch(() => { /* non-fatal */ });
        } else if (!storedName && serverGuestId) {
          // First visit — show the identity modal once the menu has loaded
          setShowNameModal(true);
        }

        // Fire MENU_OPENED once per session confirm — first intelligence event
        fetch(`/api/public/sessions/${sessionId}/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: 'MENU_OPENED',
            guest_id: serverGuestId,
            metadata: { touchpoint_code: touchpoint.touchpoint_code },
          }),
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

  // ── Presence — guest count + live updates + session-end detection ────────────
  //
  // session_guests (via GET /presence) is the ONLY source of truth for the
  // displayed count. Supabase Presence is transport only — a 'sync' event
  // means "something changed, go re-read the database," never a number to
  // display directly. No Math.max ratchet: every fetch REPLACES the count,
  // it never merges with a locally-remembered high-water mark. That ratchet
  // was the root cause of the ribbon showing a higher, stale count than the
  // guest list popover (2026-07-01 audit) — a transient presence blip (e.g.
  // the brief overlap between a tab's old and new WebSocket connection on
  // refresh) would get "locked in" forever since Math.max never decreases.
  useEffect(() => {
    if (!confirmedSessionId) return;

    const sid = confirmedSessionId;

    async function fetchPresence() {
      try {
        const res = await fetch(`/api/public/sessions/${sid}/presence`);
        if (!res.ok) return;
        const data = await res.json() as { active_guest_count: number; session_active: boolean };

        if (!data.session_active) {
          // Admin ended the session — transition immediately
          try { sessionStorage.removeItem(sKey); } catch { /* ignore */ }
          setConfirmedSessionId(null);
          setSessionOrders([]);
          setSessionPhase('session_ended');
          setGuestListOpen(false);
          return;
        }

        // Always replace — the DB value is authoritative, not a floor.
        setActiveGuestCount(data.active_guest_count);
      } catch { /* network error — silent */ }
    }

    fetchPresence();
    const pollId = setInterval(fetchPresence, TICK_MS);

    // Supabase Presence: notification transport only. A 'sync' event (another
    // tab joined/left) triggers an immediate re-fetch of the real count from
    // the database — it never supplies a count itself.
    const supabase = createClient();
    const presenceChannel = supabase.channel(`table-presence:${sid}`);

    presenceChannel
      .on('presence', { event: 'sync' }, () => { fetchPresence(); })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ joined_at: new Date().toISOString() });
        }
      });

    return () => {
      clearInterval(pollId);
      void supabase.removeChannel(presenceChannel);
    };
  }, [confirmedSessionId, sKey]);

  // ── Heartbeat — keeps THIS device's session_guests row from going stale ──────
  //
  // update_stale_guest_presence() flips status active → inactive after 3
  // minutes with no last_seen_at refresh, unconditionally, for every guest.
  // Without a heartbeat call, every guest goes stale exactly 3 minutes after
  // joining regardless of whether they're still on the page — this was a
  // confirmed root cause of guests silently dropping out of the active count
  // during the 2026-07-01 multi-device join investigation. guest_token is
  // the bearer credential; nothing to send without it.
  useEffect(() => {
    if (!confirmedSessionId || !guestToken) return;

    const token = guestToken;

    async function sendHeartbeat() {
      try {
        const res = await fetch(`/api/public/sessions/${confirmedSessionId}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guest_token: token }),
        });
        if (!res.ok) return;
        const data = await res.json() as { active: boolean };
        if (!data.active) {
          // Redundant with the presence-poll/broadcast session-end paths —
          // safety net only, matches the existing multi-layer fallback design.
          try { sessionStorage.removeItem(sKey); } catch { /* ignore */ }
          setConfirmedSessionId(null);
          setSessionOrders([]);
          setSessionPhase('session_ended');
          setGuestListOpen(false);
        }
      } catch { /* network error — next tick retries */ }
    }

    sendHeartbeat();
    const heartbeatId = setInterval(sendHeartbeat, TICK_MS);
    return () => clearInterval(heartbeatId);
  }, [confirmedSessionId, guestToken, sKey]);

  // Reset guest count when session changes (new resolve cycle)
  useEffect(() => {
    if (!confirmedSessionId) setActiveGuestCount(null);
  }, [confirmedSessionId]);

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
        payment_confirmation: placedOrder.payment_confirmation_number ?? null,
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
    setGuestListOpen(false);
    console.log('[SESSION][PHASE_TRANSITION]', { to: 'session_ended', reason: '409_session_invalid' });
  }, [sKey]);

  // ── Session lifecycle — instant termination via Supabase Broadcast ────────────
  // The session end route broadcasts 'session_ended' to this channel via the
  // Realtime REST API when the admin clicks End Session. No RLS needed for Broadcast.
  // This fires in < 1s — far faster than the 30s presence poll fallback.
  useEffect(() => {
    if (!confirmedSessionId) return;
    const sid = confirmedSessionId;
    const supabase = createClient();
    const channel = supabase
      .channel(`session-lifecycle:${sid}`)
      .on('broadcast', { event: 'session_ended' }, () => {
        handleSessionEnded();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [confirmedSessionId, handleSessionEnded]);

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
          className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-1.5 text-xs font-black text-white shadow-sm"
          style={{ backgroundColor: brandColor }}
        >
          {/* Pulsing green beacon + table label */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="truncate">{touchpointLabel}</span>
          </div>

          {/* Live guest count — tap to view connected diners */}
          {activeGuestCount !== null && (
            <button
              type="button"
              onClick={() => {
                if (sessionPhase === 'confirmed' && confirmedSessionId) setGuestListOpen(true);
              }}
              aria-label="View connected diners"
              className="shrink-0 flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-black tabular-nums active:bg-white/30"
            >
              <span aria-hidden="true">👥</span>
              <span>{activeGuestCount}</span>
            </button>
          )}
        </div>
      )}

      {confirmedSessionId && (
        <SessionGuestListPopover
          sessionId={confirmedSessionId}
          tableLabel={touchpointLabel}
          open={guestListOpen}
          onClose={() => setGuestListOpen(false)}
        />
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
        <div className="sticky top-0 z-30 flex items-center justify-center gap-2 px-4 py-1.5 bg-red-600 shadow-sm">
          <span className="text-xs font-black text-white">🔴 Session Ended</span>
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
        paymentSimulationEnabled={paymentSimulationEnabled}
        taxRatePercent={taxRatePercent}
        serviceFeePercent={serviceFeePercent}
        confirmedSessionId={confirmedSessionId}
        guestId={guestId}
        guestName={guestName}
        touchpointName={touchpointLabel}
        touchpointCode={touchpoint.touchpoint_code}
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
        onItemAddedToCart={(itemId, itemName, quantity, priceSnapshot, effectivePriceSnapshot, source, specialInstructionsPresent) => {
          fireEvent('ITEM_ADDED_TO_CART', {
            menuItemId: itemId,
            metadata: {
              item_id: itemId,
              item_name: itemName,
              quantity,
              price_snapshot: priceSnapshot,
              effective_price_snapshot: effectivePriceSnapshot,
              source,
              special_instructions_present: specialInstructionsPresent,
            },
          });
        }}
        onItemRemovedFromCart={(itemId, itemName, quantityRemoved, previousQuantity, cartSubtotalBefore, cartSubtotalAfter) => {
          fireEvent('ITEM_REMOVED_FROM_CART', {
            menuItemId: itemId,
            metadata: {
              item_id: itemId,
              item_name: itemName,
              quantity_removed: quantityRemoved,
              previous_quantity: previousQuantity,
              cart_subtotal_before: cartSubtotalBefore,
              cart_subtotal_after: cartSubtotalAfter,
            },
          });
        }}
        onCategoryOpened={(categoryId, categoryName, previousCategoryId, previousCategoryName) => {
          fireEvent('CATEGORY_OPENED', {
            metadata: {
              category_id: categoryId,
              category_name: categoryName,
              previous_category_id: previousCategoryId,
              previous_category_name: previousCategoryName,
            },
          });
        }}
        onPromotionViewed={(promotionId, promotionName, source) => {
          fireEvent('PROMOTION_VIEWED', {
            promotionId,
            metadata: { promotion_name: promotionName, source },
          });
        }}
        onPromotionPlayed={(promotionId, promotionName, source, gameType) => {
          fireEvent('PROMOTION_PLAYED', {
            promotionId,
            metadata: { promotion_name: promotionName, source, game_type: gameType },
          });
        }}
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

      {/* Guest name capture — lightweight optional modal, shown once after session confirm. */}
      {showNameModal && confirmedSessionId && guestToken && (
        <GuestNameModal
          restaurantName={restaurant.name}
          brandColor={brandColor}
          sessionId={confirmedSessionId}
          guestToken={guestToken}
          onConfirm={(name) => {
            setGuestName(name);
            setShowNameModal(false);
            try { sessionStorage.setItem(`spinbite_gn_${confirmedSessionId}`, name); } catch { /* ignore */ }
          }}
          onSkip={() => setShowNameModal(false)}
        />
      )}

      {/* Blocking modal — appears instantly when admin ends session.
          fixed inset-0 covers the entire viewport; no close button by design.
          All ordering, cart, and interactions are blocked beneath it. */}
      {sessionPhase === 'session_ended' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 px-6">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl">
            <div className="mb-4 text-5xl">🔴</div>
            <h2 className="mb-3 text-xl font-black text-stone-900">Dining Session Closed</h2>
            <p className="text-sm leading-relaxed text-stone-500">
              This dining session has been ended by restaurant staff.
              <br />
              Please scan again to start a new session.
            </p>
            <p className="mt-5 text-xs font-bold uppercase tracking-wide text-stone-400">
              Redirecting in {sessionEndedCountdown}s…
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

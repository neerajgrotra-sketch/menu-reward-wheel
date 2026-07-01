'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RestaurantPublicPage } from '@/components/public/RestaurantPublicPage';
import { SessionGuestListPopover } from '@/components/public/SessionGuestListPopover';
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
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Guest Name Modal ─────────────────────────────────────────────────────────
// Shown once per session after resolve, if the guest has not yet provided a name.
// Optional — the guest may skip. Lightweight and non-blocking.

function GuestNameModal({
  restaurantName,
  brandColor,
  sessionId,
  guestToken,
  onConfirm,
  onSkip,
}: {
  restaurantName: string;
  brandColor: string;
  sessionId: string;
  guestToken: string;
  onConfirm: (name: string) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    const trimmed = name.trim();
    if (!trimmed) { onSkip(); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/sessions/${sessionId}/guest-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_token: guestToken, guest_name: trimmed }),
      });
      // A non-ok response (e.g. 403 "invalid guest token" — this guest's
      // session_guests row doesn't exist, most likely because the earlier
      // resolve's insert silently failed) means the name was NOT saved
      // server-side. This must not be swallowed: it was previously a silent
      // failure mode that made a guest invisible in the connected-diners list
      // while their own device showed the name as accepted (2026-07-01
      // multi-device join investigation).
      if (!res.ok) {
        console.error('[spinbite:guest-name] save failed', { status: res.status, sessionId });
      }
    } catch (err) {
      console.error('[spinbite:guest-name] network error', err);
    }
    onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="px-6 pt-5 pb-4" style={{ borderBottom: `2px solid ${brandColor}20` }}>
          <p
            className="text-[10px] font-black uppercase tracking-widest mb-0.5"
            style={{ color: brandColor }}
          >
            Welcome
          </p>
          <h2 className="text-lg font-black text-stone-900 leading-tight">{restaurantName}</h2>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-stone-700">
              Enter your first name
            </p>
            <p className="mt-0.5 text-xs text-stone-400">Optional — you can skip this.</p>
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 32))}
            placeholder="Your first name"
            autoFocus
            autoComplete="given-name"
            className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm font-semibold text-stone-900 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-300"
            onKeyDown={(e) => { if (e.key === 'Enter') { handleConfirm(); } }}
          />

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="w-full rounded-xl py-3 text-sm font-black text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: brandColor }}
            >
              {submitting ? 'Saving…' : name.trim() ? 'Continue' : 'Skip'}
            </button>
            {name.trim() !== '' && (
              <button
                type="button"
                onClick={onSkip}
                className="w-full rounded-xl py-2.5 text-sm font-semibold text-stone-500 active:bg-stone-50"
              >
                Skip
              </button>
            )}
          </div>
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
          </div>
        </div>
      )}
    </div>
  );
}

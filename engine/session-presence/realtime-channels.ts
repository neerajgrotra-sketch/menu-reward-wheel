// ── Realtime Channel Architecture — Session Presence Engine ──────────────────
//
// Defines the channel naming contracts and payload shapes for all Supabase
// Realtime subscriptions used by the presence layer.
//
// CURRENT STATE: Architecture-only. No live subscriptions are wired.
//
// SUBSCRIPTION MAP:
//
//   Channel A — per-session presence updates
//   ─────────────────────────────────────────
//   Name:    session-presence:{sessionId}
//   Table:   session_guests
//   Filter:  session_id=eq.{sessionId}
//   Events:  INSERT (guest joined), UPDATE (status change)
//   Consumer: Admin dashboard — refreshes 👥 guest count on any change.
//             Public guest page — detects session_active: false on UPDATE.
//
//   Channel B — restaurant session lifecycle
//   ─────────────────────────────────────────
//   Name:    restaurant-sessions:{restaurantId}
//   Table:   visit_sessions
//   Filter:  restaurant_id=eq.{restaurantId}
//   Events:  INSERT (new session opened), UPDATE (status change — active→completed)
//   Consumer: Admin dashboard — triggers session list reload on any change.
//             Already implemented in app/admin/sessions/page.tsx.
//
// INTEGRATION GUIDE (future sprint):
//
//   Admin dashboard — wire Channel A per active session card:
//
//     const channel = supabase
//       .channel(`session-presence:${sessionId}`)
//       .on('postgres_changes', {
//         event: '*',
//         schema: 'public',
//         table: 'session_guests',
//         filter: `session_id=eq.${sessionId}`,
//       }, () => { refetchGuestCount(sessionId); })
//       .subscribe();
//
//   Public guest page — detect forced disconnect:
//
//     const channel = supabase
//       .channel(`session-presence:${sessionId}`)
//       .on('postgres_changes', {
//         event: 'UPDATE',
//         schema: 'public',
//         table: 'session_guests',
//         filter: `guest_token=eq.${guestToken}`,
//       }, (payload) => {
//         if (payload.new.status === 'disconnected') router.push('/session-ended');
//       })
//       .subscribe();
//
// NOTE: session_guests has RLS. The anon key used on the public guest page
// will NOT have SELECT access. Public guest realtime must use a service-role
// edge function or a signed Realtime channel token. Resolve this before wiring.

// ── Channel name builders (shared between client and server) ──────────────────

export function sessionPresenceChannel(sessionId: string): string {
  return `session-presence:${sessionId}`;
}

export function restaurantSessionsChannel(restaurantId: string): string {
  return `restaurant-sessions:${restaurantId}`;
}

// ── Payload type contracts ────────────────────────────────────────────────────
// Used for type-safe payload handling in subscribers.

export type GuestJoinedPayload = {
  id: string;
  session_id: string;
  restaurant_id: string;
  status: 'active';
  joined_at: string;
};

export type GuestStatusChangedPayload = {
  id: string;
  session_id: string;
  status: 'active' | 'inactive' | 'disconnected' | 'blocked';
  last_seen_at: string;
};

export type SessionStatusChangedPayload = {
  id: string;
  restaurant_id: string;
  status: 'active' | 'completed' | 'abandoned';
  ended_at: string | null;
};

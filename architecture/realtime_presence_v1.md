# Realtime Presence Architecture V1

**Document version:** 1.0
**Date:** 2026-06-29
**Status:** Current — reflects live production system

---

## 1. Overview

SpinBite uses three distinct realtime mechanisms. Each serves a different audience and operates independently. They are layered so that a failure in one mechanism degrades gracefully to the next.

| Mechanism | Technology | Direction | Audience |
|---|---|---|---|
| `session-presence:{sessionId}` | Supabase postgres_changes | DB → Admin | Admin dashboard (guest count) |
| `restaurant-sessions:{restaurantId}` | Supabase postgres_changes | DB → Admin | Admin dashboard (session list) |
| `session-lifecycle:{sessionId}` | Supabase Broadcast REST | Server → Customer | Public guest page (session end) |
| `/api/public/sessions/{id}/presence` | HTTP poll (30s) | Client → Server | Public guest page (safety net) |

---

## 2. Channel A — `session-presence:{sessionId}`

**Technology:** Supabase Realtime postgres_changes
**Table watched:** `session_guests`
**Filter:** `session_id=eq.{sessionId}`
**Events:** `INSERT` (guest joined), `UPDATE` (status change — active/inactive/disconnected)
**Consumer:** Admin sessions page (`app/admin/sessions/page.tsx` → `TableStatusHeader`)

**What it does:**
When any `session_guests` row for this session changes (guest joins, heartbeats cause status update, stale sweep transitions), the admin UI refetches the active guest count.

**Current wiring (LIVE):**
```typescript
// Inside TableStatusHeader component
const channel = supabase
  .channel(`session-presence:${session.id}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'session_guests',
    filter: `session_id=eq.${session.id}`,
  }, () => { fetchCount(); })
  .subscribe();
```

**Notes:**
- Uses the anon key (client-side) — only works because `session_guests` RLS allows owner SELECT
- `fetchCount()` calls `GET /api/admin/sessions/{id}/guest-count`, which runs a stale sweep before counting
- One channel per active session card
- Channel is cleaned up when the card unmounts

---

## 3. Channel B — `restaurant-sessions:{restaurantId}`

**Technology:** Supabase Realtime postgres_changes
**Table watched:** `visit_sessions`
**Filter:** `restaurant_id=eq.{restaurantId}`
**Events:** `INSERT` (new session opened), `UPDATE` (status change — active→completed)
**Consumer:** Admin sessions page (`app/admin/sessions/page.tsx` → top-level `useEffect`)

**What it does:**
When any session for this restaurant changes status, the admin page reloads the full sessions list. This is how the admin sees new sessions appear and completed sessions disappear from the Active tab in real time.

**Current wiring (LIVE):**
```typescript
const channel = supabase
  .channel(`admin-sessions-${selectedRestaurantId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'visit_sessions',
    filter: `restaurant_id=eq.${selectedRestaurantId}`,
  }, () => { loadSessions(); })
  .subscribe();
```

**Notes:**
- One channel per selected restaurant on the admin page
- `loadSessions()` calls `GET /api/admin/sessions?restaurant_id={id}&status={tab}`

---

## 4. Channel C — `session-lifecycle:{sessionId}` (Broadcast)

**Technology:** Supabase Realtime Broadcast REST API
**Direction:** Server → All connected customer pages
**Mechanism:** HTTP POST from the admin session-end API route to Supabase Broadcast endpoint
**Consumer:** Public customer page (`/r/{slug}`)

**What it does:**
Instantly propagates a session-ended event to all customer devices connected to a session, the moment the admin clicks "End Session". This is the primary termination signal.

**Server-side broadcast call (in `/api/admin/sessions/{id}/end/route.ts`):**
```typescript
await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'apikey': SERVICE_KEY,
  },
  body: JSON.stringify({
    messages: [{
      topic: `session-lifecycle:${sessionId}`,
      event: 'session_ended',
      payload: { session_id: sessionId },
    }],
  }),
});
```

**Why Broadcast REST and not postgres_changes:**

Supabase postgres_changes subscriptions on `visit_sessions` require that the subscribing client has SELECT permission on the `visit_sessions` row. The public customer page uses the **anon key**, and `visit_sessions` has no public SELECT policy — only owner SELECT. If we used postgres_changes on the public page, we'd either:
1. Need to open a dangerous SELECT policy on `visit_sessions` to anonymous users, OR
2. Need server-side WebSocket infrastructure to relay the change

Broadcast REST solves this cleanly:
- The server posts the broadcast using the service role key (server-side, secure)
- Customer page subscribes to the broadcast channel using the anon key — no table SELECT needed
- No RLS issue; no open policy needed
- No server-side WebSocket; fire-and-forget HTTP call from the API route

**Customer page subscription (architecture — wire in future sprint):**
```typescript
const channel = supabase
  .channel(`session-lifecycle:${sessionId}`)
  .on('broadcast', { event: 'session_ended' }, () => {
    // Navigate to session-ended page immediately
    router.push('/session-ended');
  })
  .subscribe();
```

**Note:** As of 2026-06-29, the Broadcast is dispatched by the server correctly. The customer-side subscription must be wired into `RestaurantPublicPage.tsx` in a future sprint.

---

## 5. Supabase Presence Usage

**Not currently in use** for SpinBite's session presence architecture.

Supabase Presence (the collaborative multiplayer feature) tracks which clients are actively connected to a channel using WebSocket heartbeats. We chose not to use it because:

1. Our guest presence is server-authoritative (heartbeat → DB → sweep), not client-authoritative
2. Supabase Presence state is ephemeral in memory; `session_guests` is durable in the DB
3. Supabase Presence has a limited number of clients per channel for free-tier projects
4. Our model requires the guest token to be server-issued and invalidated atomically on session end

The `session_guests` table with HTTP heartbeats + SQL sweep functions provides durable, auditable, and owner-queryable presence tracking.

---

## 6. Fallback Chain: Session End Propagation

When an admin ends a session, connected customer pages learn about it through three independent mechanisms in priority order:

```
1. Supabase Broadcast (PRIMARY — ~200ms latency)
   Channel: session-lifecycle:{sessionId}
   Event: 'session_ended'
   Delivery: Near-instant to all subscribed customer tabs
   Failure mode: Network error or Supabase Broadcast outage

   ↓ (fallback if broadcast fails)

2. Heartbeat Poll (SECONDARY — ≤30s latency)
   Route: POST /api/public/sessions/{id}/heartbeat { guest_token }
   Logic: visits session_guests → session status → returns { active: false }
   Delivery: Within 30 seconds of session end
   Failure mode: Client heartbeat stops (tab backgrounded, network loss)

   ↓ (final safety net)

3. Order 409 Safety Net (TERTIARY — on action only)
   Route: POST /api/public/orders
   Logic: orders API validates visit_session_id is active → 409 SESSION_INVALID if not
   Delivery: On next order placement attempt
   Impact: Order rejected; customer must refresh
```

This fallback chain ensures no customer device is permanently stuck in an active state after the admin ends a session.

---

## 7. RLS Boundary for Realtime Subscriptions

| Channel | Technology | Key used | RLS requirement |
|---|---|---|---|
| `session-presence:{id}` (admin) | postgres_changes | anon key | `session_guests` owner SELECT (auth.uid() = owner) |
| `restaurant-sessions:{id}` (admin) | postgres_changes | anon key | `visit_sessions` owner SELECT (auth.uid() = owner) |
| `session-lifecycle:{id}` (customer) | Broadcast | anon key | None — Broadcast has no table dependency |

**Critical rule:** Never open a public SELECT policy on `visit_sessions` or `session_guests` to support customer-side realtime. Use Broadcast instead.

---

## 8. Known Open Work

| Item | Priority | Note |
|---|---|---|
| Wire `session-lifecycle:{id}` Broadcast subscription into `RestaurantPublicPage.tsx` | High | Broadcast dispatched by server; client not yet subscribed |
| Add presence poll status ribbon to customer page | Medium | `/api/public/sessions/{id}/presence` exists; UI not wired |
| Session-ended redirect page | Medium | Route target for broadcast + heartbeat fallback |

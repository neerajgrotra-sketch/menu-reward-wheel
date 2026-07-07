# Realtime Presence Architecture V1

**Document version:** 1.1
**Date:** 2026-07-07 (postgres_changes publication gap added; see §1.1)
**Status:** Current — reflects live production system

---

## 1. Overview

SpinBite uses three distinct realtime mechanisms. Each serves a different audience and operates independently. They are layered so that a failure in one mechanism degrades gracefully to the next.

| Mechanism | Technology | Direction | Audience |
|---|---|---|---|
| `session-presence:{sessionId}` | Supabase postgres_changes | DB → Admin | Admin dashboard (guest count) |
| `admin-sessions-{restaurantId}` (§3; historically documented here as `restaurant-sessions:{restaurantId}` — that was never the real topic string, see §3) | Supabase postgres_changes | DB → Admin | Admin dashboard (session list) |
| `dining-intelligence-summary` (§10, undocumented until 2026-07-07) | Supabase postgres_changes | DB → Admin | Admin Dining Intelligence landing page stat tiles |
| `session-lifecycle:{sessionId}` | Supabase Broadcast REST | Server → Customer | Public guest page (session end) |
| `/api/public/sessions/{id}/presence` | HTTP poll (30s) | Client → Server | Public guest page (safety net) |

### 1.1 Critical gap, live 2026-06-29 → fixed 2026-07-07: RLS SELECT is necessary but not sufficient for `postgres_changes`

Every `postgres_changes` channel below was labeled "LIVE" and correctly satisfied its RLS requirement (§7) from the day it shipped. But a `postgres_changes` subscription **also** requires the watched table to be added to the `supabase_realtime` publication — a separate, easy-to-forget step that has nothing to do with RLS and that this document never mentioned. A live query against `pg_publication_tables` on 2026-07-07 found **zero tables** registered in `supabase_realtime` — meaning `session-presence:{sessionId}`, `admin-sessions-{restaurantId}`, and every other admin `postgres_changes` subscription described as "LIVE" in this document had, in fact, been subscribing successfully (the WebSocket connection and RLS check both passed) and then **silently receiving zero events**, for as long as those channels existed. The UI never errored — it just quietly never updated in realtime, falling back to whatever manual refresh or poll happened to exist alongside it.

Fixed by `supabase/migrations/20260707000000_enable_realtime_visit_sessions.sql`, which adds `visit_sessions` and `session_guests` to the publication. **`orders` is still not in the publication as of this writing** — the `dining-intelligence-summary` channel (§10) subscribes to `orders` changes and has the same silent-no-op gap today.

**Rule going forward:** any new `postgres_changes` subscription must be verified live (query `select * from pg_publication_tables where pubname = 'supabase_realtime'`, or trigger a real change and confirm the event arrives) — passing RLS and "the code looks right" are not evidence a channel is actually delivering events. See Rule 57 in `docs/engineering/claude-engineering-rules.md`.

---

## 2. Channel A — `session-presence:{sessionId}`

**Technology:** Supabase Realtime postgres_changes
**Table watched:** `session_guests`
**Filter:** `session_id=eq.{sessionId}`
**Events:** `INSERT` (guest joined), `UPDATE` (status change — active/inactive/disconnected)
**Consumer:** Dining Intelligence detail page (`app/admin/sessions/[restaurantId]/page.tsx` → `components/admin/sessions/SessionsDashboard.tsx` → `TableStatusHeader`) — see §11 for the Dining Intelligence rename/restructure.

**What it does:**
When any `session_guests` row for this session changes (guest joins, heartbeats cause status update, stale sweep transitions), the admin UI refetches the active guest count.

**Current wiring (LIVE since 2026-07-07 — see §1.1):** correctly satisfied RLS since it was written, but delivered zero events until `session_guests` was added to the `supabase_realtime` publication.
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

## 3. Channel B — `admin-sessions-{restaurantId}`

**Naming correction (this revision):** this channel was documented under the header `restaurant-sessions:{restaurantId}` since v1.0, but that string was never the actual topic used in code — the real topic, visible in this same section's own code sample below, has always been `admin-sessions-${selectedRestaurantId}`. §1 and §7 are corrected to match; if you find `restaurant-sessions:{restaurantId}` referenced anywhere else (e.g. `spinbite-platform-architecture-v4.md` §8.2), it means the same doc-vs-code drift and should be corrected to this name too.

**Technology:** Supabase Realtime postgres_changes
**Table watched:** `visit_sessions`
**Filter:** `restaurant_id=eq.{restaurantId}`
**Events:** `INSERT` (new session opened), `UPDATE` (status change — active→completed)
**Consumer:** Dining Intelligence detail page (`components/admin/sessions/SessionsDashboard.tsx`) — see §11

**What it does:**
When any session for this restaurant changes status, the admin page reloads the full sessions list. This is how the admin sees new sessions appear and completed sessions disappear from the Active tab in real time.

**Current wiring (LIVE since 2026-07-07 — see §1.1):**
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

## 5. Supabase Presence Usage — transport only, never state (corrected 2026-07-01)

`TouchpointMenuPage.tsx` does use Supabase Presence, on channel `table-presence:{sessionId}` — but strictly as a **change-notification transport**, never as the count itself:

1. Our guest presence is server-authoritative (heartbeat → DB → sweep), not client-authoritative
2. Supabase Presence state is ephemeral in memory; `session_guests` is durable in the DB
3. Supabase Presence has a limited number of clients per channel for free-tier projects
4. Our model requires the guest token to be server-issued and invalidated atomically on session end

**Rule (session presence architecture audit, 2026-07-01):** no distributed state may be simultaneously owned by the database and a realtime ephemeral transport layer. Realtime may only *signal* that something changed; the database remains the sole authority for what the new value is. Concretely: the channel's `'sync'` handler calls `fetchPresence()` (a fresh `GET /presence` read) — it never reads `channel.presenceState()` to compute a number, and the client never merges a fetched count with a locally-remembered one (no `Math.max`). A previous version did both, which let a transient presence blip during a page-refresh reconnect get permanently "stuck" as an inflated ribbon count that the DB-backed guest-list popover correctly didn't share — see `session_lifecycle_v1.md` § 5 for the paired root cause (duplicate `session_guests` rows on refresh).

The `session_guests` table with HTTP heartbeats + SQL sweep functions remains the durable, auditable, owner-queryable presence record. Presence is a faster doorbell, not a second ledger.

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

| Channel | Technology | Key used | RLS requirement | `supabase_realtime` publication? |
|---|---|---|---|---|
| `session-presence:{id}` (admin) | postgres_changes | anon key | `session_guests` owner SELECT (auth.uid() = owner) | Yes, since 2026-07-07 (§1.1) |
| `admin-sessions-{id}` (admin) | postgres_changes | anon key | `visit_sessions` owner SELECT (auth.uid() = owner) | Yes, since 2026-07-07 (§1.1) |
| `dining-intelligence-summary` (admin, §10) | postgres_changes | anon key | `visit_sessions`/`orders` owner SELECT | `visit_sessions` yes; **`orders` no — same silent-no-op gap as §1.1, unresolved** |
| `session-lifecycle:{id}` (customer) | Broadcast | anon key | None — Broadcast has no table dependency | N/A — Broadcast doesn't use the publication |

**Critical rule:** Never open a public SELECT policy on `visit_sessions` or `session_guests` to support customer-side realtime. Use Broadcast instead. **Second critical rule (added 2026-07-07, §1.1):** satisfying RLS is not the same as the channel actually delivering events — also verify `supabase_realtime` publication membership.

---

## 8. Known Open Work

All three items below, open as of v1.0 (2026-06-29), are now resolved — confirmed against current code during the 2026-07-07 audit that produced this revision:

| Item | Status |
|---|---|
| Wire `session-lifecycle:{id}` Broadcast subscription into the customer page | **Done.** Landed in `components/public/TouchpointMenuPage.tsx` (not `RestaurantPublicPage.tsx` as originally planned — the touchpoint-scoped page became the actual home for session lifecycle, since only touchpoint sessions have one to track) — subscribes to `session-lifecycle:{sessionId}`, `on('broadcast', { event: 'session_ended' }, ...)`. |
| Add presence poll status ribbon to customer page | **Done.** Same file — the guest ribbon reflects `sessionPhase` and polls `/api/public/sessions/{id}/presence` as the fallback described in §6. |
| Session-ended redirect page | **Done, but not as a route.** No dedicated `/session-ended` page exists — `sessionPhase === 'session_ended'` renders an inline full-screen state directly in `TouchpointMenuPage.tsx`, with a countdown (`SESSION_ENDED_REDIRECT_SECONDS`) rather than an immediate `router.push()`. |

New open item found during this audit: `orders` is not in the `supabase_realtime` publication (§1.1, §10) — the `dining-intelligence-summary` channel's order-change events are currently a silent no-op, same failure mode `visit_sessions`/`session_guests` had until 2026-07-07.

---

## 10. Channel D — `dining-intelligence-summary` (undocumented until this audit, live since 2026-07-02)

**Technology:** Supabase Realtime postgres_changes (two subscriptions on one channel)
**Tables watched:** `visit_sessions`, `orders`
**Filter:** per-restaurant-id
**Consumer:** `app/admin/sessions/page.tsx` (the Dining Intelligence landing page, §11) — refreshes the per-restaurant stat tiles (Active Tables/Sessions/Guests/Orders) when either table changes for the currently-relevant restaurant(s).

**Gap:** `orders` has never been added to the `supabase_realtime` publication (confirmed live 2026-07-07, same query used to discover the §1.1 gap), so the `orders` half of this channel has been silently inert since it shipped 2026-07-02. The `visit_sessions` half started working only once §1.1's migration landed 2026-07-07. Fixing the `orders` half is a one-line addition to `20260707000000_enable_realtime_visit_sessions.sql`'s successor migration — not done as part of this audit since it wasn't the reported symptom, but it is now tracked here so it isn't rediscovered independently.

---

## 11. Naming note: "Dining Intelligence" (2026-07-02)

`app/admin/sessions/` was restructured 2026-07-02 (`feature/dining-intelligence-redesign`) into a Directory→Detail pair, the same shape as Menu Library (§4) and Restaurant Directory/Workspace: `app/admin/sessions/page.tsx` (landing — restaurant tiles + live summary stats) → `app/admin/sessions/[restaurantId]/page.tsx` (detail — `SessionsDashboard.tsx`, Active/Completed/Abandoned tabs backed by real `visit_sessions.status` values per tab, not client-side filtering). The product name for this whole surface is "Dining Intelligence" — this document and `docs/architecture/README.md` still call it "Sessions" or "live session + intelligence panel" in places; treat "Dining Intelligence" as the current name going forward.

`engine/session-presence/realtime-channels.ts` is stale/dead: its own banner comment claims "Architecture-only. No live subscriptions are wired," but every channel actually described in this document (§2, §3, §10) is wired ad hoc inline in its consuming component, not through this module's exported builders. Either wire the real channels through it (matching its original intent) or remove it — leaving it in place as unused, self-contradicting code invites someone to trust its comment over the running system.

---

## 9. Customer-Facing Guest List Popover (live 2026-07-01)

Tapping the 👥 count pill on the session ribbon (`TouchpointMenuPage.tsx`) opens `SessionGuestListPopover.tsx`, a read-only view of who else is connected to the current table session.

### Route: `GET /api/public/sessions/{visitSessionId}/guests`

Public, no auth — same trust model as `/presence` (§ above): the session ID is a semi-public capability held only by guests who scanned the table QR. Uses the service-role client; never exposes an anon-writable path.

```
{
  session_active: boolean,
  active_guest_count: number,
  guests: [
    { id, display_name, is_named, status, joined_at, last_seen_at }
  ]
}
```

- Ended/completed session → `session_active: false`, `guests: []`
- Only `session_guests.status IN ('active', 'inactive')` are returned — `disconnected`/`blocked` guests are excluded
- Named guests sorted first, then anonymous guests, both `joined_at` ascending
- Unnamed guests get a deterministic label (`Anonymous Guest 1`, `Anonymous Guest 2`, …) computed per-request from sort order — not stored

### Refresh strategy (client)

While the popover is open: fetch once on open, then poll every 30s. No fetch while closed.

**Data Cache bypass required (Rule 35, engineering rules).** Every service-role client in this file — and in `/presence`, `/heartbeat`, `/guest-name`, `POST /resolve`, and the admin `guest-count`/`end` routes — must override `fetch` with `cache: 'no-store'` in `createServiceClient()`'s `global` option. `dynamic = 'force-dynamic'` alone only disables the Next.js Full Route Cache; it does not stop the Data Cache from serving a stale cached response to repeat calls at the same underlying Supabase REST URL. Confirmed as a real bug 2026-07-01: `/presence` had `dynamic='force-dynamic'` but no fetch override, and a customer's ribbon stayed stuck at the guest count from the very first poll while the admin-side count (already correctly bypassing the cache) updated normally — the two surfaces silently diverged on identical underlying data. All six public session routes plus the two affected admin routes were audited and fixed in the same pass; any new route reading `session_guests`/`visit_sessions` must include this from the start.

**Does not** open its own `table-presence:{sessionId}` channel. `TouchpointMenuPage` already owns a subscription on that exact topic for the ribbon count. Because `createClient()` returns a browser singleton and supabase-js dedupes `RealtimeClient.channel()` by topic string, a second `.channel()` call on the same topic returns the same already-joined channel object — and `.on(...)` throws synchronously if called on a channel that's already joined. This crashed the app on open in the initial implementation (2026-07-01 hotfix); the popover now relies solely on the 30s poll.

### Data privacy boundary

`guest_name` may be shown to other active diners in the same session — it is intentionally shared context for a shared table. **`guest_token`, `device_fingerprint`, and `user_agent` must never be exposed** by this or any future public-facing guest endpoint; they remain service-role-only fields, matching the boundary already established for `/presence` and `/guest-name`.

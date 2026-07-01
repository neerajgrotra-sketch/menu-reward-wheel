# Session Lifecycle Architecture V1

**Document version:** 1.0
**Date:** 2026-06-29
**Status:** Current — reflects live production system

---

## 1. Static QR Entry Model

SpinBite uses a **static touchpoint QR code** model. Each physical table has one printed QR code that encodes:

```
/r/{restaurantSlug}?tp={touchpoint_code}
```

- `restaurantSlug` — human-readable identifier for the restaurant (e.g. `punjabi-by-nature-oakville-12345`)
- `touchpoint_code` — short URL-safe code unique to this table within the restaurant (e.g. `t1`, `patio-3`)

The QR code is **permanent**. Scanning the same code at any time always routes to the same touchpoint. The system resolves which session is currently active for that touchpoint at scan time — the QR code itself carries no session state.

**Why static QR?** Printed QR materials are long-lived. Dynamic QR codes (rotating per-session) require re-printing on every session end. Static QR + server-side session resolution makes QR codes maintenance-free.

---

## 2. Touchpoint Resolution

On QR scan, the client reads `?tp={touchpoint_code}` and immediately calls:

```
POST /api/public/sessions/resolve
{
  restaurant_id: string,
  touchpoint_id: string,         // resolved client-side from touchpoint_code
  known_session_id: string|null, // from sessionStorage (prior visit, same tab)
  device_fingerprint: string,    // browser fingerprint
  user_agent: string|null
}
```

The resolve endpoint validates:
1. `touchpoint_id` belongs to `restaurant_id`
2. Touchpoint `active = true` and `deleted_at IS NULL`

If validation fails → 404. Customer sees an error.

---

## 3. visit_session Creation

`resolveSessionJoin()` in `engine/session-presence/join-session.ts` is the canonical session resolution logic.

```
find active session WHERE touchpoint_id = ? AND status = 'active'
  ↓
case A: session exists AND last_activity_at > 2h ago → REUSE (step 4)
case B: session stale (last_activity_at <= 2h ago) → ABANDON old, CREATE new
case C: no session exists → CREATE new
```

New session INSERT:
```sql
INSERT INTO visit_sessions (
  restaurant_id, touchpoint_id, status='active',
  session_access_code (6-digit numeric),
  guest_count=1,
  session_interaction_log=[{event:'qr_scan',ts:now()}]
)
```

**Race condition handling:** If two devices scan simultaneously, the partial unique index `visit_sessions_one_active_per_touchpoint_idx (touchpoint_id) WHERE status='active'` causes the second INSERT to error with `23505`. The resolver catches this, re-queries for the winning session, and returns it.

---

## 4. Active Session Reuse

When an active session exists and is fresh (`last_activity_at` within 2 hours), it is reused for the incoming device. This is the multi-guest dining model — every device at a table shares one `visit_sessions` row.

The session's `last_activity_at` is updated on reconnect to prevent stale-session abandonment.

---

## 5. Multi-Guest Join Behavior

Multi-guest = multiple devices scanning the same QR code while one session is active.

The system distinguishes between:

**New device joining:**
- `known_session_id` is null or differs from the active session's ID
- A new `session_guests` row is created for this device
- `increment_guest_count()` RPC atomically increments `visit_sessions.guest_count`
- The customer UI shows an updated 👥 count

**Same device reconnecting (page refresh):**
- `known_session_id` matches the active session ID
- A new `session_guests` row is still created (new `guest_token` issued)
- `guest_count` is NOT incremented (prevents inflation on page refreshes)
- `last_activity_at` is updated

---

## 6. Guest Token Issuance

On every resolve call (new device or reconnect), the server issues a fresh `guest_token`:

```typescript
function generateGuestToken(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}
// = two UUID4s concatenated, no hyphens = 64 hex characters = 256 bits of entropy
```

Properties:
- **Server-issued only** — never client-generated
- **Globally unique** — UUID4 × 2 provides sufficient entropy
- **Opaque** — carries no embedded session or restaurant information
- **Invalidated on session end** — `disconnect_session_guests()` transitions all non-terminal guests to `disconnected`

The token is returned to the client at resolve time and stored in memory for the page's lifetime. It is used only for the heartbeat (`POST /heartbeat { guest_token }`).

---

## 7. Heartbeat Lifecycle

The public customer page sends a heartbeat every **30 seconds**:

```
POST /api/public/sessions/{visitSessionId}/heartbeat
{ guest_token: string }
```

Heartbeat logic (`engine/session-presence/presence-heartbeat.ts`):

```
1. Look up session_guests row by guest_token (O(1) — unique index)
2. Join to visit_sessions.status
3a. Session not active → set guest disconnected → return { active: false }
3b. Guest blocked/disconnected → return { active: false }
3c. Guest active/inactive → refresh last_seen_at, set status='active'
   → return { active: true }
```

Client response handling:
- `active: true` → continue; no UI change
- `active: false` → navigate to session-ended page

---

## 8. Session Ending

Admin triggers session end from `/admin/sessions`:

```
PATCH /api/admin/sessions/{sessionId}/end
```

End sequence (in order):
1. Verify caller owns the restaurant that owns the session
2. Check `status === 'active'` — 409 if already ended
3. UPDATE `status='completed', ended_at=now(), ended_by=user.id`
4. `disconnect_session_guests(sessionId)` RPC — all non-terminal guests → `disconnected` (fire-and-forget)
5. INSERT `SESSION_ENDED` into `session_events` with `reason='manual', duration_seconds` (fire-and-forget)
6. POST to Supabase Broadcast REST API: channel `session-lifecycle:{sessionId}`, event `session_ended` (fire-and-forget)

The session row is closed in step 3. Steps 4–6 are non-blocking. Any failure in 4–6 does not prevent the session from being marked ended.

---

## 9. Refresh Behavior After Session End

When a session ends, connected customer pages learn about it via three independent mechanisms (fallback chain):

**1. Supabase Broadcast (instant — ~200ms)**
- Admin end route POSTs to `${SUPABASE_URL}/realtime/v1/api/broadcast`
- Channel: `session-lifecycle:{sessionId}`, event: `session_ended`
- Customer page subscribed to this channel receives the event immediately
- No Supabase WebSocket required on the server side — pure REST call

**2. Heartbeat Poll (within 30s)**
- Customer's 30s heartbeat returns `{ active: false }` once `visit_sessions.status` is no longer `active`
- Guest token is also invalidated — heartbeat route returns `disconnected`
- Safety net if broadcast delivery fails

**3. Order 409 Safety Net**
- If customer attempts to place an order after session ends, the orders API validates `visit_session_id` is active
- Returns `409 SESSION_INVALID` — order rejected, customer sees an error
- Prevents orphaned orders attached to completed sessions

---

## 10. Stale Guest Handling

Stale guests are swept by `update_stale_guest_presence(session_id)` RPC:

```sql
-- active → inactive: no heartbeat for 3 minutes
UPDATE session_guests SET status='inactive'
WHERE session_id = ? AND status='active'
  AND last_seen_at < now() - interval '3 minutes';

-- inactive → disconnected: no heartbeat for 10 minutes
UPDATE session_guests SET status='disconnected'
WHERE session_id = ? AND status='inactive'
  AND last_seen_at < now() - interval '10 minutes';
```

This sweep is called:
- At the start of `GET /api/public/sessions/{id}/presence`
- At the start of `GET /api/admin/sessions/{id}/guest-count`

So guest counts are always fresh before being returned to callers.

---

## 11. Fallback Behavior

| Scenario | Fallback |
|---|---|
| `session_guests` INSERT fails on resolve | Warning logged; guest_token still issued; resolve succeeds |
| `increment_guest_count` fails | Guest count may show stale value; session is unaffected |
| Heartbeat route unreachable | Guest goes inactive (3 min), then disconnected (10 min) |
| Broadcast fails on session end | Customer gets `active: false` on next 30s heartbeat |
| Concurrent resolve race (23505) | Re-query wins existing session; both devices join |
| `track` route fails | Event not recorded; ordering unaffected |

---

## 12. SessionPhase State Machine (Client)

```
'resolving'      → resolve API call in-flight (3s AbortController timeout)
'confirmed'      → resolve succeeded; confirmedSessionId set; transactional actions allowed
'session_ended'  → heartbeat returned active:false OR broadcast received
'resolve_failed' → timeout or network error; Retry button shown
```

Rules:
- Only `confirmedSessionId` (from a successful resolve response) is used for transactional actions
- `sessionStorage` is treated as a hint only (for known_session_id optimization) — never as active session authority
- Cart, ordering, coupon issuance, and session_events tracking all gate on `sessionPhase === 'confirmed'`
- Passive menu browsing is always allowed regardless of phase

See also: Rule 34 in `/docs/engineering/claude-engineering-rules.md`.

## 13. Guest List Popover (live 2026-07-01)

The 👥 guest-count pill in the session ribbon is only interactive (rendered as a `<button>`, not a `<div>`) when `sessionPhase === 'confirmed'` and `confirmedSessionId` is set — matching the same gate used for transactional actions in § 12.

Tapping it opens `SessionGuestListPopover.tsx`, which reads `GET /api/public/sessions/{visitSessionId}/guests` (full contract in `realtime_presence_v1.md` § 9). The popover does not introduce a new session state — it is a read-only view layered on top of the existing state machine:

- Any transition into `session_ended` (broadcast, heartbeat `active:false`, orders-status check, or 409 safety net) also force-closes the popover (`setGuestListOpen(false)`), consistent with all other session-scoped UI (orders drawer, name modal).
- The popover never writes to `session_guests` and never blocks the underlying menu — it is dismissible via backdrop click, close button, or Escape.

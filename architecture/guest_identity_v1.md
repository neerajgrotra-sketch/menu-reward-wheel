# Guest Identity Engine V1

**Document version:** 1.0
**Date:** 2026-06-29
**Status:** Live

---

## 1. Purpose

Guest Identity V1 closes the identity gap between:
- The **server-assigned** `session_guests.id` (returned by the resolve API)
- The **client-generated** UUID previously stored in `session_events.guest_id`

Before V1, intelligence could group events by device but the groups had no name or persistent identity. After V1, all events and orders link to a named `session_guests` row.

---

## 2. What Changed

### DB (migration `20260629100000_guest_identity_v1.sql`)
- Added `orders.guest_id uuid REFERENCES session_guests(id) ON DELETE SET NULL`
- Partial index `orders_guest_idx` on `guest_id WHERE guest_id IS NOT NULL`
- Existing orders retain `guest_id = NULL` (additive, no breaking change)

### New API route: `POST /api/public/sessions/:visitSessionId/guest-name`
- Body: `{ guest_token: string, guest_name: string }`
- Validates `guest_token` belongs to the session before writing
- Updates `session_guests.guest_name` for the authenticated guest
- Public route — no auth cookie; bearer credential is `guest_token`

### `hooks/useSessionTracking.ts`
- New optional param: `useSessionTracking(confirmedSessionId, resolvedGuestId?)`
- When `resolvedGuestId` is provided (= `session_guests.id`), all events use it
- Kept legacy fallback: if `resolvedGuestId` is null/absent, generates a client UUID as before
- Uses a ref to avoid re-creating the `fireEvent` callback on guestId changes

### `components/public/TouchpointMenuPage.tsx`
- Resolve response now parses `guest_id` and `guest_token` (in addition to `visit_session_id`)
- Both stored in React state (`guestId`, `guestToken`)
- After resolve: checks `sessionStorage` key `spinbite_gn_{sessionId}` for a stored name
  - If stored name found → auto-apply via fire-and-forget `/guest-name` POST (reconnect path)
  - If no stored name + `guestId` present → show `GuestNameModal`
- `MENU_OPENED` event now includes `guest_id: serverGuestId` directly
- Passes `guestId` to `useSessionTracking` and `RestaurantPublicPage`

### `GuestNameModal` (inline component in `TouchpointMenuPage.tsx`)
- Shown once per session when no stored name exists
- Optional — "Skip" button always visible or rendered when input has value
- On confirm: calls `/guest-name` API, persists name to `sessionStorage`, dismisses
- On skip: dismisses without DB call
- Name capped at 32 chars in UI, 64 chars server-side

### `components/public/RestaurantPublicPage.tsx`
- New prop: `guestId?: string | null` (defaults to null)
- Passes `guestId` to `CartSheet`

### `components/public/CartSheet.tsx`
- New prop: `guestId?: string | null` (defaults to null)
- Included as `guest_id` in the order POST body

### `app/api/public/orders/route.ts`
- New field `guest_id?: string | null` in `OrderRequest` type
- UUID validated with `UUID_RE` before insert; silently ignored if invalid
- Stored in `orders.guest_id` column

---

## 3. Identity Flow

```
Guest scans QR code
  ↓
POST /api/public/sessions/resolve
  → resolveSessionJoin() creates/finds session_guests row
  → returns { visit_session_id, guest_id (= session_guests.id), guest_token, ... }
  ↓
TouchpointMenuPage captures guest_id + guest_token
  ↓
GuestNameModal shown (if no stored name)
  → guest enters name (optional)
  → POST /api/public/sessions/:vsid/guest-name
     → session_guests.guest_name = entered name
  → name stored to sessionStorage spinbite_gn_{sessionId}
  ↓
All subsequent events:
  useSessionTracking.fireEvent → POST /track with guest_id = session_guests.id
  session_events.guest_id ← session_guests.id  ✓ (was client UUID before V1)
  ↓
Guest places order:
  CartSheet → POST /api/public/orders with guest_id
  orders.guest_id ← session_guests.id  ✓
```

---

## 4. sessionStorage Keys

| Key | Value | Purpose |
|---|---|---|
| `spinbite_vs_{touchpoint_code}` | `visit_session_id` | Session hint for reconnect |
| `spinbite_gn_{sessionId}` | `guest_name` | Suppress modal on reconnect; auto-apply name |
| `spinbite_guest_{sessionId}` | client UUID | Legacy fallback only (not used when resolvedGuestId present) |

---

## 5. Reconnect Behaviour

On a page refresh or QR rescan within the same browser tab:
1. Resolve returns a NEW `session_guests.id` and `guest_token` (new row created or existing found)
2. `spinbite_gn_{sessionId}` is checked in sessionStorage
3. If name exists → fire-and-forget `/guest-name` POST to apply it to the new `session_guests` row
4. Modal is NOT shown again

---

## 6. Backward Compatibility

- Historical `session_events` rows retain their old client-generated UUIDs — no migration touches them
- Old `orders` rows have `guest_id = NULL` — no breaking change
- `useSessionTracking` still accepts one argument (existing callers that don't pass `guestId` continue to use client-generated UUID as fallback)
- Intelligence V3 (`analyzeGuestBehavior`) groups by `guest_id` value — works for both old client UUIDs and new `session_guests.id` values

---

## 7. Known Limitations

| Limitation | Notes |
|---|---|
| Historic events use client-generated UUIDs | Cannot be retroactively attributed to `session_guests` without a backfill |
| `ORDER_PLACED` server event still has `guest_id = null` | Server writes it directly; the `orders.guest_id` column (set by client) is the order attribution path |
| Guest name is optional | Not all guests will provide a name; analytics must handle null |
| sessionStorage is tab-scoped | Different browser tabs = different `session_guests` rows even on same device |

---

## 8. Engineering Invariants

1. `guest_token` is NEVER sent to the client without being first validated server-side on write operations
2. `/guest-name` validates the token belongs to the specific session before any write
3. `guest_id` from the order body is UUID-validated before DB insert; invalid values silently become NULL
4. Name capture is ALWAYS optional — no UX flow should force it
5. `orders.guest_id` uses `ON DELETE SET NULL` — deleting a guest row does not cascade to orders

---

## 9. Architecture Document Links

- V3 Intelligence Engine: `architecture/intelligence_engine_v3.md`
- Session Presence Engine: `architecture/realtime_presence_v1.md`
- Database schema: `architecture/database_schema_map_v1.md`

# Session Management V1 — Architecture Audit (v2)

**Branch:** feature/session-management-v1
**Date:** 2026-06-23
**Supersedes:** v1 audit (same file)
**Status:** Audit only — no implementation

---

## Purpose

Design the first foundation of SpinBite's digital dining intelligence layer. This is not only session management — it is the data collection substrate that turns every table QR scan into a measurable, investor-demonstrable visit. The architecture must be:

- Lightweight enough to ship as a v1
- Rich enough to be compelling in an investor demo
- Forward compatible with the planned AI session agent architecture

**Explicitly out of scope:**
- AI behavior engine
- `visit_events` table
- Customer identity
- Retention engine

---

## A. Existing Foundation Audit

### What is built and production-ready

**`restaurant_touchpoints` table** (migration `20260623000000_touchpoint_management_v1.sql`)
- Stable schema with `touchpoint_code` (URL-safe, unique per restaurant, designed for embedding in QR URLs per migration comment)
- `table_management` capability already seeded per restaurant (disabled by default)
- Admin Tables UI: full CRUD in `RestaurantTablesTab` component
- Soft delete preserves printed QR history
- Owner-only RLS; public resolves via service role

**QR infrastructure** (fully operational for restaurant-level QR)
- QR image generation: third-party API `api.qrserver.com/v1/create-qr-code/` via `<img src>` embedding — no local library needed
- `qr-scanner: 1.4.2` in `package.json` — for scanning only, not generating
- Print kit system: 6 branded print formats (table tent, sticker, counter poster, window decal, takeout insert, social graphic) at `/admin/restaurants/[restaurantId]/qr/print`
- Format components render the QR image + restaurant branding + URL label
- **Current QR URL:** `/r/{restaurantSlug}` (restaurant-level only — no touchpoint yet)

**Orders system**
- `orders.session_id text` — always `NULL`; CartSheet does not send it
- `orders.order_origin text` — hardcoded `'direct_link'` in the API; constraint allows `'restaurant_qr'` but it's never set
- `orders.table_identifier text` — free text typed by customer, not linked to any touchpoint
- Full order pipeline is solid and needs minimal change

**Promotion play flow** (separate architecture)
- Route: `/play/[restaurantSlug]/[promotionSlug]`
- Uses `play_sessions` table with `sessionToken` stored in `localStorage`
- Coupon issue API (`/api/coupons/issue`) knows `play_session_id` but not visit session
- This is an **independent flow** — customers may or may not enter it from a table QR

**Admin Tables UI**
- `RestaurantTablesTab.tsx` has a "QR" button per touchpoint that is **disabled and labeled "Coming Soon — Phase C"**
- This button is the hook point for per-touchpoint QR generation

### Critical gaps

| Gap | Impact |
|---|---|
| No `/r/[slug]/[touchpointCode]` public route | QR has nowhere to point |
| QR button in Tables tab disabled | No per-touchpoint QR generation |
| No per-touchpoint print route | Cannot print table-specific QR materials |
| No `visit_sessions` table | No session concept exists |
| `orders.session_id` is text/null | No FK linkage to any session |
| No admin sessions page | No operational visibility |
| Promotion play is session-blind | Cannot attribute promotions/coupons to visits |

---

## B. visit_sessions Schema

### Full table definition

```sql
CREATE TABLE public.visit_sessions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id         uuid        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  touchpoint_id         uuid        NOT NULL REFERENCES public.restaurant_touchpoints(id) ON DELETE RESTRICT,

  -- ── Status ──────────────────────────────────────────────────────────────────
  -- 'active'    → session is live; customer is at the table
  -- 'completed' → restaurant manually ended the session
  -- 'abandoned' → no activity for 2+ hours; set lazily by mark_stale_sessions_abandoned()
  status                text        NOT NULL DEFAULT 'active',

  started_at            timestamptz NOT NULL DEFAULT now(),
  ended_at              timestamptz,           -- NULL while active
  ended_by              text,                  -- 'manual' | 'timeout' | NULL

  -- ── Lightweight analytics (investor-demo layer) ──────────────────────────────
  -- All counters are updated atomically by their respective API routes.
  -- No visit_events table — these are denormalized aggregates on the session row.

  guest_count           integer     DEFAULT NULL,   -- manually set by staff; NULL until set
  menu_items_viewed     integer     NOT NULL DEFAULT 0,
  orders_count          integer     NOT NULL DEFAULT 0,
  promotion_interactions integer    NOT NULL DEFAULT 0,
  coupons_issued        integer     NOT NULL DEFAULT 0,
  total_spend           numeric(10,2) NOT NULL DEFAULT 0,
  last_activity_at      timestamptz NOT NULL DEFAULT now(),

  -- ── AI Agent reservation (forward compat) ───────────────────────────────────
  -- Reserved for the future AI session agent architecture.
  -- Nullable; no behavior attached in v1.
  assigned_ai_agent     text        DEFAULT NULL,

  -- ── Constraints ─────────────────────────────────────────────────────────────
  CONSTRAINT vs_status_check CHECK (status IN ('active', 'completed', 'abandoned')),
  CONSTRAINT vs_ended_consistency CHECK (
    (status = 'active'                     AND ended_at IS NULL   ) OR
    (status IN ('completed', 'abandoned')  AND ended_at IS NOT NULL)
  ),
  CONSTRAINT vs_guest_count_positive CHECK (guest_count IS NULL OR guest_count > 0),
  CONSTRAINT vs_orders_count_nn     CHECK (orders_count >= 0),
  CONSTRAINT vs_items_viewed_nn     CHECK (menu_items_viewed >= 0),
  CONSTRAINT vs_promo_interactions_nn CHECK (promotion_interactions >= 0),
  CONSTRAINT vs_coupons_issued_nn   CHECK (coupons_issued >= 0),
  CONSTRAINT vs_total_spend_nn      CHECK (total_spend >= 0)
);
```

### Indexes

```sql
-- DB-enforces: only one active session per touchpoint at a time
CREATE UNIQUE INDEX visit_sessions_one_active_per_touchpoint_idx
  ON public.visit_sessions (touchpoint_id)
  WHERE status = 'active';

-- Admin dashboard query: sessions for a restaurant, sorted by recency
CREATE INDEX visit_sessions_restaurant_status_started_idx
  ON public.visit_sessions (restaurant_id, status, started_at DESC);

-- Order linkage lookup (high-frequency path: every order POST)
CREATE INDEX visit_sessions_id_active_idx
  ON public.visit_sessions (id)
  WHERE status = 'active';

-- Abandoned detection: find stale active sessions
CREATE INDEX visit_sessions_stale_idx
  ON public.visit_sessions (restaurant_id, last_activity_at)
  WHERE status = 'active';
```

### RLS

```sql
ALTER TABLE public.visit_sessions ENABLE ROW LEVEL SECURITY;

-- Owners see their own restaurant sessions
CREATE POLICY "sessions_owner_select"
  ON public.visit_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_id AND r.owner_id = auth.uid()
    )
  );

-- Owners may update (end) their sessions via admin API
CREATE POLICY "sessions_owner_update"
  ON public.visit_sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_id AND r.owner_id = auth.uid()
    )
  );

-- No public INSERT or DELETE — all writes via service role API routes
```

### DB function: atomic counter increment

All analytics counter updates use a single atomic UPSERT-style increment to prevent race conditions when multiple devices on the same session write simultaneously.

```sql
CREATE FUNCTION public.increment_session_counters(
  p_session_id         uuid,
  p_orders_delta       integer  DEFAULT 0,
  p_spend_delta        numeric  DEFAULT 0,
  p_items_viewed_delta integer  DEFAULT 0,
  p_promo_delta        integer  DEFAULT 0,
  p_coupons_delta      integer  DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.visit_sessions
  SET
    orders_count          = orders_count + p_orders_delta,
    total_spend           = total_spend  + p_spend_delta,
    menu_items_viewed     = menu_items_viewed + p_items_viewed_delta,
    promotion_interactions = promotion_interactions + p_promo_delta,
    coupons_issued        = coupons_issued + p_coupons_delta,
    last_activity_at      = now()
  WHERE id = p_session_id
    AND status = 'active';
END;
$$;
```

Using `SECURITY DEFINER` keeps this consistent with the `next_order_number()` pattern already in production.

### DB function: mark stale sessions abandoned

Called at the top of the admin sessions GET API — no cron job needed for v1.

```sql
CREATE FUNCTION public.mark_stale_sessions_abandoned(
  p_restaurant_id uuid,
  p_timeout_hours integer DEFAULT 2
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  affected integer;
BEGIN
  WITH updated AS (
    UPDATE public.visit_sessions
    SET
      status   = 'abandoned',
      ended_at = now(),
      ended_by = 'timeout'
    WHERE restaurant_id = p_restaurant_id
      AND status = 'active'
      AND last_activity_at < now() - make_interval(hours => p_timeout_hours)
    RETURNING id
  )
  SELECT count(*) INTO affected FROM updated;
  RETURN affected;
END;
$$;
```

### orders table change

```sql
ALTER TABLE public.orders
  ADD COLUMN visit_session_id uuid REFERENCES public.visit_sessions(id) SET NULL;

CREATE INDEX orders_visit_session_idx
  ON public.orders (visit_session_id)
  WHERE visit_session_id IS NOT NULL;
```

**Do not remove `orders.session_id text`.** It exists in the API contract type `OrderRequest` in `route.ts`. It was never populated, but removing it is a breaking schema + API change. Leave it; treat it as a deprecated no-op field. `visit_session_id uuid` is the canonical FK going forward.

### Schema design rationale

| Decision | Rationale |
|---|---|
| Analytics as columns, not visit_events | Per explicit requirement. Denormalized aggregates are sufficient for investor demo and avoid a separate table |
| `ON DELETE RESTRICT` on touchpoint_id | Cannot delete a touchpoint that has session history — prevents data orphaning |
| Partial unique index `WHERE status = 'active'` | One active session per touchpoint enforced at DB level, not only in application code |
| `ended_by text` not boolean | 'manual', 'timeout' — forward compat with future 'ai_trigger', 'inactivity_cutoff' |
| `guest_count DEFAULT NULL` | Staff-set only; NULL signals "not recorded" vs. 0 (which could mean "no guests counted") |
| `assigned_ai_agent text DEFAULT NULL` | Placeholder per requirement #14; no behavior in v1 |
| Check constraint on `ended_at` | Status and timestamp must be consistent — prevents partial update states |

---

## C. QR Code Per Touchpoint

### URL format

Per requirement #2: `/r/{restaurantSlug}/{touchpointCode}`

Example: `/r/punjabi-by-nature/TABC123`

### QR image generation

**No new library needed.** The existing `api.qrserver.com` pattern is reused:

```
https://api.qrserver.com/v1/create-qr-code/?size=NxN&margin=16&data=https://app.spinbite.com/r/SLUG/CODE
```

The touchpoint URL is the `data` parameter. Identical to how the restaurant QR works today.

### Admin: activate the QR button in RestaurantTablesTab

The "QR" button on each touchpoint row in `RestaurantTablesTab.tsx` is currently:
```tsx
<button type="button" disabled title="Coming Soon — Phase C" ...>QR</button>
```

This becomes a link to the per-touchpoint print route:
```tsx
<a href={`/admin/restaurants/${restaurantId}/qr/${tp.id}/print`} target="_blank">QR</a>
```

### New per-touchpoint print route

**File:** `app/admin/restaurants/[restaurantId]/qr/[touchpointId]/print/page.tsx`

This reuses the existing print kit infrastructure from `app/admin/restaurants/[restaurantId]/qr/print/page.tsx` with the following changes:

1. Load both the restaurant AND the specific touchpoint row (`name`, `type`, `section_name`, `touchpoint_code`)
2. Replace `playUrl = /r/{slug}` with `touchpointUrl = /r/{slug}/{touchpointCode}`
3. Update print layout components to:
   - Show the touchpoint name prominently ("Table 5" or "Patio A")
   - Show touchpoint type label below the name
   - URL label on QR: `/r/{slug}/{code}` (vs. current `/r/{slug}`)
   - Replace the generic "Scan To View Menu" tagline with "Table 5 — Scan To Order" (touchpoint-specific)

The 6 existing format components (`TableTentLayout`, `TableStickerLayout`, `CounterPosterLayout`, `WindowDecalLayout`, `TakeoutInsertLayout`, `SocialGraphicLayout`) receive a new `touchpoint` prop and conditionally swap the URL label and title text. No full rewrite — minor additions.

**Security:** Same auth check as existing print page — verify `owner_id = auth.uid()` before loading touchpoint data.

**Note on blast radius:** The existing restaurant-level QR print page (`/admin/restaurants/[restaurantId]/qr/print`) is **not modified**. The per-touchpoint page is a new parallel route.

---

## D. Session Creation Flow

```
1. Customer scans table QR (printed on tent/sticker)
   → navigates to /r/{restaurantSlug}/{touchpointCode}

2. Next.js renders /r/[restaurantSlug]/[touchpointCode]/page.tsx (NEW route)
   → Server: loads restaurant + ordering capability (same as /r/[slug] today)
   → Server: resolves touchpoint from touchpointCode + restaurantSlug
   → Server: passes touchpointId + touchpointName to client component

3. Client mounts
   → Calls POST /api/public/sessions/resolve
     body: { restaurant_id, touchpoint_id }
   → Server checks for active session on this touchpoint (partial unique index)
   → If active session exists: return it
   → If none: INSERT new visit_session, return it
   → Client stores { visitSessionId, touchpointName } in React state

4. All downstream actions carry visitSessionId:
   - Orders → sent as visit_session_id in POST /api/public/orders
   - Item views → sent as increments to track API
   - Promotion → visitSessionId passed as vsid URL param when opening game widget
```

### Why session creation is client-side

Server-side session creation would create a new session on every page render (SSR, prefetch, bot crawl). Multiple devices scanning the same QR must all receive the **same** `visit_session_id` — which requires the DB deduplication provided by the partial unique index. Client-side resolution ensures exactly one shared session per active touchpoint.

### Session resolution timing

Session starts **before ordering** (requirement #4): the resolve call happens on page mount, before any item is added to cart. `started_at` captures the true visit start time.

### Graceful degradation

If the resolve call fails (network error, touchpoint inactive):
- The menu renders normally
- `visitSessionId` remains `null` in state
- Ordering falls back to direct-link mode (no session attached to orders)
- Customer experience is not blocked
- The "Table 5" header label is hidden

---

## E. Analytics Update Architecture

Each analytics column has a defined owner — the specific API route responsible for updating it atomically.

### `orders_count` + `total_spend` + `last_activity_at`

**Owner:** `POST /api/public/orders`

After successfully inserting an order:
```typescript
if (visit_session_id) {
  await supabase.rpc('increment_session_counters', {
    p_session_id:    visit_session_id,
    p_orders_delta:  1,
    p_spend_delta:   subtotal,
  });
}
```

The RPC call is non-blocking for the order response — if it fails, the order is still confirmed to the customer. Log the RPC failure but do not return 500. Analytics are best-effort; orders are not.

### `menu_items_viewed` + `last_activity_at`

**Owner:** New `POST /api/public/sessions/[visitSessionId]/track` endpoint

The public menu page fires a debounced call when a customer opens an item detail panel. Batches multiple views into a single call (e.g., after 3 seconds of inactivity: "send 4 views in one request").

Request body: `{ items_viewed_count: number }`

The track endpoint calls `increment_session_counters` with `p_items_viewed_delta`. No return payload needed.

**Rate limiting:** 30 calls per session per minute (prevents abuse if client-side debounce fails).

**Note:** `menu_items_viewed` is the count of item detail panels opened, not unique items — this is intentional for demo purposes (higher number = more engaging session).

### `promotion_interactions` + `last_activity_at`

**Owner:** `POST /api/public/promotion-play/route.ts`

The game widget on the menu page opens `/play/{slug}/{promotionSlug}` when tapped. When `visitSessionId` is in state, pass it as a URL query param:

```
/play/punjabi-by-nature/spin-summer?vsid=UUID
```

The promotion play page server reads `vsid` from `searchParams` and includes it in the `POST /api/public/promotion-play` call. The promotion play API calls `increment_session_counters` with `p_promo_delta: 1`.

**Fallback:** If `vsid` is absent or invalid, promotion play proceeds normally with no session update. Existing promotion play flow is unaffected.

**Blast radius note:** The promotion play page (`/play/[restaurantSlug]/[promotionSlug]/page.tsx`) gets one new `searchParams` read. The promotion play API route gets one conditional `rpc()` call. No existing behavior changes.

### `coupons_issued` + `last_activity_at`

**Owner:** `POST /api/coupons/issue/route.ts`

The coupon issue API currently accepts `play_session_id` (the promotion play session). A new optional field `visit_session_id` is added. When present and valid, the API calls `increment_session_counters` with `p_coupons_delta: 1`.

The `play/[slug]/[slug]/page.tsx` client passes `visitSessionId` (recovered from URL `vsid` param, stored in component state) when calling the coupon issue API.

### `guest_count`

**Owner:** Admin Sessions dashboard

Staff manually enters the party size during or after seating. Sent via `PATCH /api/admin/sessions/[sessionId]` with `{ guest_count: number }`. This is the only analytics column that is never auto-updated — it requires human input.

Displayed on the sessions page as an editable field on each active session card.

### Summary table

| Column | Auto or Manual | Update API | Timing |
|---|---|---|---|
| `orders_count` | Auto | POST /api/public/orders (after insert) | Each order placed |
| `total_spend` | Auto | POST /api/public/orders (after insert) | Each order placed |
| `menu_items_viewed` | Auto | POST /api/public/sessions/[id]/track | Debounced item views |
| `promotion_interactions` | Auto | POST /api/public/promotion-play | Each play session started |
| `coupons_issued` | Auto | POST /api/coupons/issue | Each coupon issued |
| `last_activity_at` | Auto | Any of the above (via RPC) | On every counter update |
| `guest_count` | Manual | PATCH /api/admin/sessions/[id] | Staff input |

---

## F. Session Status and Abandoned Logic

### Three states

| Status | Meaning | How set |
|---|---|---|
| `active` | Session is live | Set at creation; default |
| `completed` | Restaurant explicitly ended it | PATCH /api/admin/sessions/[id]/end |
| `abandoned` | No activity for 2+ hours | `mark_stale_sessions_abandoned()` RPC |

### Abandoned detection: lazy evaluation

No background job or pg_cron is required for v1. The `mark_stale_sessions_abandoned()` function is called at the start of the admin sessions GET handler, before returning results. When a restaurant owner opens `/admin/sessions`, stale sessions are silently promoted to `abandoned` before the list renders.

This is accurate for the investor demo (sessions are visually correct when viewed), does not require infrastructure beyond the existing Supabase setup, and is idempotent.

**Timeout:** 2 hours from `last_activity_at`. If a session was created but no orders/views were ever recorded (customer scanned and left), `last_activity_at = started_at`, so it will be marked abandoned 2 hours after the scan.

### Completing vs. abandoning

- `completed` means the restaurant consciously ended the session ("Table 5 is done, we need to turn it")
- `abandoned` means the session went cold without staff action (customer left mid-session)
- Both states record `ended_at` and `ended_by` for analytics reporting

---

## G. API Catalog

### New public routes

**`POST /api/public/sessions/resolve`**
- Input: `{ restaurant_id, touchpoint_id }`
- Validates touchpoint is active and belongs to restaurant
- Upserts active session (partial unique index deduplicates concurrency)
- Returns: `{ visit_session_id, touchpoint_name, touchpoint_type, section_name }`
- Auth: service role; no customer auth required
- Rate limit: per-IP (same pattern as orders API)

**`POST /api/public/sessions/[visitSessionId]/track`**
- Input: `{ items_viewed_count: number }`
- Validates `visitSessionId` is a real active session
- Calls `increment_session_counters` with `p_items_viewed_delta`
- Returns 204; no body
- Rate limit: 30 calls/session/min
- Auth: UUID possession is the credential

**`GET /api/public/sessions/[visitSessionId]/orders`**
- Returns all orders (with items) for the session, ordered by `created_at ASC`
- UUID possession is the credential — consistent with existing order UUID access pattern
- No authentication required
- Used by the public touchpoint page to show "Your Orders" in real-time

### Modified public routes

**`POST /api/public/orders`**
- New accepted field: `visit_session_id?: string | null`
- If provided: validate UUID format, verify session exists and belongs to same `restaurant_id`
- Set `order_origin = 'restaurant_qr'` when visit_session_id is present (currently hardcoded `'direct_link'`)
- Write `visit_session_id` to `orders.visit_session_id`
- After successful order insert: call `increment_session_counters` (non-blocking, best-effort)
- Existing `session_id?: string | null` field remains — accepted but ignored

**`POST /api/public/promotion-play`**
- New accepted field: `visit_session_id?: string | null`
- If provided and session is active: call `increment_session_counters` with `p_promo_delta: 1`
- Existing play session flow is unaffected

**`POST /api/coupons/issue`**
- New accepted field: `visit_session_id?: string | null`
- If provided and session is active: call `increment_session_counters` with `p_coupons_delta: 1`
- Existing coupon flow is unaffected

### New admin routes

**`GET /api/admin/sessions?restaurant_id=UUID&status=active|completed|abandoned|all`**
- Auth: authenticated owner; RLS enforces restaurant ownership
- First action: call `mark_stale_sessions_abandoned(restaurant_id)` to classify stale sessions
- Returns sessions joined with touchpoint name/type/section + order aggregates
- Default filter: `status = 'active'`
- Supports filter by status for dashboard tabs

**`PATCH /api/admin/sessions/[sessionId]/end`**
- Auth: authenticated owner
- Validates session belongs to owner's restaurant
- Sets `status = 'completed', ended_at = now(), ended_by = 'manual'`
- Returns updated session row

**`PATCH /api/admin/sessions/[sessionId]`**
- Auth: authenticated owner
- Accepted fields: `{ guest_count?: number }`
- Validates `guest_count > 0`
- Updates session row

---

## H. Public Menu Changes

### New route

**`app/r/[restaurantSlug]/[touchpointCode]/page.tsx`** — NEW

This is the primary customer-facing entry point for table QR ordering.

Server responsibilities (same as existing `/r/[restaurantSlug]/page.tsx`):
1. Resolve restaurant from `restaurantSlug`
2. Resolve touchpoint: `SELECT * FROM restaurant_touchpoints WHERE restaurant_id = ? AND touchpoint_code = ? AND active = true AND deleted_at IS NULL`
3. If touchpoint not found or inactive: render a branded "This table QR is not currently active. Please ask a staff member." page
4. Load menu, sections, capabilities (ordering, table_management)
5. Pass `touchpointId`, `touchpointName`, `touchpointCode` as props to client component

Client responsibilities (new behavior):
1. On mount: call `POST /api/public/sessions/resolve` with `{ restaurant_id, touchpoint_id }`
2. Store `visitSessionId` and `touchpointName` in state
3. Show a small persistent chip: "Table 5 — Session Active" (brand-colored, non-intrusive)
4. Pass `visitSessionId` to `CartSheet`
5. When item detail panel opens: debounce + batch view count → `POST /api/public/sessions/[id]/track`
6. When game widget opens: append `?vsid={visitSessionId}` to the promotion play URL
7. Show "Your Orders" section below the menu (polled from `GET /api/public/sessions/[id]/orders`)

**The existing `/r/[restaurantSlug]/page.tsx` is not modified.** Direct-link ordering and promotion-only mode continue working exactly as today. The new route is additive.

### CartSheet changes

**New prop:** `visitSessionId: string | null`

**When `visitSessionId` is not null:**
- Send `visit_session_id: visitSessionId` in order POST body
- Remove the manual "Table Number" text input — the table is already known
- Show touchpoint name in cart header: "Ordering for Table 5"
- `table_identifier` is populated from the touchpoint name so the kitchen orders inbox still shows the table label

**When `visitSessionId` is null:** CartSheet behavior is identical to today. No regression.

### "Your Orders" session panel

A new panel on the touchpoint page (below the menu, above the cart button) that shows all orders placed in the current session.

- Populated by `GET /api/public/sessions/[visitSessionId]/orders`
- Polled every 15 seconds (no Realtime complexity in v1)
- Shows: order number, status badge, item list, subtotal, time placed
- Collapsed by default if no orders exist; auto-expands on first order
- Multiple devices scanning same QR see the same orders (they share the same `visit_session_id`)

---

## I. Admin Sessions Dashboard

### Route

**`/admin/sessions`** — NEW standalone page

Added as a new action tile on the admin dashboard (`/admin/page.tsx`) and accessible directly.

### Layout

**Restaurant selector** (if owner has multiple locations): same pattern used across admin pages.

**Status tabs:**
- Active (default)
- Completed (today)
- Abandoned (today)

Each tab fetches from `GET /api/admin/sessions?restaurant_id=...&status=...`.

### Active sessions: per-session card

```
┌────────────────────────────────────────────────────────────┐
│  TABLE 5                    Main Floor · Table             │
│  Started 14 min ago                      3 orders · $47.50 │
│                                                             │
│  Views: 12 items    Promos: 1 played    Coupons: 1 issued  │
│  Guests: [  2  ▼]                                          │
│                                              [End Session]  │
└────────────────────────────────────────────────────────────┘
```

Fields displayed per active session:
- Touchpoint name (large, prominent)
- Section name + type (subdued label)
- `started_at` as relative time ("Started 14 min ago")
- `orders_count` + `total_spend`
- `menu_items_viewed`, `promotion_interactions`, `coupons_issued`
- `guest_count` as an editable inline selector (tap to set, sends PATCH)
- **End Session** button (orange, right-aligned) — confirms then calls end API

### Completed / Abandoned tabs

Same card layout but read-only (no End Session button). Shows `ended_at` duration ("Session lasted 1h 12m").

### Summary row (top of page)

Investor-demo metrics for the current day:

```
Active Now: 4    Completed Today: 11    Abandoned Today: 2
Avg Spend/Session: $38.20    Avg Items Viewed: 9.4    Promo Plays: 7
```

These are computed from the session list returned by the API — no separate metrics endpoint needed for v1.

### Realtime

Subscribe to Supabase Realtime on `visit_sessions` filtered by `restaurant_id`. When a new session row appears (new table scan) or a session status changes (ended by staff at another device), the list updates without refresh.

RLS ensures owners only receive their own restaurant's session updates.

---

## J. Files Affected

### New files

| File | Purpose |
|---|---|
| `supabase/migrations/20260624000000_session_management_v1.sql` | visit_sessions table, indexes, RLS, DB functions, orders column |
| `supabase/migrations/20260624000001_session_management_capability_seed.sql` | session_management capability per restaurant |
| `app/r/[restaurantSlug]/[touchpointCode]/page.tsx` | Public touchpoint menu page (session-aware) |
| `app/api/public/sessions/resolve/route.ts` | Create or return active session |
| `app/api/public/sessions/[visitSessionId]/orders/route.ts` | Session orders for customer view |
| `app/api/public/sessions/[visitSessionId]/track/route.ts` | Lightweight item view tracking |
| `app/api/admin/sessions/route.ts` | Admin sessions list with stale-session cleanup |
| `app/api/admin/sessions/[sessionId]/end/route.ts` | End a session |
| `app/api/admin/sessions/[sessionId]/route.ts` | Update guest_count |
| `app/admin/sessions/page.tsx` | Admin sessions dashboard |
| `app/admin/restaurants/[restaurantId]/qr/[touchpointId]/print/page.tsx` | Per-touchpoint print kit |

### Modified files

| File | Change | Blast radius |
|---|---|---|
| `components/admin/restaurants/RestaurantTablesTab.tsx` | Activate QR button (disabled → link to print route) | Tables tab only |
| `components/public/CartSheet.tsx` | Accept `visitSessionId` prop; conditional behavior | Only when prop is non-null |
| `app/api/public/orders/route.ts` | Accept `visit_session_id`; call RPC after insert | Additive; no existing behavior changes |
| `app/api/public/promotion-play/route.ts` | Accept `visit_session_id`; call RPC if present | Additive; existing play flow unaffected |
| `app/api/coupons/issue/route.ts` | Accept `visit_session_id`; call RPC if present | Additive; existing coupon flow unaffected |
| `app/play/[restaurantSlug]/[promotionSlug]/page.tsx` | Read `vsid` from searchParams; pass to play API | One new searchParam read |
| `app/admin/page.tsx` | Add Sessions dashboard tile | Additive |

### Zero-change files

- `app/r/[restaurantSlug]/page.tsx` — untouched; direct-link ordering unchanged
- `components/public/RestaurantPublicPage.tsx` — untouched
- `components/admin/restaurants/RestaurantQrTab.tsx` — untouched (restaurant-level QR unchanged)
- `app/admin/restaurants/[restaurantId]/qr/print/page.tsx` — untouched
- All other admin pages, promotions, games, coupons, menu builder

---

## K. Migration Order

```
(existing) 20260621000000_ordering_engine_v1.sql
(existing) 20260623000000_touchpoint_management_v1.sql
                          │
                          ▼
    20260624000000_session_management_v1.sql
    Contents:
      1. CREATE TABLE visit_sessions (all columns, constraints)
      2. CREATE UNIQUE INDEX + supporting indexes
      3. ALTER TABLE public.visit_sessions ENABLE ROW LEVEL SECURITY
      4. CREATE POLICY × 2 (owner select, owner update)
      5. CREATE FUNCTION increment_session_counters()
      6. CREATE FUNCTION mark_stale_sessions_abandoned()
      7. ALTER TABLE orders ADD COLUMN visit_session_id uuid REFERENCES visit_sessions(id) SET NULL
      8. CREATE INDEX orders_visit_session_idx
                          │
                          ▼
    20260624000001_session_management_capability_seed.sql
    Contents:
      1. INSERT INTO restaurant_capabilities (restaurant_id, 'session_management', false)
         SELECT id FROM restaurants ON CONFLICT DO NOTHING
```

**Two migrations. Zero changes to any existing migration.**

---

## L. Forward Compatibility with AI Session Agent Architecture

### Reserved column

`assigned_ai_agent text DEFAULT NULL` — present on `visit_sessions` from day one.

In v1: always NULL; no read or write in any application code.

In the future AI architecture: the AI session agent assigns itself to a session by writing its identifier here (e.g., `'spinnbite-dining-agent-v1'`). Multiple agent types can be registered by convention in this text field without schema change.

### What this schema leaves open

| Future capability | Required schema change |
|---|---|
| Customer identity linkage | `ADD COLUMN customer_profile_id uuid REFERENCES customer_profiles(id) SET NULL` |
| AI behavioral events | `CREATE TABLE visit_events (session_id FK, event_type, payload jsonb)` — `visit_sessions.id` is already the natural PK anchor |
| Agent action log | `CREATE TABLE session_agent_actions (session_id FK, agent, action, outcome)` |
| Multi-device coordination | `ADD COLUMN device_count integer DEFAULT 1` |
| Session templates/presets | `ADD COLUMN session_type text DEFAULT 'dine_in'` |
| Extended timeout configuration | `ADD COLUMN abandoned_timeout_hours integer DEFAULT 2` to `restaurant_settings` |
| Automated session routing | `assigned_ai_agent` column is already present |

None of these require altering the v1 columns. All are additive migrations.

### Analytics forward compat

The denormalized counter columns (`orders_count`, `total_spend`, etc.) are compatible with the future AI layer:
- AI reads counters in real-time to assess session engagement
- AI can adjust promotion strategy mid-session based on `menu_items_viewed` vs. `orders_count` ratio
- `promotion_interactions` and `coupons_issued` give the AI an attribution signal without a separate events table

### What the AI layer would add (not built now)

- `visit_events` table for fine-grained event stream
- AI-driven session insights in the admin dashboard
- Automated "End Session" trigger based on inactivity + order completion signal
- Cross-session customer identity stitching when customer identity ships

---

## M. Platform Invariant Compliance

| Invariant | Compliance |
|---|---|
| #1: Capabilities always per restaurant | `session_management` seeded per restaurant |
| #2: Ownership explicit at insert | `visit_sessions.restaurant_id` FK set from validated touchpoint |
| #4: Prices server-derived | No change to pricing flow |
| #5: Order numbers atomic | No change to `next_order_number()` |
| #6: Service role stays server-side | All session writes in API routes; anon key reads nothing |
| #7: No open RLS on platform tables | No public INSERT/DELETE on `visit_sessions` |
| #8: AI features are feature-flagged | No AI features in this build |
| #11: Architecture audit mandatory | This document is that audit |

---

## N. Investor Demo Narrative

When a restaurant owner or investor opens `/admin/sessions` during a demo shift:

> "Every table has a permanent QR code. When a customer scans it, SpinBite creates a session — automatically, before any order is placed. We track what they browse, how many times they interact with a promotion, and the exact spend from that session. You can see four active sessions right now. Table 3 has had 12 items viewed, one promotion played, and $47.50 spent in 22 minutes. This is the intelligence layer. Every visit is measured."

The architecture makes this true without requiring a customer to create an account, without any POS integration, and without any AI inference in v1.

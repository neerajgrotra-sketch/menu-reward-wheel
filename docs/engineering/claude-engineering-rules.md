# SpinBite Engineering Rules

## Rule 1 — Audit Before Modify

Before modifying any component:

- Search entire codebase for all imports
- Identify all dependent screens
- Report all downstream dependencies before editing

Never modify shared components blindly.

---

## Rule 2 — Branch Discipline

Every change requires a dedicated branch.

Examples:

feature/menu-builder-v3
fix/game-animation-regression
docs/architecture-update

Never work directly on main.

---

## Rule 3 — Report First

Before implementing:

Claude must first report:

- files affected
- dependencies affected
- possible regressions
- whether component is shared

No code before audit.

---

## Rule 4 — Shared Components Are Dangerous

Any file inside:

/components

must be treated as shared.

Before editing:

Search:

import ComponentName

across the repo.

---

## Rule 5 — No Silent UI Refactors

Claude must never refactor UI structure unless explicitly asked.

Forbidden:

- changing component hierarchy
- replacing animation systems
- changing shared CSS structure

without approval.

---

## Rule 6 — Database Safety

Before touching Supabase:

Claude must report:

- migrations needed
- affected tables
- RLS impact
- backwards compatibility

No direct schema modifications without approval.

---

## Rule 7 — Architecture Alignment

Before building features:

Claude must read:

/docs/architecture/spinbite-platform-architecture-v3.md

All new work must align with target architecture.

No feature may violate architecture.

---

## Rule 26 — Mandatory Architecture Pre-Audit (Platform Invariant #11)

No AI session, Claude session, engineer, or developer may implement:

- Architecture changes
- New features
- Schema modifications
- New API routes
- Security decisions
- Capability flags
- Restaurant configuration changes

Without first reading in full:

```
docs/architecture/spinbite-platform-architecture-v3.md
```

All implementation decisions must remain consistent with:

- Multi-tenant ownership model (`owner_id` is always explicit at insert time)
- Security boundaries (service role stays server-side; no open RLS on platform tables)
- Provider abstraction rules (prompts in DB; provider is data not code)
- Capability model (all capabilities are per restaurant, never global)
- All 11 platform invariants in the Appendix of the architecture document

This document is the single source of truth.

If a proposed change conflicts with the architecture document:

1. Stop.
2. Report the conflict explicitly.
3. Do not proceed until the conflict is resolved via an explicit architecture decision.
4. Update the architecture document before implementing.

No exception for urgency. No exception for "small" changes.

---

## Rule 8 — Validate Every Branch

Mandatory:

npm run lint
npx tsc --noEmit

Report results before merge.

---

## Rule 9 — Mobile First

Every UI change must be tested for:

- iPhone Safari
- bottom sheet behavior
- keyboard interactions
- viewport zoom
- swipe gestures

Desktop is secondary.

---

## Rule 10 — Preserve Existing UX

Never remove existing working UX unless requested.

If replacing behavior:

show before/after comparison first.

---

## Rule 11 — Minimize Blast Radius

Modify smallest number of files possible.

Avoid touching unrelated systems.

---

## Rule 12 — Audit For Side Effects

Before merge:

Check whether changes affect:

- admin menu builder
- public QR menu
- promotion builder
- game engine
- coupon engine
- authentication
- analytics

Always report possible side effects.

---

## Rule 13 — Single Source of Truth

Core product entities must never have duplicate implementations.

Examples:

- game definitions
- promotion definitions
- menu item state
- coupon state
- customer identity state

If multiple files independently define the same business entity, refactor immediately.

Shared business entities must be centralized.

Forbidden:

- duplicated enum definitions
- duplicated icon maps
- duplicated UI implementations for same entity
- duplicated hardcoded labels

Every core entity must have one canonical source of truth.

---

## Rule 14 — Brand Identity ≠ Game Identity

The SpinBite brand mark (🎯 target emoji) is platform branding only.

Game visuals represent gameplay mechanics.

These are two distinct identity systems and must never be mixed.

**Canonical Spin Wheel visual:**
- 8-segment conic-gradient wheel (45° segments)
- Segments: #FF6B00, #FFD166, #00C853, #E63939, #FF8A00, #FFF0C2, #2DD4BF, #F97316
- Black center hub with SPIN text
- Left-facing pointer (◀)
- Defined in: `components/game-visuals/GameVisual.tsx` → `MiniPrizeWheel`

**Canonical Lucky Reels visual:**
- CSS-only slot machine reel columns
- Gold gradient background
- Three coloured vertical reel panels
- Defined in: `components/game-visuals/GameVisual.tsx` → `MiniRewardReels`

**Forbidden:**
- Using 🎯 as the Spin Wheel game visual in any game card, selector, or marketing tile
- Using 🎰 as the Lucky Reels visual in any game card, selector, or marketing tile
- Using any emoji as a game visual in a game selection or marketing context
- Rendering `spinWheelContract.icon` as a game card visual (contract icons are for compact inline badges and heading text only, not for visual game tiles)

**Permitted uses of 🎯:**
- SpinBite nav logo
- Page headers (`🎯 SpinBite`)
- Inline text badges next to promotion names where no visual canvas exists

**Permitted uses of game contract `.icon` field:**
- Compact promotion badges (e.g. `🎯 Spin Wheel` text label beside promotion name in list views)
- Heading-level text decoration inside builder panels (`{game.icon} {game.name}`)
- These are inline text contexts, not visual game tile contexts

**Always use `getGameVisual()` from `GameVisual.tsx` for:**
- Game selection cards (any surface where customer or operator chooses a game)
- Marketing tiles that represent a specific game
- Any visual icon slot with width/height dimensions allocated for a game image

---

## Rule 15 — Verify Production After Every Merge

After merging to main, confirm the change is live across three layers before closing the task.

**Layer 1 — Git**
Confirm commit exists on origin/main:

```
git log origin/main --oneline -3
```

**Layer 2 — Vercel**
Confirm latest production deployment SHA matches the merged commit.
A READY state alone is not enough — the SHA must match.

**Layer 3 — Runtime**
Visit the production URL and verify the changed UI is visible.

Never report a task as complete until all three layers confirm.

---

## Rule 16 — Audit ≠ Implementation

A branch containing documentation, audits, analysis, reports, or architectural
recommendations must NEVER be merged assuming functionality changed.

Before any merge, mandatory checklist:

1. Which files changed?
2. Which runtime components changed?
3. Which user-facing behavior changed?
4. What exact bug is fixed?

No code changes = no merge.

A branch that only touches `.md` files fixes nothing in production.
Audit work and fix work are separate branches with separate commits.

---

## Rule 27 — Never Expose Developer Artifacts to Restaurant Users

Developer identifiers must never appear in the restaurant admin or customer-facing UI.

Prohibited:
- `#{index + 1}` position badges
- URL slug display (e.g. `/my-restaurant`)
- "Copy Link" developer utilities in the main action bar
- Internal IDs, UUIDs, or database row identifiers
- Technical column names used as labels

Permitted:
- Human-readable location info (name, address, city)
- Business-relevant identifiers (phone, website)
- Status information meaningful to the restaurant owner

If a restaurant owner would not naturally use a term in conversation, it must not exist in the UI.

---

## Rule 28 — Disabled Configurations Must Be Visibly Disabled

Any configuration option that does not fully alter system behavior must be clearly marked as unavailable.

Requirements:
- `opacity-60` on the disabled card/control
- `cursor-not-allowed` on click areas (never `pointer-events-none` — keeps them interactive)
- A visible "Coming Soon" badge on the card
- A toast on click: `"Coming soon — this mode will be available in a future update."`
- An explanatory note if the user currently has that configuration saved

Never silently accept a setting that won't be enforced. Disabled without interaction feedback feels broken.

---

## Rule 29 — Admin Editing Screens Must Mirror the Customer-Facing Storefront

The restaurant management page must visually match the geometry and layout of the public customer menu page.

Requirements:
- Hero image: same height (`h-64`), same gradient, full-width
- Info card: same `-mt-8 rounded-t-3xl bg-white shadow-xl` overlap
- Logo: same position (`absolute -top-10 left-5 h-20 w-20 rounded-2xl`)
- Restaurant name: same typography (`text-2xl font-black` or `text-3xl font-black`)
- Address: same `📍` prefix and `text-sm text-stone-500` treatment

When the public page layout changes, the admin card header must be updated to match.
The admin card is a live editable preview — not a separate design.

---

## Rule 58 — Menu Item Visual Metadata Must Obey Explicit Badge Hierarchy Priority

Menu item cards have a fixed badge slot system. Each slot holds exactly one badge. Priority order:

**Image overlay — left slot:** Sold Out (suppressed entirely) > On Special > Chef Special > Popular > none

**Image overlay — right slot:** Featured (suppressed when On Special is active)

**Metadata row below title:** Renders Featured / Chef / Popular as lightweight text when On Special occupies the left slot. Suppressed entirely when Sold Out.

Do not add new badges outside this hierarchy without first updating this rule and the `leftBadge` priority enum in `MenuItemCard`.

---

## Rule 59 — Only One Commercial Badge May Occupy Each Image Overlay Position

Each image overlay position (top-left, top-right) holds exactly one badge at a time.

Never stack two badges in the same position. Never introduce a third overlay position without an explicit architecture decision and update to Rule 58.

If a future dietary or promotional badge needs to appear, assign it to the metadata row below the title — not the image overlay.

---

## Rule 60 — Hard Item State Changes Override All Metadata Rendering

Hard state changes (Sold Out, Deleted, Unavailable) must suppress all commercial and promotional metadata.

When `available = false`:
- All image overlay badges are suppressed at the DOM level (not just visually covered)
- The metadata row below the title is suppressed
- The Sold Out overlay renders over the image
- The card is `opacity-60` and `cursor-default`

Sold Out is not a promotional state. It must dominate all promotional rendering.
Any future hard state (e.g. "Coming Soon", "Temporarily Unavailable") must follow the same suppression pattern.

---

## Rule 61 — Menu Cards Must Maintain Deterministic Height Regardless of Metadata Quantity

Every menu item card uses five fixed vertical zones:

- Zone 1: Image — `h-28` (fixed)
- Zone 2: Item Name — `line-clamp-2 min-h-[48px]`
- Zone 3: Metadata Pills — `min-h-[40px] max-h-[40px] overflow-hidden`
- Zone 4: Description — `min-h-[42px]` container with inner `line-clamp-2`
- Zone 5: Price Row — single line

No zone may resize based on content. All height is reserved even when content is absent.

---

## Rule 62 — Metadata Rendering May Never Alter Card Grid Alignment

Zone 3 (metadata pills) is always rendered in the DOM with fixed `min-h` and `max-h`.

It must never be conditionally mounted or unmounted based on whether tags exist.

`overflow-hidden` on Zone 3 is mandatory — it prevents future dietary tags from expanding the zone.

Any new tag type must be added to Zone 3 as a pill. No new zones may be introduced without updating Rule 61.

---

## Rule 63 — Promotional Badges Must Obey Strict Tier Hierarchy

Three tiers. Each tier has explicit constraints:

**Tier 1 — Image Overlay Left:** Discount only. One badge maximum. Suppressed when Sold Out.

**Tier 2 — Image Overlay Right:** Featured only. One badge maximum. Suppressed when Sold Out or when Discount is active (Featured moves to Zone 3).

**Tier 3 — Zone 3 Pills Row:** Chef Special, Popular, and all dietary tags (Vegetarian, Vegan, Halal, Kosher, Gluten Free, Spicy, Kids Friendly). Also receives Featured when Discount is in Tier 1. Unlimited count, capped by Zone 3 max-height.

Discount badges use `bg-emerald-500` (green = savings signal). Brand orange (`#FF6B00`) is reserved for SpinBite platform identity only and must never be used for promotional discount UI.

---

## Rule 31 — Never Architect Around Restaurant Tables

Tables are one touchpoint type, not the architecture.

The canonical entity is `restaurant_touchpoints`.

Future types include: `table`, `patio`, `counter`, `pickup`, `kiosk`, `bar`, `waiting_area`.

Forbidden:
- Creating a `restaurant_tables` table
- Adding table-specific columns (e.g. `table_number`, `table_name`) to the orders table
- Building admin UI that only understands tables (must understand touchpoints)
- Naming QR routes, slugs, or URL params as "table" in a hard-coded way

Always design for the touchpoint abstraction, not the physical table.

---

## Rule 32 — Orders Must Eventually Attach to Touchpoint Entities

The existing `orders.table_identifier` (text) is a legacy field from ordering engine v1.

It is display-only and must not be treated as a structured reference.

Future orders architecture:
- `orders.touchpoint_id uuid FK → restaurant_touchpoints(id)` is the structured reference
- `orders.table_identifier` may be retained for human-readable display (denormalized from `touchpoint.name` at write time)
- Never add new code that relies on `table_identifier` as a data source for business logic
- Any new feature that needs to know where an order came from must use `touchpoint_id`

When `touchpoint_id` migration ships, both fields coexist — `touchpoint_id` is authoritative.

---

## Rule 33 — QR Codes Identify Touchpoints, Not Restaurants

Restaurant-level QR codes (`/r/{slug}`) encode the restaurant only.

Table and location QR codes must encode a touchpoint reference:

```
/r/{restaurantSlug}?tp={touchpoint_code}
```

Use `?tp=` (touchpoint) not `?table=`. The param name must not assume type.

Forbidden:
- Using `?table=` as a permanent URL param name
- Hardcoding "table" into QR URL generation functions
- Generating table QR codes that point to a global slug namespace (`/t/{slug}`)

The `touchpoint_code` field on `restaurant_touchpoints` is the URL-safe identifier.
It is scoped to the restaurant — uniqueness is `UNIQUE(restaurant_id, touchpoint_code)`, not global.
It is stable once printed. Changing it invalidates physical QR codes — warn the user.


---

## Rule 35 — No Cached Reads on Transactional Restaurant State

Any API route that reads mutable transactional restaurant state must explicitly bypass the Next.js Data Cache.

**Transactional restaurant state includes:**

- Orders (`orders`, `order_items`)
- Visit sessions (`visit_sessions`)
- Coupons and coupon issuance
- Promotions and promotion interactions
- Analytics counters (`orders_count`, `total_spend`, `menu_items_viewed`, etc.)
- AI session state and interaction logs

**Mandatory pattern for all Supabase clients inside dynamic API routes:**

```typescript
return createServiceClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input as RequestInfo, { ...(init as RequestInit), cache: 'no-store' }),
  },
});
```

**Why `dynamic = 'force-dynamic'` alone is not sufficient:**

`dynamic = 'force-dynamic'` disables the Full Route Cache (prevents static pre-rendering of the route handler). It does NOT disable the Next.js Data Cache, which persists individual `fetch()` call results across requests. Since `@supabase/supabase-js` uses the global `fetch` internally, all Supabase API calls are subject to the Data Cache unless explicitly opted out.

**Root cause this rule prevents:**

A GET route returned `{orders: [], orders_count: 0}` on first call (correct — session was new). The Data Cache stored this empty response. Every subsequent call to the same route returned the stale cached response without ever hitting Supabase — causing the "My Orders" button to permanently show 0 after orders were placed.

**Enforcement:**

- Any new API route reading transactional state must include the `cache: 'no-store'` fetch override in its `makeServiceClient()`.
- The `Cache-Control: no-store` response header is also required (prevents CDN and browser caching), but is not a substitute for the fetch override.
- Read-only static data routes (menu items, restaurant profile, touchpoint config) are exempt — they benefit from caching.

---

## Rule 34 — Browser Cache Is Never Authoritative Session State

`sessionStorage` visit session data is a candidate hint only — never an active session identifier.

The backend resolve endpoint (`POST /api/public/sessions/resolve`) is the sole authority for active dining session identity.

`confirmedSessionId` is only ever set from a successful resolve response.

No component may use a cached session ID for transactional actions (ordering, coupon issuance, analytics attribution, My Orders) without a confirmed session.

Specific prohibitions:

- Never call `setState(cachedSessionId)` before backend validation
- Never allow `add to cart`, `place order`, `My Orders`, or coupon issuance while `sessionPhase !== 'confirmed'`
- Never silently degrade an invalid `visit_session_id` to `null` in the orders API — return `409 SESSION_INVALID`
- Never insert an order with a detached `visit_session_id = null` when a session was provided but invalid

Session phase state machine:

```
'resolving'      → backend round-trip in-flight (3s timeout)
'confirmed'      → backend returned active session; confirmedSessionId is set
'session_ended'  → session completed or abandoned
'resolve_failed' → timeout or network error; show retry
```

Passive engagement (menu browse, promotions, AI) is always allowed.
Transactional actions require `sessionPhase === 'confirmed'`.

---

## Rule 36 — Migration Gatekeeping

Every schema change must ship as a migration file in `supabase/migrations/`.

Mandatory for every migration file:

1. Timestamp-prefixed filename: `YYYYMMDDHHMMSS_scope_description.sql`
2. RLS enabled on every new table: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
3. No `using (true)` policy on any platform, session, intelligence, or owner-scoped table
4. All FK `ON DELETE` behaviors explicitly declared (CASCADE, SET NULL, or RESTRICT)
5. All CHECK constraints match the TypeScript enum values in the engine exactly
6. A rollback reference comment block at the bottom of the file
7. Applied to production only after code review and TypeScript/lint validation

Do not modify schema by running SQL directly in the Supabase dashboard. Changes not in migration files cannot be reproduced, audited, or rolled back.

---

## Rule 37 — Critical Path vs. Non-Critical Path Isolation

The following services are on the **critical path** — any failure is immediately user-visible:

- `POST /api/public/sessions/resolve` — session creation
- `POST /api/public/orders` — order placement
- `GET /r/[restaurantSlug]` — public menu render
- Supabase database connectivity

The following systems are **non-critical** — they are telemetry and intelligence layers:

- `session_guests` INSERT during session resolve
- `session_events` INSERT from the track route
- `increment_session_counters()` and `increment_guest_count()` RPCs
- `disconnect_session_guests()` after session end
- `SESSION_ENDED` event write after session end
- Supabase Broadcast REST call after session end
- All Decision Engine cycles and intervention logging

**Enforcement:**

Non-critical operations must always use one of:
- `fire-and-forget` via `void Promise.resolve(...).catch(console.warn)` pattern
- `try/catch` with warning log only
- Must never be awaited on the critical path

A failure in `session_guests`, `session_events`, or any intelligence system must never cause a session resolve error, an order failure, or any visible error to the customer.

---

## Rule 38 — Graceful Degradation of Intelligence and Telemetry Systems

Intelligence systems (session_events, session_guests, intervention_events, Decision Engine) must degrade silently if unavailable. They must never block, surface errors to customers, or prevent core dining flows.

Required patterns:

1. **Track route:** Returns `204 No Content` regardless of whether the session_events insert succeeded
2. **Resolve route:** Returns session_id even if session_guests insert failed
3. **Session end:** Returns `{ success: true }` even if broadcast, disconnect_guests, or SESSION_ENDED event fails
4. **Intelligence panel:** Shows inline error message if the intelligence load fails; does not crash the admin sessions page
5. **Decision Engine:** Runs silently; dispatcher stubs log to console only; no customer UI impact

If a non-critical system becomes consistently unavailable, it must be detected via server logs and fixed as a background task — not by surfacing errors to users.

---

## Rule 39 — Session Lifecycle State Machine Is Terminal

Visit session status transitions are **one-way and irreversible**:

```
active → completed   (manual admin end)
active → abandoned   (stale cleanup via mark_stale_sessions_abandoned())
```

**Never:**
- Re-open a completed or abandoned session
- Write to a non-active session via the critical path
- Increment counters on a non-active session (the RPCs guard against this — they check `status = 'active'`)
- Reuse a completed session's `visit_session_id` for a new order

When checking session eligibility before any write:
- The `increment_session_counters()` RPC already guards with `WHERE status = 'active'`
- The track route validates `session.status !== 'active'` and silently skips
- The heartbeat route returns `{ active: false }` when session is non-active
- The session end route returns `409` when session is already ended

---

## Rule 40 — No Direct Client Access to Session and Presence Tables

The following tables must **never** have SELECT, INSERT, UPDATE, or DELETE policies for the anon or authenticated role that would allow general customer access:

- `visit_sessions` — owner SELECT only
- `session_guests` — owner SELECT only
- `session_events` — owner SELECT only
- `intervention_events` — owner SELECT only
- `restaurant_touchpoints` — owner CRUD only
- `restaurant_capabilities` — owner read; owner update

All customer-facing access to these tables goes through **service-role API routes**:
- Customers resolve sessions via `POST /api/public/sessions/resolve` (service role)
- Customers send heartbeats via `POST /api/public/sessions/{id}/heartbeat` (service role)
- Customers fire events via `POST /api/public/sessions/{id}/track` (service role)
- Customers get presence via `GET /api/public/sessions/{id}/presence` (service role)

Never add an anon SELECT policy to these tables to support a customer-side realtime subscription. Use Supabase Broadcast instead (see Rule 41).

---

## Rule 41 — Realtime Fallback Design

Every realtime feature must have a polling fallback. No realtime-only feature is allowed.

The session termination fallback chain is the canonical pattern:

```
1. PRIMARY:  Supabase Broadcast to session-lifecycle:{sessionId}  (~200ms)
2. FALLBACK: Heartbeat poll returning { active: false }           (≤30s)
3. SAFETY:   Order API returning 409 SESSION_INVALID              (on action)
```

Rules:
- Supabase postgres_changes subscriptions require RLS SELECT on the target table
  - Anon/customer keys cannot subscribe to owner-scoped tables
  - Use Broadcast REST (server-side, service role) instead for customer-facing realtime
- All Supabase channel subscriptions must clean up on component unmount (`supabase.removeChannel()`)
- Never use a realtime event as the only mechanism to update state — always have a polling path
- Broadcast delivery is fire-and-forget (network errors are non-fatal; the fallback chain handles it)

---

## Rule 42 — Architecture Documentation Must Be Updated After Infrastructure Changes

After any of the following changes are merged to main, the architecture documentation in `/architecture/` must be updated **in the same PR or the immediately following PR**:

- New migration file (schema change)
- New API route
- New engine file or engine function
- New realtime channel (name or payload shape)
- Change to an existing API contract (request/response shape)
- Change to a database RLS policy
- New capability or restaurant setting

The architecture documents are:
- `/architecture/spinbite_system_architecture_v1.md` — system overview
- `/architecture/session_lifecycle_v1.md` — session state machine
- `/architecture/realtime_presence_v1.md` — channel contracts + fallback chain
- `/architecture/intelligence_engine_v2.md` — behavioral analysis layer
- `/architecture/decision_engine_v1.md` — opportunity detection + intervention types
- `/architecture/database_schema_map_v1.md` — full schema reference
- `/architecture/production_release_checklist_v1.md` — release gates
- `/docs/architecture/spinbite-platform-architecture-v3.md` — invariants + product decisions

Documentation-only branches do not require smoke tests but do require TypeScript and lint checks (Rule 8).

A branch that updates code without updating architecture documentation is incomplete.

---

## Rule 43 — Intelligence Requires Complete Instrumentation

No intelligence, analytics, or AI feature may be built on a partially instrumented customer event stream.

All interactions that feed a signal must be fully observable before the layer that reads that signal is trusted or shipped to production.

**What "fully observable" means:**

- Every event type the intelligence layer depends on is wired at the client or server event source
- The event fires reliably (not only on happy-path flows)
- The event is stored durably in `session_events` and readable via the intelligence route
- The event has been validated in at least one real session before analytics are built on top of it

**Current instrumentation gaps (as of 2026-06-29):**

| Event | Status | Blocked by |
|---|---|---|
| `ITEM_ADDED_TO_CART` | Not wired | Needs `onItemAddedToCart` callback in `RestaurantPublicPage.tsx` |
| `ITEM_REMOVED_FROM_CART` | Not wired | Needs `onItemRemovedFromCart` callback |
| `CATEGORY_OPENED` | Partially wired | Needs category drawer open tracking |
| `PROMOTION_VIEWED` | Not wired | Needs promotion route integration |
| `PROMOTION_PLAYED` | Not wired | Needs promotion play route integration |

**Enforcement:**

- Do not build cart-abandonment interventions until `ITEM_ADDED_TO_CART` and `ITEM_REMOVED_FROM_CART` are fully wired and validated
- Do not build promotion performance analytics until `PROMOTION_VIEWED` and `PROMOTION_PLAYED` are wired
- Do not train or prompt AI on session event data until the session under analysis has complete event coverage

This rule exists because analytics built on sparse data produce misleading signals. A cart-abandonment detector that never sees cart events will misfire on every session.

---

## Rule 44 — No New Code May Write to Deprecated Structures

Deprecated schema paths may remain in the database for backward compatibility. They must not receive new writes.

**Current deprecated structures (as of 2026-06-29):**

| Structure | Deprecated since | Replacement |
|---|---|---|
| `visit_sessions.session_interaction_log` (JSONB) | 2026-06-26 | `session_events` table |
| `orders.session_id` (text field) | 2026-06-24 | `orders.visit_session_id` (uuid FK) |

**Rules:**

- No new feature, API route, or migration may write to `session_interaction_log` except the single legacy `qr_scan` entry in `resolveSessionJoin()` (retained for historical continuity; will be removed when the field is dropped)
- No new feature may write to `orders.session_id` (text). All session references must use `orders.visit_session_id`
- No new code may read `session_interaction_log` for analytical purposes — use `session_events` instead
- When a deprecated field is ready to drop: create a migration to remove it, remove all remaining reads, and delete this entry from the list

Do not add new deprecated structures without adding them to this list in the same PR. Invisible deprecations cause divergence.

---

## Rule 45 — Autonomous AI Systems Require Production-Stable Foundations

Before any autonomous AI system (AI Waiter, AI Revenue Agent, autonomous promotion creation, autonomous pricing, customer reactivation agents) may be built or deployed:

The following four foundations must each be individually confirmed as production stable:

**1. Session Lifecycle**
- Session creation, reuse, abandonment, and manual end all function correctly in production
- The three-layer session-end fallback chain (Broadcast → heartbeat → 409) is verified end-to-end
- No known session state machine violations in production logs

**2. Event Fidelity**
- All 10 `session_events` types are wired and producing events in production sessions
- Cart funnel events (`ITEM_ADDED_TO_CART`, `ITEM_REMOVED_FROM_CART`) must be wired (Rule 43)
- At least 100 real sessions with complete event streams have been analyzed for correctness

**3. Realtime Synchronization**
- The `session-lifecycle:{id}` Broadcast subscription is wired on the customer page
- Session end propagation has been smoke-tested end-to-end: admin end → instant customer redirect
- Admin guest count realtime (postgres_changes on session_guests) is confirmed reliable

**4. Decision Runtime**
- At least one `ActionType` dispatcher is fully wired (not a stub) and writes to `intervention_events`
- Per-session intervention cooldown logic is implemented to prevent rapid re-firing
- The decision cycle has a production trigger (not just a manual test call)

**Why this rule exists:**

An AI agent that acts on incomplete behavioral data, flaky session state, or undelivered interventions will produce incorrect restaurant intelligence and potentially harmful customer experiences (wrong offers, ghost notifications, phantom coupons). The operational primitives must be stable before AI autonomy is layered on top.

This is Architecture Principle #7 from `/docs/architecture/spinbite-platform-architecture-v3.md`: "Do not build AI automation before operational primitives are stable."

---

## Rule 46 — No Blocking Intelligence Execution

Customer-facing request cycles must never block on intelligence processing longer than minimal deterministic evaluation.

**What this means:**

The following operations are **allowed** inside a customer response cycle:
- Writing a session event row (`session_events` INSERT)
- Writing a guest presence heartbeat (`session_guests` UPDATE)
- Evaluating a deterministic rule with no external I/O (e.g. cooldown check against an in-memory map)
- Returning a pre-computed value already stored in the database

The following operations are **forbidden** inside a customer response cycle:
- LLM calls (Claude, GPT, Gemini, or any language model inference)
- Prompt construction or template rendering for AI reasoning
- AI recommendation generation of any kind
- Adaptive policy computation that reads and synthesizes session history
- Promotion eligibility scoring beyond a simple DB column lookup
- Multi-step sequential DB reads aggregated for an intelligence result
- Any operation whose latency is proportional to session data volume

**Required pattern for anything in the forbidden list:**

Fire-and-forget from the request handler, then return immediately:

```typescript
// Correct — intelligence runs outside the response cycle
void evaluateSession(sessionId, guestId).catch(() => {});
return new NextResponse(null, { status: 204 });

// Wrong — blocks the customer on intelligence work
await evaluateSession(sessionId, guestId);
return new NextResponse(null, { status: 204 });
```

**Why this rule exists:**

A customer placing an order, scanning a QR code, or tapping a menu item should receive a sub-100ms response regardless of how sophisticated the intelligence layer becomes. If intelligence computation is allowed inside request cycles, every future LLM integration, every new signal type, and every new recommendation model will silently extend customer response latency.

The pattern of `void fn().catch()` from Rules 37 and 38 is not just a resilience pattern — it is a latency guarantee. Intelligence results are eventually consistent with customer actions, not synchronously required by them.

**Scope:**

This rule applies to all current and future intelligence subsystems:
- Decision Runtime (`evaluateSession`)
- AI Waiter recommendations (future)
- Promotion eligibility AI scoring (future)
- Adaptive menu ranking (future)
- Customer reactivation agent (future)
- Revenue yield optimization (future)

Any future intelligence subsystem that needs to act on a customer event must be wired as a fire-and-forget side effect of the customer route — never as an awaited dependency of the customer response.

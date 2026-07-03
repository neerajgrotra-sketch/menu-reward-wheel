# Menu Library — Pre-Merge Hardening Audit (2026-07-03)

**Branch:** `feature/menu-library-architecture`
**Trigger:** a stray open `INSERT` policy was discovered on `menu_categories` (carried over from the pre-redesign `menus` table via rename) while building the Menu Library redesign. This audit was requested before merge to check for the same class of bug elsewhere, and to close out several open design questions the redesign surfaced.

---

## 1. Orphan check: menu_id → category_id migration

Verified live, post-migration:

| Check | Result |
|---|---|
| `menu_items` with null `category_id` | 0 |
| `menu_items.category_id` pointing at a non-existent category | 0 |
| `menu_categories` with null `menu_id` | 0 |
| `menu_categories.menu_id` pointing at a non-existent menu | 0 |

24 items / 8 categories / 2 menus total, all correctly linked. This is also structurally guaranteed going forward — every relevant FK is `NOT NULL` with `ON DELETE CASCADE`, so the database itself refuses to create an orphan; this isn't just true today, it can't stop being true without a schema change.

## 2. Deterministic public QR menu resolution

Full algorithm documented in `docs/architecture/spinbite-platform-architecture-v4.md` §4.2.1. Writing it down surfaced a real gap (see §5 below).

## 3. Platform-wide RLS audit

Queried `pg_policies` for every `INSERT` policy with `with_check` missing/`true` and every `SELECT`/`UPDATE`/`DELETE` policy with `qual = true`, across all tables (confirmed RLS is enabled on every `public` schema table — no table is fully unprotected).

**Fixed in this branch (`20260703000002_menu_library_hardening_v1.sql`):**

| Table | Issue | Fix |
|---|---|---|
| `promotions` | `public insert promotions`, `WITH CHECK (true)`, role `public`. **No owner-scoped INSERT policy existed at all** — the app's real create-promotion flow was depending on this fully-open policy. Anyone unauthenticated could insert a promotion for any `restaurant_id`. | Added `owners insert own promotions` (mirrors the existing update/delete pattern: `restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())`), then dropped the open policy. Verified the app's own insert (`app/admin/promotions/page.tsx`) always runs authenticated, so this is lossless. |

**Found, tracked as follow-up (not fixed in this branch — different subsystems, lower severity, out of scope for a Menu Library PR):**

| Table | Issue | Notes |
|---|---|---|
| `guest_sessions` | Fully open `INSERT`/`SELECT`/`UPDATE` for `anon`+`authenticated`. Has 14 real rows. | Confirmed dead — zero references anywhere in `app/`, `lib/`, or `components/`. Superseded by `session_guests` (Session Presence Engine, §8.2 of the platform doc). Recommend formally dropping the table (same treatment already recommended for the unused `rewards`/`coupons` tables in §6.3) rather than patching RLS on dead code. |
| `intelligence_generation_logs` | Open `INSERT` (`with_check: true`) for `authenticated`. | All real inserts go through `serviceClient` (service role, bypasses RLS) in `lib/intelligence/intelligence-engine.ts`, `image-engine.ts`, `image-prompt-enhancer.ts` — the open policy is never exercised by legitimate code but would let any logged-in restaurant owner inject fake log rows (cost/usage integrity, not data exposure). Recommend replacing the authenticated INSERT policy with none (service-role-only writes), per Rule 22's intent even though this table predates that rule's explicit list. |

**Reviewed, no action needed (by design, already documented):**

- `games` SELECT `true` for `authenticated` — public reference/catalog data, not sensitive.
- `orders`/`order_items` SELECT `true` for `anon` — matches the documented capability-token model (platform doc §7: order UUID as unguessable token via Realtime). Confirmed the app never lists orders without an exact ID filter.
- `restaurants` SELECT `true` for `public` — intentional (public QR menu needs anonymous restaurant lookup by slug). Two policies do this redundantly (`public read restaurants` + `allow select restaurants`) — cosmetic duplication, not a vulnerability; worth consolidating in an unrelated cleanup pass.

## 4. Owner-scoped vs. organization-scoped menus

**Menus are owner-scoped, not organization-scoped — confirmed and enforced at the RLS layer, not just app convention.**

`menus.owner_id → auth.users(id)` directly, with no intervening organization/brand/chain entity (confirmed: no such table exists anywhere in the schema). `restaurant_menu_assignments`'s INSERT policy requires **both** `restaurant_id IN (owned restaurants)` **and** `menu_id IN (owned menus)` — a user can only assign a menu they own to a restaurant they own. This is consistent with the existing platform invariant (`restaurants.owner_id = auth.uid()` is the sole ownership derivation, per platform doc §2) and does not introduce a new sharing model.

**Known limitation, explicit non-goal for now:** a true multi-account franchise (Location A and Location B logging in as *different* users, sharing one menu) is not supported — the owning account must be the same for both the menu and every restaurant it's assigned to. This matches the platform's existing single-owner-account model; building cross-account sharing would require an organization/brand entity that doesn't exist yet and isn't in the locked product decisions.

## 5. Analytics attribution to menu_id

`order_items.menu_item_id` and `session_events.menu_item_id` both FK to `menu_items(id)` — there is no first-class `menu_id` column on either table. Attribution requires a two-hop join: `order_items.menu_item_id → menu_items.category_id → menu_categories.menu_id`.

Verified against live data: joined all 90 existing `order_items` through this chain — 0 unresolvable, all 90 correctly resolve to their menu. The join is reliable (every FK in the chain is `NOT NULL`), so attribution is possible today via query, just not denormalized. Recommend adding a `menu_id` column directly to `order_items`/`session_events` only if/when a reporting feature actually needs to filter by menu at scale — not speculatively.

## 6. Clone Menu

Implemented in `/admin/menus` (`cloneMenu()`): deep clone — new `menus` row + all active `menu_categories` + all active, non-deleted `menu_items` (soft-deleted/inactive rows are intentionally not cloned). Cloned items keep their original `restaurant_id` (the authoring restaurant is unchanged). The clone starts with **zero** `restaurant_menu_assignments` — identical to a brand-new "+ Create Menu" — so nothing changes on any public page until the clone is deliberately assigned.

## 7. Version column

Added `menus.version integer not null default 1`, auto-incremented by an `increment_menus_version` trigger whenever a `menus` row is actually updated (any column). **This is a placeholder — it does not enable rollback.** No snapshot/history storage exists; there is currently no UI that even updates a `menus` row's own fields (only its categories/items), so the trigger is inert until a menu-rename/edit feature exists. Verified via a rolled-back test transaction: an update correctly bumped `version` 1 → 2.

If real rollback becomes a requirement, it needs its own design (a `menu_versions` snapshot table + restore UI) — out of scope here per explicit decision.

## 8. 1700-line menu builder: refactor boundaries (report only — no refactor performed)

`app/admin/menus/[menuId]/page.tsx` is ~750 lines of state/logic (lines 74–841) + ~890 lines of JSX (842–1732), all in one component. No tests exist for it today, so any refactor carries real regression risk without manual QA — this section is a map for a *future*, separately-reviewed refactor PR, not a recommendation to touch it now.

Natural seams, in priority order:

1. **Image generation subsystem** (`stopImageGenPolling`, `resetImageGenState`, `startImageGenPolling`, `generateAIImage`, `acceptImageVariant` + `imageGenState`/`imageGenJobId`/`imageGenVariants`/`acceptingAssetId`) — a self-contained state machine (`idle → starting → generating → complete → failed`) with minimal external coupling (`editingItemId`, `restaurant.id`, a callback into `reloadItemsForMenu`). Highest-value extraction: `useImageGeneration(itemId, restaurantId)`.
2. **Item editor form state** (`editingItem*`/`originalItem*`, ~15 `useState` pairs for dirty-checking) — classic form-state-plus-snapshot pattern; a candidate for `useReducer` or a dedicated `useItemEditorForm(item)` hook.
3. **Category CRUD** (`addMenu`, `toggleMenu`, `toggleSettings`, `startRenameMenu`, `saveMenuName`, `deleteMenu`) — only ever touches `menu_categories`, cleanly separable.
4. **Item CRUD** (`addItem`, `saveItem`, `deleteItem`, `saveQuickAction`) — only ever touches `menu_items`, cleanly separable from category logic.
5. **JSX**: three natural components — header/hero/assignment-banner/create-category (top ~150 lines), the category list with expand/collapse (middle), and the `BottomSheet` item editor (largest single block — special-offer duration UI, AI image gen UI, tags, quick actions).

## 9. Edge cases

Both tested against live data via `BEGIN; ... ROLLBACK;` transactions (no permanent changes):

- **Zero assigned menus**: deactivated a restaurant's only assignment, confirmed the resolution query returns 0 assigned menus. Code path already handles this (§4.2.1 step 6) via `RestaurantPublicPage`'s existing `sections.length === 0` branch — no crash, no redirect.
- **Multiple active assigned menus**: gave one restaurant a second active assignment (to the other real menu in the DB). Categories/items split correctly with no cross-contamination (3 categories/6 items vs. 5 categories/18 items — matches known totals exactly). Confirmed the `display_order, created_at` ordering is stable across repeated runs (see §2/§4.2.1 — this test is what surfaced the missing tiebreaker, since both test assignments defaulted to `display_order = 0`).

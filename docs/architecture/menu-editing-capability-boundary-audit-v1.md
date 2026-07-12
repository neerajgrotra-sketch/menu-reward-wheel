# Menu Editing Capability Boundary Audit v1

**Created:** 2026-07-11
**Status:** Design audit. **Implemented 2026-07-12** — Option B (Step 8) was approved and built; see [`ask-spinbite-ai-agent-v1.md`](./ask-spinbite-ai-agent-v1.md)'s Capability Log (2026-07-12 row) for the shipped result and the implementation plan's file list. Ships disabled (`capability_settings.menu_agent` seeded `enabled: false`) pending a prompt revision and the Constraint #1 product decision flagged in Step 8 below — neither blocks the code, both are still open.
**Trigger:** production report — `"Adjust the price of Ras Malai to $7.99"` → `"The requested fixed price is not lower than the current price..."`. That message is real, not a bug in isolation — it's `lib/menu-discount-actions/resolve.ts:198-202`'s deterministic guard on a **discount**, and this request was never a discount. The bug is architectural: there is no capability in the system today that means "change the menu price," so every pricing-shaped sentence is forced through the one write-capable capability that exists, `menu_pricing`, whether or not it fits.
**Live state verified 2026-07-11** (not from memory, from the DB): `dashboard_assistant` is `enabled: true`, `menu_pricing` is environment-enabled, and prompt template v2 (`claude-haiku-4-5-20251001`, activated 2026-07-10 21:33 UTC) is `active`. This **supersedes** [`ask-spinbite-ai-agent-v1.md`](./ask-spinbite-ai-agent-v1.md)'s "Status" section, which still reads "not yet pasted into Intelligence Lab" — that has since happened. Ask SpinBite is live for real users today, which raises the stakes on this audit: the misrouting isn't a future risk, it's happening now.

---

## Step 1 — Audit of current capabilities

### `menu_pricing` — status `active`, the only write-capable capability today

| | |
|---|---|
| Purpose | Apply or clear a **promotional discount** (percentage off, or a lower fixed price) on menu items, optionally scheduled. |
| Supported commands | `set_discount` (`discountType: 'percentage' \| 'fixed_price'`), `clear_discount`. Target scopes: `all`, `category` (+`exclude`), `item`, `items` (explicit list), `name_contains` (+`exclude`). |
| Planner intent | `menu_discount_action` — `capability` is a **literal** `'menu_pricing'` in the type (`types.ts:114`), not a free string. |
| Execution route | Preview: `POST /api/admin/menus/discount-action/preview` (read-only). Apply: `POST /api/admin/menus/discount-action/apply` (writes). |
| Proposal generation | `buildProposal()` (`capabilities/menu-pricing.ts`) — resolves target names against live menu data, computes `Confidence`/`MatchKind`/plan tasks/a heuristic revenue-impact estimate, persisted as a versioned `restaurant_planner_proposals` row. |
| Execution logic | `applyDiscountProposal()` — **re-resolves against live data** before writing (never trusts the client's cached diff), skips no-ops, writes, logs. |
| Database writes | `menu_items.special_enabled` / `special_type` / `special_percent` / `special_price` / `special_start_at` / `special_end_at` / `special_no_expiry` — **never `menu_items.price`**. Plus one `menu_discount_change_log` row per changed item. |
| Limitations | `fixed_price` is structurally defined as *"a fixed price that is lower than the item's current price"* — `resolve.ts:198-202` filters out (and ultimately rejects with an error if zero survive) any candidate where `discount.value >= item.price`. This is the **correct** guard for a discount. It is simply the wrong action for "set the menu price to $X," which is a different operation that doesn't exist in this capability's type at all. There is no other `MenuDiscountAction` variant, and no other `PlannerOutput` variant that can carry a base-price write — the type system has no shape for it today, not just the prompt. |

### `revenue_intelligence` — status `active`, read + propose only, no independent writes

| | |
|---|---|
| Purpose | Classify a goal-shaped ask ("increase dessert sales") into one of 8 closed `RevenueGoalKey`s, then run a **deterministic, non-LLM** opportunity generator over real order/menu facts. |
| Supported commands | `revenue_goal` classification only — `increase_dessert_sales`, `increase_beverage_sales`, `increase_average_order_value`, `increase_lunch_traffic`, `increase_dinner_traffic`, `increase_promotion_engagement`, `increase_qr_adoption`, `increase_coupon_redemption`. |
| Planner intent | `revenue_goal` → `{ goal: RevenueGoalKey }`. |
| Execution route | Generates inline inside the normal chat turn (`POST /api/admin/assistant/messages`). "Applying" an opportunity calls `POST /api/admin/assistant/revenue-intelligence/create-proposal`, which converts the chosen `RevenueOpportunity` into an ordinary `menu_pricing` proposal. |
| Proposal generation | `lib/restaurant-planner/revenue-intelligence/opportunities/*.ts` — templated strings over real facts (`facts.ts`), never LLM prose. |
| Execution logic / DB writes | **None of its own.** Every `RevenueOpportunity.action` is a real `MenuDiscountAction` (`requiredCapability: 'menu_pricing'` is hardcoded on the type, `types.ts:77`). 2 of the 8 goals (`increase_qr_adoption`, `increase_coupon_redemption`) never produce a proposal at all — the code comment is explicit that "no honest `MenuDiscountAction` lever exists for either." |
| Limitations | Revenue Intelligence is a recommendation layer bolted **onto** `menu_pricing`; it cannot rename, restructure, or set a base price any more than `menu_pricing` itself can. Its `composeWhyThisRecommendation()` in `menu-pricing.ts` says this outright: a direct discount is recommended "because it is the change Ask SpinBite can apply automatically today," not because it's the best move — bundling/featuring alternatives are named but have no apply path. |

### The 8 `planned` stubs — metadata only, zero routes, zero logic

`CAPABILITY_REGISTRY` (`tool-registry.ts`) already has declarative stubs for `menu_agent`, `promotion_agent`, `pricing_agent`, `analytics_agent`, `campaign_agent`, `customer_agent`, `inventory_agent`, `ordering_agent`. All are `status: 'planned'`, `executionPermission: 'none'`. Two are directly relevant, and the registry has **already split this exact problem into two capabilities**, not one:

- **`menu_agent`** — label **"Menu Editing"** — `capabilities: ['Create, edit, or remove menu items and categories', 'Reorder menu structure', 'Manage item availability']`, `supportedActions: ['create_item', 'update_item', 'archive_item', 'reorder_category']`.
- **`pricing_agent`** — label **"Base Pricing & Bundles"** — `capabilities: ['Base price changes', 'Bundle/combo pricing', 'Dynamic pricing rules']`, `supportedActions: ['update_base_price', 'create_bundle']`.

This is a real design decision already made in the registry, months before this incident, and never built. Step 3 has to decide whether to honor that split or collapse it.

### The "Promotions" naming collision — flagged because Step 1 asked specifically about it

There are **two unrelated things called "promotion" in this codebase**, and this is part of why pricing logic drifted into the discount engine:

1. The real game/wheel reward system — `promotions` + `promotion_rewards` tables, spin-wheel prizes, redemption limits. Completely outside the Restaurant Planner. `promotion_agent`'s stub ("Promotions & Rewards") is the correctly-scoped future home for this.
2. The `menu_pricing` capability's own internal vocabulary — `tools/promotion.ts`'s `createPromotionDraft`/`previewPromotion`/`applyPromotion`/`cancelPromotion`, `ProposalCard`'s "Promotion" labels (`shortPromotionLabel`, `objectiveLabel`, `VISIBILITY_CHANNELS = ['Public Menu', 'Promotion Banner']`) — none of which touch the `promotions` table. These are internal names for the **discount**-proposal lifecycle.

Because `menu_pricing`'s own code already calls a discount a "promotion," a pricing request reads, from inside that module, as just another promotion input to normalize — not as a structurally different action that needs its own home. This naming collision is a contributing cause, not just cosmetic noise.

---

## Step 2 — Capability matrix

| Request | Owning capability today | Should own it | Notes |
|---|---|---|---|
| Apply 20% discount to chai | `menu_pricing` | `menu_pricing` | Fully supported, works today. |
| Increase Butter Chicken to $21.99 | `menu_pricing` (misrouted, fails or wrongly creates a special) | **`menu_edit`** (proposed) | Exact absolute target, no discount keyword, no schedule. |
| Decrease Naan by $1 | `menu_pricing` (misrouted) | Ambiguous — see Step 5 | Could mean "permanently $1 less" (`menu_edit`) or "$1 off, promotionally" (`menu_pricing`). Needs a disambiguation rule, not a guess. |
| Increase every appetizer by 5% | `menu_pricing` (cannot express — see below) | **`menu_edit`** | `isDiscountSpec` only ever means "off"/lower — a request to *raise* a price cannot structurally be a valid `set_discount`, which is itself a clean deterministic routing signal. |
| Round every dessert to .99 | Not supported anywhere | **`menu_edit`** (bulk op) | New bulk-normalization logic, not currently built in either engine. |
| Rename Butter Chicken | Not supported (menu_pricing reads names, never writes them) | **`menu_edit`** | |
| Hide Garlic Naan | Not supported by the AI (exists for humans — see Step 4) | **`menu_edit`** | |
| Move Ras Malai into Desserts | Not supported anywhere, **including the human admin UI** | **`menu_edit`** | Real gap at the primitive level, not just an AI gap — see Step 4. |
| Create a weekend combo | Not supported (no bundle primitive in the schema) | New: bundle capability (composition = `menu_agent`/future; combo pricing = `pricing_agent`) | 0% built at the schema level; needs new tables before either agent can do anything. |
| Pair chai with ras malai | Read-only insight; `composeAlternatives()` already computes co-order pairs internally, but nothing surfaces it as a direct answer | `analytics_agent` (planned) | Distinct from "create a combo" — this is a suggestion, not a write. |
| Offer 20% off desserts after 7 PM | `menu_pricing` | `menu_pricing` | Fully supported, works today (category scope + `startTime`). |
| Increase dessert sales | `revenue_intelligence` | `revenue_intelligence` | Supported — classifies to `increase_dessert_sales`, resolves into a `menu_pricing` proposal. |
| Increase average order value | `revenue_intelligence` | `revenue_intelligence` | Supported — `increase_average_order_value`. |
| What is the price of Ras Malai? | `answer` intent (free-text over the menu snapshot) | `answer` intent | Read-only, no action, no proposal — works today. |
| Which desserts have no photos? | `answer` intent (model reasoning over the snapshot, not a grounded query) | Should be grounded via `analytics_agent`/existing `getMenuItem`/`searchMenuItems` read tools | Today's answer is un-verified model prose over context; a deterministic tool call would remove hallucination risk. |
| Which items are selling poorly? | Not supported (no ranking query exposed to chat) | `analytics_agent` (planned) | `revenue-intelligence/facts.ts` already computes order counts per item — the aggregation exists, it's just not exposed as a direct answer. |
| Which menu items have never been promoted? | Not supported | `analytics_agent` (planned) | Would cross-reference `menu_discount_change_log`/`special_enabled` history. |

**Zero-ambiguity rule that falls out of this matrix:** any request whose *direction* is "raise the price" or whose target is an absolute value with no discount/schedule language cannot be `menu_pricing` — the type itself forbids it. Everything else pricing-shaped that mentions a percentage/dollar-off, a schedule, or "special"/"sale"/"promo" vocabulary is `menu_pricing`. The only genuinely ambiguous case in the whole matrix is a bare relative decrease ("decrease Naan by $1") with no other signal.

---

## Step 3 — Should Menu Editing be its own capability?

**Yes.** Not a refactor of `menu_pricing` — a new, structurally distinct capability. Justification, from the architecture already in place:

- `menu_pricing`'s entire type contract (`DiscountSpec`, the `<` guard in `resolve.ts`, `special_*` columns) is *about* a temporary, schedulable overlay on top of a price. It cannot represent a permanent change to the base record without either abusing the discount shape (writing a "discount" that's actually meant to be permanent — leaves a phantom `special_enabled: true` row forever) or growing new, unrelated branches inside a module whose entire design center is "discount."
- The registry **already anticipated this exact split** (`menu_agent` vs. `pricing_agent`, both stubs). This audit doesn't need to invent the boundary — it needs to decide whether to build both stubs as one capability or two, and Step 8 recommends collapsing them into one (`menu_agent`) for v1 — see Step 8 for why.
- `revenue_intelligence` proves the "capability composes into `menu_pricing`'s apply path" pattern already works cleanly for a *proposal generator*. A Menu Editing capability is a peer to `menu_pricing`, not a layer on top of it the way `revenue_intelligence` is.

Definition, per the requested fields:

| Field | Definition |
|---|---|
| Purpose | Structural/base-record changes to a menu item or category: base price (exact or relative), name, description, category, visibility, featured/tag flags — never a temporary/schedulable overlay. |
| Supported actions (v1) | `set_price` (exact), `adjust_price` (relative, `%` or `$`, increase or decrease), `rename`, `update_description`, `set_availability` (show/hide), `set_featured`, `set_tags` (chef special / popular). Bulk variants of all of the above via the same scope machinery `menu_pricing` already has (`all`/`category`/`items`/`name_contains`). |
| Proposal format | Same shape as today's `restaurant_planner_proposals` row: `capability`, `resolved_snapshot` (before/after per item), `confidence`, `reasoning`, `plan_tasks`. No new proposal concept. |
| Execution model | Preview (read-only, resolve + diff) → human-confirmed Approve → apply (re-resolve against live data, write, audit). Identical shape to `menu_pricing`'s preview/apply pair. |
| Approval model | Same human-confirmation gate as `menu_pricing` — `ProposalCard`'s Approve button is the only caller of the apply route. No new approval concept, no autonomous execution. |
| Database writes | `menu_items.name` / `price` / `description` / `available` / `is_featured` / `tags` / `category_id` (for the "move category" action, once that primitive exists — see Step 4) — **never** the `special_*` columns. |
| Relationship to Menu Pricing | Peers, not layers. Both target the same `menu_items` rows but write disjoint column sets (`price` vs. `special_*`). Sibling capabilities under a shared target-resolution helper (see Step 6) — not one calling the other. |
| Relationship to Revenue Intelligence | Today `revenue_intelligence`'s opportunities only ever resolve into `menu_pricing` proposals (discounts). Once Menu Editing exists, some goals (e.g. a future "increase visibility of X" goal) could resolve into a `menu_edit` proposal instead — additive, not required for v1. |

---

## Step 4 — Designing the Menu Editing capability: what already exists vs. what's new

Checked directly against `app/admin/menus/[menuId]/page.tsx`, the existing human admin editor (`saveItem()` / `saveQuickAction()` / `addItem()`), not assumed:

| Operation | Exists today (human admin UI) | Notes |
|---|---|---|
| Set exact price | ✅ `saveItem()` writes `menu_items.price` directly | Not exposed to AI in any form. |
| Increase/decrease price (relative) | ❌ | The form only accepts an absolute new value — no "+/- $X" or "+/- X%" primitive exists anywhere, human or AI. Trivial new logic (`current ± delta`), reusing the existing write path. |
| Bulk price adjustments | ❌ | Human UI edits one item at a time. Needs new bulk-scope logic — can reuse `menu_pricing`'s `DiscountTarget`-shaped scope resolution directly (see Step 6). |
| Rename item | ✅ `saveItem()` | |
| Edit description | ✅ `saveItem()` | A *third*, separate AI touchpoint already exists here too — `menu_description_generation`, an unrelated content-generation feature wired into this same form (line ~1675), not part of the planner. |
| Change category | ❌ — **not even in the human admin UI** | `category_id` is set once at item creation (`addItem()`); no "move to a different category" affordance was found anywhere. This is a real product gap independent of AI — it needs to be built at the primitive level (a route/form control) before an AI capability can wrap it. |
| Hide item / Show item | ✅ `saveQuickAction({ available })` | Optimistic quick-toggle, separate code path from the full edit form. |
| Mark featured | ✅ `saveQuickAction({ is_featured })` | |
| Mark chef special / Mark popular | ✅, but implemented as string literals inside the `tags` array (`'chef_special'`, `'popular'`), not dedicated boolean columns | Fine to wrap as-is; no schema change needed. |
| Adjust availability | ✅ (same as Hide/Show) | |
| Change image | ✅, but via a separate subsystem (`generate-food-image` AI feature + manual `image_url`), not `saveItem()`'s payload | Out of scope for v1 — different capability entirely. |
| Change preparation time | ❌ — **no such column exists in `menu_items`** | Would require a migration before any capability (human or AI) could support it. Out of scope for v1. |
| Change tax category | ❌ — **no tax-related column exists anywhere in `menu_items`** | Same as above — schema doesn't support it yet; likely belongs to a broader future tax-handling feature, not this capability. |

**v1 scope recommendation:** everything with a ✅ above (price set/adjust, rename, description, availability, featured, tags), plus bulk variants of the price/availability/featured actions using the existing scope machinery. Category move, prep time, and tax category are excluded from v1 — the first because it's missing even for humans, the latter two because the columns don't exist.

---

## Step 5 — Natural language routing rules

The routing decision must be **deterministic and schema-enforced**, the same pattern already used for `revenue_goal`'s closed 8-key enum — not left to model judgment on free text. Signals, in priority order:

1. **Direction is structurally decisive.** `menu_pricing`'s `DiscountSpec` can only ever mean "lower than current" (percentage 0–100 exclusive is always "off"; `fixed_price` is validated `< current price`). **Any request to raise a price cannot be `menu_pricing` by construction** — this is not a heuristic, it's a type-level fact, and the router (the prompt's decision rule, mirrored by validators) should treat it as a hard classification signal, not a hint.
2. **Discount/promo vocabulary → `menu_pricing`.** "%", "off", "discount", "sale", "special", "promo".
3. **Temporal/scheduling language → `menu_pricing`.** "after 7pm", "this weekend", "for 2 hours", "no expiry" — `menu_edit` changes are immediate and permanent; there is no schedule concept in the new capability by design (matches Step 3's purpose).
4. **"to $X" (absolute target, no discount keyword, no schedule) → `menu_edit` (`set_price`).** This is exactly the case that broke: `"Adjust the price of Ras Malai to $7.99"` has an absolute target, zero discount vocabulary, zero temporal language → deterministically `menu_edit`, never `menu_pricing`.
5. **"by $X" / "by X%" with an increase/decrease verb, no discount keyword → `menu_edit` (`adjust_price`).**
6. **Genuinely ambiguous (a bare relative decrease with no other signal, e.g. "decrease Naan by $1")** → `clarification`, asking whether this is a permanent price change or a temporary discount — the same graceful-ambiguity pattern already used for name resolution (`PlannerCandidate`s), not a guess in either direction.

Worked examples (including the two the product spec named, and the one from production):

| Input | Signal(s) | Routes to |
|---|---|---|
| "Increase Butter Chicken to $22" | direction=increase (rule 1) + absolute target | `menu_edit` |
| "20% off Butter Chicken" | discount vocabulary (rule 2) | `menu_pricing` |
| "Adjust the price of Ras Malai to $7.99" | absolute target, no discount/schedule language (rule 4) | `menu_edit` — **fixes the reported bug** |
| "Offer 20% off desserts after 7 PM" | discount + temporal (rules 2, 3) | `menu_pricing` |
| "Decrease Naan by $1" | relative, no other signal | `clarification` |

This lives in the `PlannerOutput` contract and the prompt's decision rules — the same place `revenue_goal`'s classification already lives — not as a second model call or a heuristic layered on top of the existing one.

---

## Step 6 — Implementation plan (if approved) — reuse-first

Everything below composes existing infrastructure. The only genuinely new pieces are marked **NEW**.

| Piece | Plan |
|---|---|
| `PlannerOutput` | **NEW variant**, additive to the existing union: `{ intent: 'menu_edit_action'; capability: 'menu_agent'; action: MenuEditAction; refersToProposalId?: string }` — mirrors `menu_discount_action` exactly. `parsePlannerOutput` gets one more `if` branch; the four existing branches are untouched. |
| Action schema | **NEW** `lib/intelligence/actions/menu-edit-schema.ts` — `MenuEditAction` union (`set_price`, `adjust_price`, `rename`, `update_description`, `set_availability`, `set_featured`, `set_tags`). Target scope should be **extracted**, not duplicated: `DiscountTarget`'s scope shape (`all`/`category`/`item`/`items`/`name_contains`, with `exclude`) is capability-agnostic already — pull it into a shared `lib/restaurant-planner/target-scope.ts` both capabilities import. This is the one small refactor worth doing now rather than hand-copying the same union twice. |
| Resolution | **NEW** `lib/menu-edit-actions/resolve.ts`, same shape as `resolve.ts` (`isResolvableAction`, `resolveMenuEditAction`), calling the shared target-scope resolver, diffing base-record fields instead of `special_*`. |
| Capability module | **NEW** `lib/restaurant-planner/capabilities/menu-edit.ts` — `buildProposal`/`revalidateProposal`/`applyMenuEditProposal`, same shape as `menu-pricing.ts`. Reuse `Confidence`/`PlanTask` from `proposal.ts` as-is (already capability-agnostic per its own header comment). |
| Routes | **NEW** `POST /api/admin/menus/edit-action/{preview,apply}` — mirror the discount-action routes 1:1: `getRestaurant` tool for ownership, `isCapabilityAvailable('menu_agent', ...)` gate, revalidate-before-write, audit insert. |
| Registry | `tool-registry.ts`: flip `menu_agent` from the `PlannedCapability` shape to `ActiveCapability` (`status: 'active'`, fill in the two endpoint strings). This key **already exists** — this is a status change plus two URLs, not a new registry entry. |
| Proposals table | `restaurant_planner_proposals` — reuse as-is. `capability` is already a free string column, `resolved_snapshot` is already `jsonb`. Zero schema change. |
| Tools library | **NEW** `lib/restaurant-planner/tools/menu-edit.ts` — `renameItem`/`setPrice`/`adjustPrice`/`setAvailability`/`setFeatured`/`setTags`, registered in `TOOL_REGISTRY`. Write-permission tools, never callable by the model directly — same invariant as `applyPromotion`. |
| Audit log | **NEW** `menu_edit_change_log`, copy-pasted shape/RLS from `menu_discount_change_log` (owner-scoped, not `is_super_admin()`). Deliberately a separate table, not an overload of the discount log's semantics — same reasoning `menu_discount_change_log` itself used for *not* reusing `intelligence_audit_log`. |
| `ProposalCard.tsx` | **Real change required, not free reuse.** Despite the architecture doc describing the card as "capability-routed," it currently imports `ResolvableAction`/`ResolvedDiscountItem` **directly** from `lib/menu-discount-actions/resolve` and hardcodes discount-specific copy (`shortPromotionLabel`, `'Discount Removal Recommendation'`, `VISIBILITY_CHANNELS = ['Public Menu', 'Promotion Banner']`, a "Schedule" section that has no `menu_edit` equivalent). This needs a capability-aware branch or a data-driven refactor before a second capability can render through it — flagging this now so it isn't discovered mid-implementation. |
| Capability settings | Seed one environment-level `capability_settings` row for `menu_agent`, `enabled: false` — ships dark by default, same launch pattern `menu_pricing` used. |

---

## Step 7 — Migration strategy: zero risk to existing discount functionality

- **Every change above is additive.** `menu_pricing`'s files (`DiscountTarget`, the `<` guard in `resolve.ts`, `applyDiscountProposal`) are not touched. `parsePlannerOutput` gains one more `if` branch in a chain of independent branches — no existing branch's logic changes.
- **The live prompt template must be extended, not replaced.** Since `dashboard_assistant` v2 is confirmed **active in production right now** (verified above — this is not a future risk, it is happening today), any prompt change needs a new version (v3) that adds the `menu_edit_action` instructions and Step 5's routing rules on top of the existing `menu_discount_action`/`revenue_goal`/`clarification`/`unsupported`/`answer` instructions, per this repo's existing prompt-versioning convention (`intelligence_prompt_templates.version`, old versions archived not deleted). Old persisted `restaurant_planner_proposals`/`dashboard_assistant_messages` rows are still validated by the unchanged `isMenuDiscountAction`/`isDiscountTarget` and continue to parse and resolve identically.
- **`menu_agent` ships disabled by default** (Step 6's `capability_settings` seed), so the new intent can be authored, tested, and toggled on for a single restaurant via the existing 3-scope capability settings system — without touching `menu_pricing`'s live `enabled: true` state at all.
- **Rollback is a single flag flip**, same as today's system: setting `menu_agent`'s environment row back to `enabled: false` returns to exactly today's behavior (misrouted, but that's the known-quantity status quo, not a regression) with zero code revert needed.

---

## Step 8 — Recommendation

**B) Create a new `menu_edit` capability**, scoped to the ✅ items in Step 4 for v1 (price set/adjust including bulk, rename, description, availability, featured, tags) — implemented as the registry's existing `menu_agent` stub, not a new registry key.

Reasoning, architecture first:

1. **The type system already refuses to let `menu_pricing` do this correctly.** `DiscountSpec` cannot express a price increase at all, and its `fixed_price` variant is validated specifically as "lower than current" — not a prompt-tuning problem, a shape problem. Expanding `menu_pricing` (option A) means either loosening that guard (breaking the actual discount invariant "a discount is lower than the current price," which is correct and should stay) or growing a parallel, unrelated `is_base_price_change: boolean` escape hatch inside a module whose entire design center — schedule, `special_*` columns, `menu_discount_change_log` — is about temporary overlays. That produces exactly the kind of "one type doing two jobs" ambiguity this audit exists to eliminate.
2. **The extensibility work is already done.** `CAPABILITY_REGISTRY`'s `menu_agent` stub, `PlannerOutput`'s string-typed `capability` field, `restaurant_planner_proposals`' capability-agnostic schema, and the Restaurant Tool Library's `getRestaurant`/`getConversationContext`/target-resolution primitives were all built, by design, so that "add a second capability" would be additive. This is that second capability — building it now is lower-risk than it will ever be again, since `menu_pricing` is the only precedent and hasn't yet accumulated a second consumer's assumptions.
3. **Long-term product vision**, per the roadmap doc: eight future agents were named specifically so a request could route to the *right specific one* instead of a generic "not supported." Folding Menu Editing into Menu Pricing would permanently conflate two of those eight, undermining the very capability model the roadmap describes.
4. **One open product question this recommendation does not resolve, and shouldn't resolve unilaterally:** `ai-engine-roadmap-v1.md`'s Constraint #1 says *"The AI cannot change `menu_items.price`."* `ask-spinbite-ai-agent-v1.md` already flagged this constraint as unresolved for the `special_*` columns; a `menu_edit` capability would be the first AI-driven write to the literal `price` column the constraint names. This needs the same explicit product sign-off the existing doc asked for regarding `special_*` — it should not be inferred from "the architecture supports it, so it must be fine." Recommend resolving both open Constraint #1 questions together, in one product decision, before `menu_agent`'s `enabled` flag is ever flipped to `true` for a real restaurant.

No code has been written for this audit. Steps 6–7 are a plan to review, not a diff to merge.

---

## Files map (for implementation, if approved)

| Concern | File |
|---|---|
| Root cause of the reported bug | `lib/menu-discount-actions/resolve.ts:198-202` (the `fixed_price < current` guard — correct for a discount, not a fix target) |
| Capability registry (flip `menu_agent` to active) | `lib/restaurant-planner/tool-registry.ts` |
| Planner output contract (add `menu_edit_action`) | `lib/restaurant-planner/types.ts` |
| Existing human editor to mirror/reuse column-write logic from | `app/admin/menus/[menuId]/page.tsx` (`saveItem`, `saveQuickAction`, `addItem`) |
| Card needing a capability-aware branch | `components/admin/dashboard/ProposalCard.tsx` |
| Precedent for the whole shape (preview/apply/revalidate/audit) | `lib/restaurant-planner/capabilities/menu-pricing.ts`, `app/api/admin/menus/discount-action/{preview,apply}/route.ts` |
| Live prompt template needing a v3 | `intelligence_prompt_templates` (`feature_key = 'dashboard_assistant'`, currently v2, `claude-haiku-4-5-20251001`) — author via `/super-admin/intelligence-lab`, per Rule 20 never in source. |

See [`ask-spinbite-ai-agent-v1.md`](./ask-spinbite-ai-agent-v1.md) for the planner this sits underneath and [`restaurant-tool-library-v1.md`](./restaurant-tool-library-v1.md) for the reusable tool layer this plan builds on.

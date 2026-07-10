# Restaurant Tool Library v1

**Created:** 2026-07-10
**Status:** Merged, wired into all 6 Restaurant-Planner routes. Behavior-preserving — no user-visible change.

## What this is

Every "tool" the Restaurant Planner actually used — resolving a menu target, estimating impact, checking ownership, fetching conversation context — already existed as real, tested, correct code before this doc. It just wasn't *named*, *registered*, or *discoverable*: `buildProposal()` called `fetchAssignedMenus`/`resolveMenuDiscountAction`/`estimateDiscountImpact` as plain function calls, six routes each re-typed the identical restaurant-ownership query inline, and the one registry that existed (`CAPABILITY_REGISTRY` in `tool-registry.ts`) registered *capabilities* (`menu_pricing`, `analytics_agent`, ...), not individual callable *tools*.

This is a **behavior-preserving extraction**, not new business logic. `lib/restaurant-planner/tools/` gives every reusable operation a name, an input/output type, a permission level, and one canonical implementation — the stable surface a future capability (Pricing, Promotion, Analytics, Marketing, Inventory, Staff, Customer, Operations — see `ai-engine-roadmap-v1.md`) composes instead of re-deriving its own version of "fetch the menu" or "check ownership."

**Explicitly out of scope, not touched:** the planner's classify step (`planner-engine.ts`), the `PlannerOutput` contract (`types.ts`), `CAPABILITY_REGISTRY`'s shape, and `restaurant_planner_proposals`'s schema/versioning. This is a layer *underneath* those, not a redesign of any of them.

## The two registries — a naming collision that predates this doc

There are now two distinct registries in `lib/restaurant-planner/`, and the names don't disambiguate them:

| | Registers | File |
|---|---|---|
| `CAPABILITY_REGISTRY` | **Capabilities** — `menu_pricing`, `analytics_agent`, `promotion_agent`, etc. Each entry describes what a capability does, its status (`active`/`planned`), and its execution permission. | `lib/restaurant-planner/tool-registry.ts` |
| `TOOL_REGISTRY` | **Individual callable functions** — `searchMenuItems`, `validateDiscount`, `getRestaurant`, etc. Each entry declares which capability it belongs to via its `capability` field. | `lib/restaurant-planner/tools/registry.ts` |

`tool-registry.ts`'s filename says "tool" but it registers capabilities — a pre-existing mismatch, **deliberately not renamed here** (the task explicitly excluded redesigning the capability registry, and a rename would touch every import site across the planner for zero functional benefit). If you're looking for "the list of tools," that's `tools/registry.ts`'s `TOOL_REGISTRY`, not `tool-registry.ts`.

## The tool contract

No runtime schema-validation library exists anywhere in this repo (confirmed convention — hand-rolled guards throughout, e.g. `isMenuDiscountAction`) and none was introduced here. Input/output "schemas" are TypeScript types co-located with each tool, not a validated wire format.

```ts
// lib/restaurant-planner/tools/types.ts
type ToolPermission = 'read' | 'propose' | 'write';

type ToolContext = {
  supabase: SupabaseClient<Database>;      // session-authenticated — RLS is the real boundary
  serviceClient: SupabaseClient<Database>; // service-role — only for platform tables (capability_settings)
  restaurantId: string;
  ownerId: string;
};

type ToolOutcome<T> = { ok: true; data: T } | { ok: false; reason: string };

type ToolDefinition<Input, Output> = {
  name: string;
  description: string;
  capability: CapabilityKey;   // from CAPABILITY_REGISTRY
  permission: ToolPermission;
  mutating: boolean;
  version: number;
  execute: (input: Input, ctx: ToolContext) => Promise<ToolOutcome<Output>>;
};
```

- **Tools return structured JSON only, never LLM-generated text.** Every `execute` returns a `ToolOutcome` built from real query results or pure computation — nothing in `tools/*.ts` calls `generate()` or any model provider.
- **`ok: false` means the tool call itself failed** (not found, DB error, access denied) — distinct from a negative domain answer, which is still `ok: true`. `validateDiscount` returns `ok({valid: false, reason: '...'})` for a discount that's out of bounds, not `fail(...)` — the validation check itself ran successfully; it just said no. `fail(...)` is for "the tool couldn't complete its job," not "the answer was no."
- **A tool never throws across its `execute` boundary if the underlying failure is a normal, expected one it can categorize.** `cancelPromotion` is the concrete example: `insertProposalVersion` can throw on a DB error, and the original inline code (before this extraction) wrapped that specific call in a try/catch for "best-effort" semantics — a failure to log a cancellation must not break the outcome response. `cancelPromotion.execute` now catches internally and returns `fail(...)`, so every caller gets that guarantee for free instead of needing its own try/catch. `applyPromotion` (a `write`-permission tool) is a deliberate exception — it does **not** catch internally, matching the original apply route's behavior of letting a write failure surface as an unhandled 500 rather than a soft failure.
- **`write`-permission tools are registered for documentation and discovery only.** Exactly as before this extraction, nothing the model itself can call includes a write tool — only the human-gated apply routes invoke `applyPromotion`. This is an unchanged invariant, not a new one.

## Available tools

| Tool | Permission | Reuses | Notes |
|---|---|---|---|
| **Menu Tools** (`tools/menu.ts`) |
| `searchMenus` | read | `fetchAssignedMenus` | |
| `searchMenuCategories` | read | `fetchMenuContents` | |
| `searchMenuItems` (alias: `findItemsByName`) | read | `matchByName` (`resolve.ts`, exported for this) | |
| `getMenuItem`, `getMenuItemsByCategory` | read | `fetchMenuContents` | filter over already-fetched rows |
| `getFeaturedItems`, `findItemsByTags` | read | `fetchMenuContents` | new, trivial — `is_featured`/`tags` columns existed unused |
| **Promotion Tools** (`tools/promotion.ts`) |
| `createPromotionDraft` | propose | `buildProposal()` | unchanged internals — see below |
| `previewPromotion` | read | resolve+estimate sequence from the preview route | now the route's actual implementation, not just a wrap alongside it |
| `applyPromotion` | **write** | `applyDiscountProposal()` | the only write tool; never caught internally, see above |
| `cancelPromotion` | propose | `insertProposalVersion(..., status:'cancelled')` | now catches internally, see above |
| `archivePromotion` | — | **not built** | no `'archived'` `ProposalStatus` exists; inventing one is new business logic |
| **Pricing Tools** (`tools/pricing.ts`) |
| `calculateDiscount` | read | `calculateSpecialPrice()` (`lib/menu/special-offer.ts`) | |
| `validateDiscount` | read | bounds checks already enforced by `isDiscountSpec` | standalone entry point; `buildProposal` does not call it a second time redundantly |
| `estimatePromotionImpact` (alias: `estimateRevenueImpact`) | read | `estimateDiscountImpact()` | |
| `estimateMargin` | read | **stub** | `menu_items` has no cost/COGS column — always `{margin: null, reason: '...'}`, never fabricated |
| `detectConflictingPromotion` | read | `isSpecialOfferActive()` | informational — `special_*` is a single mutable column set, so two specials can't structurally coexist on one item |
| **Restaurant Context Tools** (`tools/restaurant.ts`) |
| `getRestaurant`, `validateOwnership` | read | the ownership query that was inline-duplicated in all 6 routes | now one implementation |
| `getRestaurantTimezone` | read | **stub** | no timezone column anywhere in the schema |
| `getCapabilities` | read | `isCapabilityEnabled()` looped over `CAPABILITY_REGISTRY` keys | |
| `validateCapability` | read | `isCapabilityAvailable()` | single-capability check, distinct from `getCapabilities` |
| `getRestaurantSettings` | read | new query over `restaurant_settings` | nothing consumes this yet — registered for future capabilities |
| **Conversation Tools** (`tools/conversation.ts`) |
| `getOpenProposal` | read | `getOpenProposalForConversation()` (`proposals.ts`) | |
| `getProposalHistory` | read | `getProposalGroupHistory()` | |
| `getConversationContext` | read | prior-messages fetch + `buildTranscript()` | |
| `getConversationSummary` | read | new — message counts + open-proposal status | deterministic, never prose |
| **Validation Tools** |
| `validateProposal` (alias: `revalidateProposal`) | read | `revalidateProposal()` (`capabilities/menu-pricing.ts`) | in `pricing.ts` |
| `validateRestaurantScope` | — | **not a separate tool** | every query already filters by `restaurant_id` at the query level — a structural invariant, not a checkable step |

## What changed in `buildProposal()` — and what deliberately didn't

The original migration plan called for refactoring `buildProposal()` (`capabilities/menu-pricing.ts`) to call the new `tools/menu.ts` search tools and `tools/pricing.ts`'s `estimatePromotionImpact` internally. Implementing that surfaced two real problems, so it was **not done**:

1. **A genuine circular import.** `tools/pricing.ts` needs to import `estimateDiscountImpact`/`revalidateProposal` *from* `capabilities/menu-pricing.ts`. Having `capabilities/menu-pricing.ts` import back from `tools/pricing.ts` would create a real cycle, not a stylistic one.
2. **Redundant DB round-trips.** `buildProposal()` needs one combined fetch of categories and items together. Routing that through the individual `tools/menu.ts` search tools would mean each tool independently re-running `fetchAssignedMenus`+`fetchMenuContents` rather than sharing one fetch.

`buildProposal()`'s internals are byte-for-byte unchanged. The existing `menu-pricing.test.ts` coverage continues to prove its behavior; the new `tools/*.ts` wrappers are proven independently (see Testing below), and both call the same underlying functions — so the equivalence holds without forcing a risky merge of the two call paths.

## What actually changed in the six routes

The one real, concrete duplication this extraction found and fixed: the identical `restaurants.select().eq('id',...).eq('owner_id',...).is('deleted_at', null).maybeSingle()` query was inline-copied in all six Restaurant-Planner routes. Each now calls `getRestaurant.execute({}, toolCtx)` instead:

| Route | Change |
|---|---|
| `app/api/admin/assistant/messages/route.ts` | `getRestaurant` for ownership; `getConversationContext` replaces the inline prior-messages fetch + `buildTranscript()` call (which also folded in the previously-duplicated `OPEN_STATUSES`/`OPEN_PROPOSAL_STATUSES` constant — now one export from `proposals.ts`) |
| `app/api/admin/assistant/messages/outcome/route.ts` | `getRestaurant` for ownership; `cancelPromotion` replaces the inline `insertProposalVersion(..., status:'cancelled')` call |
| `app/api/admin/assistant/target-selection/route.ts` | `getRestaurant` for ownership only — the resolve/propose sequence stays a direct `buildProposal()` call, since it needs the same combined-fetch shape discussed above |
| `app/api/admin/assistant/conversations/route.ts` (GET) | `getRestaurant` for ownership only |
| `app/api/admin/menus/discount-action/preview/route.ts` | `getRestaurant` for ownership; **`previewPromotion` is now this route's actual resolve+estimate implementation**, not a parallel copy — the route layers its own route-specific concerns (the schedule-parse-failure warning, proposal revalidation) on top of the tool's result |
| `app/api/admin/menus/discount-action/apply/route.ts` | `getRestaurant` for ownership; `applyPromotion` replaces the direct `applyDiscountProposal()` call — a 1:1 wrap, no behavior change (still no internal try/catch, matching the original route's unhandled-throw-becomes-500 behavior) |

One real shape correction happened along the way: `previewPromotion`'s first draft returned `itemCount: number` instead of the full `items: ResolvedDiscountItem[]` array. `ProposalCard.tsx` renders each resolved item by name (`preview.items.map(...)`), so `itemCount` alone would have been a silent regression the moment the preview route was wired to the tool. Caught before merge — `PreviewResult` now carries the full array, matching what the client actually consumes.

## Testing

New: `lib/restaurant-planner/tools/{pricing,restaurant,promotion,registry}.test.ts` — 28 tests.

- **Pass-through fidelity** for every tool with real logic that doesn't touch a database (`pricing.ts`'s tools): each test calls the tool via `execute()` and asserts the result equals calling the underlying function directly — proving the wrapper adds nothing and changes nothing.
- **Stub tests**: `estimateMargin` and `getRestaurantTimezone` always return their documented "not available" shape, asserted directly — a guard against either ever silently starting to fabricate a value.
- **`cancelPromotion` regression test**: a hand-rolled fake Supabase client forces `insertProposalVersion`'s insert to fail, asserting `cancelPromotion.execute` returns `{ok: false, reason: ...}` rather than throwing — this is the specific throw-safety bug found and fixed during this extraction (see above).
- **Registry structural tests**: every `TOOL_REGISTRY` entry has a well-formed shape, `mutating` is true if and only if `permission` is `'write'`, the declared aliases (`findItemsByName`, `estimateRevenueImpact`, `revalidateProposal`) point at the same tool object as their canonical name (not a duplicate re-implementation), and exactly one tool (`applyPromotion`) has `write` permission.

No mocking library or fixture infrastructure for Supabase exists elsewhere in this repo's tests — the fake clients above are hand-rolled and scoped to exactly the query chains (`.select().eq()...maybeSingle()`, `.insert().select().single()`) the tools under test actually call.

Full suite after this work: **159 passing** (131 pre-existing + 28 new), `npx tsc --noEmit` clean.

## Adding a future agent — the walkthrough this library exists for

1. Register the capability in `CAPABILITY_REGISTRY` (existing mechanism, unchanged).
2. Add only the genuinely new tools that capability needs, in a new `tools/<domain>.ts` file — most capabilities will need far fewer than menu_pricing did, since `getRestaurant`, `getOpenProposal`, `getConversationContext`, `getCapabilities`, etc. are already capability-agnostic and reusable as-is.
3. Add the new tools to `TOOL_REGISTRY` in `tools/registry.ts` — same shape, no change to `getTool()`/`listToolsForCapability()`.
4. If the capability writes anything, its write tool gets `permission: 'write'` and is never included in anything the model can call — only a human-gated route invokes it, same as `applyPromotion`.

## Files map

| Concern | File |
|---|---|
| Tool contract (`ToolDefinition`/`ToolContext`/`ToolOutcome`, `ok`/`fail`) | `lib/restaurant-planner/tools/types.ts` |
| Tool registry (`TOOL_REGISTRY`, `getTool`, `listToolsForCapability`) | `lib/restaurant-planner/tools/registry.ts` |
| Menu Tools | `lib/restaurant-planner/tools/menu.ts` |
| Promotion Tools | `lib/restaurant-planner/tools/promotion.ts` |
| Pricing Tools | `lib/restaurant-planner/tools/pricing.ts` |
| Restaurant Context Tools | `lib/restaurant-planner/tools/restaurant.ts` |
| Conversation Tools | `lib/restaurant-planner/tools/conversation.ts` |
| Underlying capability logic (unchanged internals) | `lib/restaurant-planner/capabilities/menu-pricing.ts` |
| Capability registry (pre-existing, not renamed despite the naming collision above) | `lib/restaurant-planner/tool-registry.ts` |
| Tool wrapper tests | `lib/restaurant-planner/tools/*.test.ts` |

See [`ask-spinbite-ai-agent-v1.md`](./ask-spinbite-ai-agent-v1.md) for the planner architecture this library sits underneath, and the Capability Log entry marking when this shipped.

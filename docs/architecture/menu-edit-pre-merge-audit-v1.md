# menu_edit Pre-Merge Product Audit v1

**Created:** 2026-07-12
**Scope:** Everything on branch `feature/menu-edit-capability`, uncommitted, before merge to `main`. Treated as a production feature launch per the request, even though `capability_settings.menu_agent` ships `enabled: false`.
**Method:** Every claim below was checked against the actual code, the live Supabase project, or a real (throwaway, not shipped) run of `parsePlannerOutput`/`resolveMenuEditAction` against a synthetic menu fixture — not reasoned about in the abstract. Where I could not get real evidence (see the box below), that is stated explicitly rather than presented as verified.

## ✅ Resolution (2026-07-12) — both Important findings closed, GO

Both findings this audit rated Important were fixed before the first merge, per explicit instruction. See Part 9/10 at the bottom for the final GO recommendation and evidence. Summary of what changed:

1. **Capability-aware Decision Intelligence.** New `lib/restaurant-planner/decision-intelligence.ts` — a composition layer, not duplicated UI. Owns the pieces that were already capability-agnostic (`computeDecisionScore`, `composeDecisionSummary`, `composeTradeoffs`, `explainProposalBullets`, `composeMonitoringReminder`, moved verbatim from `menu-pricing.ts`) plus a `DecisionCopyAdapter` contract every capability implements for the domain-specific pieces (`composeWhyNow`, `composeConfidenceEvidence`, `composeConsiderations`, `composeAlternatives`, `composeWhyThisRecommendation`, `composeSuccessMetrics`, `composeExecutiveSummary`) and one orchestrator, `composeDecisionCard(adapter, inputs)`, both preview routes now call instead of hand-assembling ~12 fields inline. `capabilities/menu-pricing.ts` exports `makeMenuPricingDecisionCopyAdapter` (byte-identical wording to before — a relocation, not a rewrite, verified live). `capabilities/menu-edit.ts` exports `makeMenuEditDecisionCopyAdapter` with genuinely catalog-appropriate copy, action-type-aware (a rename gets "Confirm the new name displays correctly," never "Average Order Value"; a price action still gets sales-framed metrics, since that framing is legitimate there). Verified live: a category-wide rename's Decision Card now contains zero occurrences of "pricing," "discount," or "average order value," while the equivalent `menu_pricing` card is unchanged.
2. **Bulk Edit Safety.** `lib/menu-edit-actions/resolve.ts`'s `resolveMenuEditAction` gained a gate (`NEEDS_EXPLICIT_BULK_TARGET`) that blocks `rename_item`/`update_description` from ever silently proceeding when a target scope resolves to more than one item — it returns the same `{resolved:false, candidates}` shape the existing ambiguous-name clarification already uses, so it reuses `TargetSelector.tsx`'s existing "Apply to all" / checkbox-narrow / Cancel UI with zero new UI code. An `opts.bulkConfirmed` flag, threaded through `buildProposal`, is set `true` only by `target-selection/route.ts` (the post-confirmation rebuild), `edit-action/apply/route.ts`, and the `previewMenuEdit` tool — all three represent "this exact action already passed the gate once," so re-resolving them never re-blocks an already-approved bulk change. Verified live end-to-end: a category-scoped rename blocks with the real candidate list; the confirmed re-submission succeeds; a single-item rename and a bulk *price* change (correct bulk semantics) are both untouched by the gate.

**Not built, correctly out of scope**: "generate unique values per item" as a third option — explicitly named by the user as a future capability, not this fix.

## ⚠️ Load-bearing caveat — read before the rest of this doc

**No prompt template exists yet for `menu_edit_action`.** The live `dashboard_assistant` v2 prompt (active in production since 2026-07-10) has never been told this intent exists. This means:

- Everything from *"a well-formed `MenuEditAction` JSON arrives"* onward — resolve → propose → approve → execute → audit → version — is real, wired, and verified (369 automated tests + the diagnostic runs below).
- Everything **upstream of that** — a restaurant owner's English sentence reliably becoming the *correct* JSON — is **unverified and unverifiable in this environment** (no live model access, same limitation the pre-existing `prompt-contract.test.ts` for menu_pricing already documents). Part 2 below evaluates whether the *schema* can express each example correctly, not whether a real model call will. Someone must author and activate a prompt revision (Rule 20 — prompts are DB-owned, not code) before any of this reaches a real user, exactly as `ask-spinbite-ai-agent-v1.md`'s Status section already describes for the other capabilities.

---

## PART 1 — Capability Review

All 12 operations traced through all 7 stages, verified against real code (file:line) and, for execution/audit, the applied migration.

| Operation | Planner intent | Resolver | Proposal gen | Approval | Execution | History | Versioning |
|---|---|---|---|---|---|---|---|
| Set exact price | `menu_edit_action`/`set_price` | `resolveMenuEditAction` — rounds to 2dp | `buildProposal` → `restaurant_planner_proposals` | `ProposalCard` Approve gate | `applyOne` writes `menu_items.price` | `menu_edit_change_log` row | append-only version row |
| Increase price | `adjust_price`/`increase` | same, `computeAdjustedPrice` | ✓ | ✓ | ✓ | ✓ | ✓ |
| Decrease price | `adjust_price`/`decrease` | same; filters items that would go ≤$0 (see Part 5 finding) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Bulk pricing | any price action + `category`/`all`/`items`/`name_contains` scope | same scope machinery as menu_pricing (independently defined, not shared code) | ✓ | ✓ | `Promise.all` over N items — see Part 7 | ✓ | ✓ |
| Rename item | `rename_item` | ✓ | ✓ | ✓ | writes `menu_items.name` — **no uniqueness check, see Part 5** | ✓ | ✓ |
| Edit description | `update_description` | ✓ | ✓ | ✓ | writes `menu_items.description` | ✓ | ✓ |
| Move category | `move_category` | resolves destination via `matchByName` against `menu_categories`, scoped to the restaurant's assigned menus | ✓ | ✓ | writes `menu_items.category_id` | ✓ | ✓ |
| Hide item | `set_availability`/`false` | ✓ | ✓ | ✓ | writes `menu_items.available` | ✓ | ✓ |
| Show item | `set_availability`/`true` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Featured | `set_tag`/`featured` | ✓ | ✓ | ✓ | writes `menu_items.is_featured` (real column) | ✓ | ✓ |
| Chef Special | `set_tag`/`chef_special` | ✓ | ✓ | ✓ | writes `menu_items.tags` (string literal in array) | ✓ | ✓ |
| Popular | `set_tag`/`popular` | ✓ | ✓ | ✓ | writes `menu_items.tags` | ✓ | ✓ |

All 12 confirmed wired end-to-end via code inspection + the existing 369-test suite (`resolve.test.ts` covers 8 of 12 action types directly; `capabilities/menu-edit.test.ts` covers confidence/plan-tasks/impact/revalidation/apply for all of them generically since they share one code path). **Every operation writes through exactly one function** (`applyOne`, `lib/restaurant-planner/capabilities/menu-edit.ts:233`) — confirmed by grep across every new file; there is no second write site.

## PART 2 — Natural Language Review

Each example run for real through `parsePlannerOutput` + `resolveMenuEditAction` against a synthetic fixture (6 items, 4 categories). Output captured directly, not inferred.

| Example | Verified action shape | Ambiguity handling | Result |
|---|---|---|---|
| "Set Butter Chicken to $21.99" | `set_price`, `scope:item` | n/a, exact match | `{price:19.99}` → `{price:21.99}` ✓ |
| "Increase Butter Chicken by $2" | `adjust_price`/increase/fixed | n/a | `{price:19.99}` → `{price:21.99}` ✓ |
| "Decrease all appetizers by $1" | `adjust_price`/decrease/fixed, `scope:category` | n/a, exact category match | 3 items, each own price −$1 ✓ |
| "Rename Butter Chicken to Signature Butter Chicken" | `rename_item` | n/a | resolves ✓ |
| "Hide Mango Lassi" | `set_availability:false` | n/a | resolves ✓ |
| "Show Mango Lassi again" | `set_availability:true` | n/a | resolves — **this is a true no-op against the fixture's current state**, caught and skipped at apply, not rejected at resolve (correct — matches spec) |
| "Move Ras Malai into Desserts" | `move_category` | n/a, exact destination match | `Mains` → `Desserts` ✓ |
| "Mark Garlic Naan as Featured" | `set_tag:featured,true` | n/a | resolves ✓ |
| "Remove Featured from Garlic Naan" | `set_tag:featured,false` | n/a | resolves ✓ |
| "Rewrite Butter Chicken description" | `update_description` | n/a for the target — **but see finding below** | resolves ✓ |

**Finding — "Rewrite Butter Chicken description" has no real content source.** The schema requires the model to supply the finished `description` string itself, as free text, with zero grounding tool (no menu-item context beyond name, no ingredients list, nothing). The repo already has a dedicated, presumably better-grounded `menu_description_generation` AI feature wired into the human admin editor for exactly this job. Routing "rewrite the description" through `menu_edit_action` risks the general assistant inventing plausible-sounding but ungrounded copy (invented ingredients, wrong tone) with no safeguard beyond the human reading it in the Decision Card before approving. **Important**, not Critical (human approval still gates the write) — recommend either explicitly excluding free-text description rewrites from the `menu_edit_action` prompt instructions (route "rewrite my description" to the existing `menu_description_generation` feature instead) or accepting the model-authored text as-is with a clear "AI-written, review carefully" label in the Decision Card, which isn't there today.

**Deterministic routing control check:** a genuine discount ("15% off Butter Chicken") still parses as `menu_discount_action`/`menu_pricing`, unaffected — confirmed.

## PART 3 — Proposal Quality (Decision Cards)

**Real finding, found while auditing, not previously reported:** `edit-action/preview/route.ts` reuses **11 of menu_pricing's 12** Decision Intelligence composers verbatim (only `composeWhyThisRecommendation` was skipped, for the reason given in that file's comment — its copy hardcodes "a direct discount"). On inspection, several of the *reused* ones are also pricing/revenue-framed in ways that don't fit menu_edit's structural actions (rename, description, move, hide/show, tags):

- `composeSuccessMetrics` → always returns `['Orders containing X', '{category} revenue', 'Average order value']`. For a **rename** or **hide**, "monitor Average Order Value" is a non-sequitur — nothing about renaming an item should move AOV, and presenting it as a success metric implies a revenue hypothesis that doesn't exist.
- `composeWhyNow` → signals like "This item has not been discounted recently" render on a rename/hide proposal, where discount recency is irrelevant.
- `composeAlternatives` → can render "Bundle X with Y" or "Feature X instead of discounting it" as an **alternative to renaming or hiding an item**, which doesn't make sense as a suggestion.
- `composeConsiderations`/decision scoring both weight `orderCount`/`dataQuality` (order history) into the confidence-adjacent verdict, which is a meaningful signal for a price change but not for whether a rename or category move is "safe."

**This directly weakens the "why / expected outcome" clarity the audit asked about** for 5 of the 7 action types (`rename_item`, `update_description`, `move_category`, `set_availability`, `set_tag`). For the 2 price-related types (`set_price`, `adjust_price`) the reused composers fit reasonably well — order history and revenue framing are legitimately relevant there.

Answering the audit's specific questions:
- **What is changing?** Yes, clearly — `copy.recommendationText` + the Before/After item list are capability-specific and accurate.
- **Why?** Weak for structural actions — `copy.objectiveText` is honest and generic ("Update catalog information," not a fabricated revenue claim), but the surrounding "Why Now"/"Alternatives"/"Success Metrics" sections inject pricing-flavored reasoning that doesn't actually apply.
- **Expected outcome?** Accurate for what it does say (`revenueImpact`/`margin` are correctly always `null` with an honest warning, never fabricated) — but the *rest* of the card implies an outcome-tracking framework that doesn't fit a structural change.
- **Confidence?** Fits fine — confidence is about target-match quality, which is capability-agnostic and correctly computed.
- **Tradeoffs?** Same issue as Alternatives — benefit/risk framing borrowed from a discount-decision mental model.

**Severity: Important.** Not Critical — nothing here is unsafe or produces an incorrect write, and a careful owner can still tell what's changing from the Recommendation/Before-After sections regardless of the extra pricing-flavored sections. But it's a real proposal-quality gap worth closing (route `composeSuccessMetrics`/`composeWhyNow`/`composeAlternatives` through the same type-of-action check `composeWhyThisRecommendation` already got, or write menu_edit-specific equivalents) before this capability is enabled for real owners.

## PART 4 — Execution Safety

**Confirmed: exactly one write site to `menu_items` exists in the entire menu_edit codebase** — `applyOne` (`capabilities/menu-edit.ts:233`), grep-verified across every new/modified file. It is reachable only via `applyMenuEdit.execute()`, which is a `permission:'write'` tool never included in anything the model can call (verified: `messages/route.ts`'s `menu_edit_action` case and `target-selection/route.ts` both only ever call `buildMenuEditProposal`, never `applyMenuEdit`). The only caller of `applyMenuEdit` is `POST /api/admin/menus/edit-action/apply`, which is only ever fetched from `ProposalCard.tsx`'s `handleApply()`, which only runs on an explicit Approve click.

**One honest finding, not a menu_edit-specific gap:** `edit-action/apply/route.ts` accepts an **optional** `proposalId`. If omitted, the route still resolves the action fresh and writes — meaning a raw authenticated `POST` to that endpoint (a valid owner session, no UI involved) *could* write without a Decision Card ever having been shown. This is **not new** — it is an exact mirror of `discount-action/apply/route.ts`'s existing, already-shipped design; the real authorization boundary in this system has always been "authenticated as the restaurant owner" (RLS + `getRestaurant`'s owner check), not "a proposal was displayed." An owner hitting this route directly is equivalent to them using the admin UI's own direct-edit form (`app/admin/menus/[menuId]/page.tsx`), which already lets them write `menu_items` with no proposal step at all. **Currently moot in production**: `capability_settings.menu_agent` is `enabled:false`, so `isCapabilityAvailable` rejects this path with a 403 regardless, verified live against the DB. **Severity: Important, shared with menu_pricing, not a menu_edit regression** — worth a platform-wide decision (require `proposalId` on all apply routes?) rather than a menu_edit-specific fix.

Cross-tenant check: `getRestaurant`'s underlying query filters on both `id` AND `owner_id` (confirmed from the Restaurant Tool Library doc and reused verbatim here) — a caller cannot target another owner's restaurant by ID. No new tenant-isolation issue found.

## PART 5 — Catalog Integrity (edge cases, all verified by direct code trace or live diagnostic run)

| Edge case | Verified behavior | Assessment |
|---|---|---|
| Rename to existing name | **Succeeds silently** — confirmed live: renamed "Samosa" → "Spring Roll" (an existing item's name) and it resolved cleanly. No DB constraint exists on `menu_items.name` (confirmed via `pg_constraint` query — only a PK and 2 FKs and the special-offer CHECKs exist); the only name-uniqueness constraint in the whole schema is on `menus.name` per owner, unrelated. **Finding, Important**: creates two same-named items, which then makes future `matchByName`-based AI resolution genuinely ambiguous for either. Not a crash, but a real data-quality gap this capability could actively create where none existed before (a human would at least notice while typing in the manual editor; the AI path has no such friction). |
| Move into missing category | Rejected: `"No category found matching \"X\"."` — verified. |
| Negative prices | Rejected at the schema layer (`isMenuEditAction` requires `price > 0`) — a malformed action never reaches the resolver at all, verified by existing test. |
| Zero prices | Same guard, `> 0` excludes zero — verified by existing test. |
| Price lower than cost | N/A — no cost/COGS column exists anywhere in `menu_items` (confirmed, same finding the original boundary audit made about menu_pricing's margin field). Correctly never fabricated. |
| Hide already hidden item | Resolves (before === after), caught as a no-op at **apply** time (`isNoOp`), skipped with zero write and zero audit row, reported in `skippedNoOp` — verified by existing test. |
| Show already visible item | Same — verified live in the Part 2 diagnostic run. |
| Bulk edits with no matches | Unresolved with a specific reason (`"No category found..."`/`"No menu item found..."`) — verified by existing tests. |
| Mixed valid/invalid matches (`scope:'items'`) | **Verified live**: `['Butter Chicken', 'Nonexistent Item']` → the *whole* target fails (`"No menu item found matching \"Nonexistent Item\"."`), with the valid name surfaced back as a candidate for a follow-up. Never silently drops the bad one, never partially applies. |
| **New finding — partial silent drop in `adjust_price` only** | If a bulk `adjust_price` request matches N items but a decrease would take *some* (not all) of them to ≤$0, those specific items are **silently excluded from the proposal with no explanation anywhere** — no warning, no "M of N items were skipped" note. The proposal simply shows fewer items than the target scope actually matched. **This is the same class of gap menu_pricing already has** (its `fixed_price >= current price` filter behaves identically) — not a menu_edit regression, but real and unfixed in both. **Severity: Important.** |

## PART 6 — Owner Experience

| Ask | Supported? | Notes |
|---|---|---|
| "Increase every drink by $0.50" | **Yes** | `adjust_price`, `scope:category`, verified equivalent in the Part 2 diagnostic (ran with "Appetizers" — same mechanism). |
| "Rename Coke to Coca-Cola" | **Yes** | `rename_item`, single item — verified. |
| "Hide breakfast after 11" | **No — real gap.** | Neither `menu_edit` nor `menu_pricing` has any time-conditional/recurring availability concept. `menu_edit`'s `set_availability` is an immediate, permanent flip; `menu_pricing`'s only scheduling primitive is a one-shot discount start-time, not a recurring daily "after 11am, hide" rule. An owner asking this naturally would get either an `unsupported` response or (worse, if the prompt is imprecise) a permanent hide applied immediately with no time condition at all. **This should be explicit in the eventual prompt's `unsupported` handling**, not silently misapplied. |
| "Move Pizza into Specials" | **Conditional** | Works if "Specials" already exists as a real category (verified `move_category` mechanism). If it doesn't, correctly rejects with "No category found" rather than inventing one — but there is no "create category" action in this capability's V1 scope, so the owner would need to create it manually first, which the assistant currently has no way to tell them to do beyond a generic unmatched-category message. |
| "Rewrite my descriptions" (plural) | **No — real, more serious gap, found during this audit, not previously reported.** | `update_description` (and `rename_item`, structurally identical) carries **one literal string** applied to *every* item the target scope resolves to. A category/bulk-scoped rename or description rewrite would set **every matched item to the exact same text.** Traced directly in `resolve.ts`: `after = { description: action.description.trim() || null }` inside the per-item `.map()`, using the single `action.description` for all items, unlike `adjust_price`/`set_price`/`set_availability`/`set_tag`, where "apply the same treatment to every item" is the *correct* semantics (every appetizer really should become $X or become featured). Rename/description are fundamentally per-item-unique — a bulk request here produces a nonsensical result, not merely a suboptimal one. |

**Severity of the bulk rename/description finding: Important, not Critical**, because: (a) the human approval gate is real, and the Decision Card's Before/After list (up to 8 items shown) would visibly display the same "afterLabel" repeated for every item, which a reasonably attentive owner has a real chance of noticing before clicking Approve; (b) nothing about it corrupts data beyond what the owner explicitly approved seeing. But it is a genuine landmine for whoever eventually writes the prompt — nothing at the schema or resolver level stops `rename_item`/`update_description` from being emitted with a multi-item scope, and no `consideration` warns about it today. **Recommend**: either restrict `rename_item`/`update_description` to `scope:'item'` only at the type level (simplest, matches how these two are the only genuinely per-item-unique actions), or add an explicit warning consideration when either fires against >1 item.

## PART 7 — Performance

Traced by counting actual query call sites, not estimated:

- **Preview (any single action, any scope size): ~13-14 queries, O(1) in item count.** `getRestaurant` (1) + `fetchAssignedMenus`+`fetchMenuContents` (4) + the Decision Intelligence evidence batch (`getPromotionCoverage`, `getItemOrderStats`, a `menu_discount_change_log` recency check, `getFrequentlyCoOrderedItems` — 4 calls, each internally 1-2 queries using `.in()` batching, not per-item loops) run in one `Promise.all`. Scales flat regardless of whether 1 or 200 items match.
- **Apply: 2 writes per real (non-no-op) item, fully parallel via `Promise.all`.** For N items: N `.update()` + N `.insert()` into `menu_edit_change_log` = 2N concurrent queries. **Same characteristic as the already-shipped `applyDiscountProposal`** — not new. For a very large bulk operation (e.g., "increase every item on the menu by 5%" across 150+ items), 300 concurrent Supabase calls is a real, if pre-existing, connection-pool/rate-limit risk neither capability currently guards against (no chunking/batching).
- **Obvious optimization, shared with menu_pricing, not blocking**: batch the `menu_edit_change_log` inserts into one multi-row insert instead of N single-row inserts; consider chunking `applyOne` calls for very large item counts instead of one unbounded `Promise.all`.

## PART 8 — Future Compatibility

| Future capability | Fits without redesign? | Why |
|---|---|---|
| AI description generation | **Yes, with the Part 2/6 caveat.** `update_description` already exists; the gap is grounding, not the plumbing. |
| AI image generation | **Separate subsystem already, no redesign needed.** Confirmed during the original audit: images go through `generate-food-image`, not `menu_items.image_url` via this capability — menu_edit doesn't touch images at all, correctly out of scope. |
| Seasonal menus | **Partial.** The scope machinery (`category`/`items`/`name_contains`) generalizes fine to "seasonal" as a tag or category concept, but there's no time-window primitive anywhere in menu_edit (deliberately — that's `menu_pricing`'s domain, and even there only a one-shot start time exists). A real "seasonal menu" feature likely needs new schema, not just a new action type. |
| Availability scheduling | **No — needs new schema**, per the "Hide breakfast after 11" finding in Part 6. Neither capability has a recurring-time primitive. |
| Menu cloning | **Orthogonal, doesn't interact.** Cloning operates on `menus`/`menu_categories` wholesale, not individual `menu_items` edits — no conflict, no dependency either way. |
| Bulk imports | **Partial fit.** The scope-resolution/proposal/audit machinery could underlie a "review these 50 imported items before committing" flow, but bulk imports create new rows; every menu_edit action today only *mutates existing* rows (no `create_item` action was built in V1, matching the original audit's scope decision). |
| Translations | **No — needs new schema** (no locale/i18n column anywhere on `menu_items`). |

## PART 9 — Launch Readiness

**Launch score: 8/10** (was 6/10 in the original pass) — both findings that could confuse or mislead a real owner are now fixed and verified live. The remaining Important items are pre-existing, shared with already-shipped `menu_pricing`, and appropriately tracked as platform-wide follow-up rather than menu_edit-specific blockers.

| Finding | Severity | Status |
|---|---|---|
| 11 of 12 Decision Intelligence composers reused verbatim produce pricing-flavored copy on structural (rename/description/move/hide/tag) proposals | **Important** | ✅ **Fixed** — capability-aware composition layer (`decision-intelligence.ts` + `makeMenuEditDecisionCopyAdapter`), verified live to produce zero pricing language |
| `rename_item`/`update_description` have no guard against nonsensical bulk (same text applied to every matched item) | **Important** | ✅ **Fixed** — `NEEDS_EXPLICIT_BULK_TARGET` gate in `resolve.ts`, reuses the existing `TargetSelector` clarification UI, verified live end-to-end |
| No name-uniqueness check on rename (AI or human) — pre-existing gap this capability can now trigger more easily | **Important** | Documented as platform-wide follow-up, per instruction |
| `adjust_price` silently drops (no warning) items that would go ≤$0 in a partial-bulk match | **Important, shared with menu_pricing** | Documented as platform-wide follow-up, per instruction |
| Apply routes (both capabilities) accept writes without a `proposalId`, bypassing the Decision Card if called directly | **Important, shared with menu_pricing, currently moot (flag is off)** | Documented as platform-wide follow-up, per instruction |
| No time-conditional availability ("hide after 11am") | **Nice-to-have** (real gap, out of V1's stated scope) | Not addressed, correctly out of scope |
| "Rewrite descriptions" has no grounding tool | **Nice-to-have** | Not addressed |
| Bulk-apply performance: unbounded parallel writes for very large item counts | **Nice-to-have, shared with menu_pricing** | Not addressed |

**Zero Critical findings, before or after this round.** Nothing found writes catalog data without a real approval gate; nothing found lets a non-owner touch another restaurant's menu; nothing found produces an unsafe write. The three remaining Important items are explicitly deferred to platform-wide follow-up work per instruction, not silently dropped — they affect `menu_pricing` equally and are better solved once, at the platform level, than patched twice.

## PART 10 — Final GO / NO-GO

**GO.**

Both fixes are implemented, verified against real code execution (not just unit-test assertions in isolation — see the live diagnostic output captured during this final pass: a category-wide rename's Decision Card now contains zero occurrences of "pricing"/"discount"/"average order value"; the equivalent `menu_pricing` card is byte-for-byte unchanged; a bulk rename blocks with real candidates and a working "Apply to all" confirmation path; single-item and correctly-bulk-safe operations remain frictionless). Full verification suite is clean:

- **392 tests passing** (30 files, +23 since the previous pass — new coverage for the bulk-safety gate, both `DecisionCopyAdapter` implementations, and the `composeDecisionCard` orchestrator itself)
- **`tsc --noEmit`**: clean
- **`eslint`**: 0 errors, 0 new warnings (28 pre-existing warnings elsewhere in the repo, none in any file this work touched)
- **`next build`**: clean, both `edit-action` routes present in the route manifest

`capability_settings.menu_agent` remains `enabled: false` — confirmed unchanged. The remaining three Important findings (name uniqueness, silent partial-drop on out-of-range bulk price edits, apply-without-a-proposal) are real, correctly deferred to platform-wide follow-up per instruction, and do not block this merge — they're pre-existing characteristics shared with `menu_pricing`, not something this branch introduces or worsens.

## PART 10 — GO / NO-GO

**GO WITH FOLLOW-UPS.**

The code is safe to merge as-is: it ships fully disabled (`capability_settings.menu_agent = false`, verified live), the write path is singular and gated, cross-tenant isolation holds, and every V1 operation is verifiably wired end-to-end through proposal → approval → execution → audit → versioning. Merging does not expose any user to risk.

**Before `menu_agent.enabled` is ever flipped true for a real restaurant**, close these two specifically (both Important, both concrete and small in scope):
1. Restrict `rename_item`/`update_description` to single-item targeting, or add an explicit multi-item warning — prevents the nonsensical "same text on every item" bulk case.
2. Route `composeSuccessMetrics`/`composeWhyNow`/`composeAlternatives` through an action-type check (the same pattern `composeWhyThisRecommendation` already uses) so structural proposals stop showing pricing-flavored "Success Metrics"/"Alternatives" that don't apply.

The remaining Important findings (name-uniqueness, silent partial-drop on `adjust_price`, apply-without-proposalId) are legitimate but pre-existing/shared with `menu_pricing` — worth a platform-level decision, not a menu_edit-specific blocker, and reasonable to track as follow-up work rather than gate this merge on.

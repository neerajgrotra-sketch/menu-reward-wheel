# Ask SpinBite — AI Agent Capability Log v1

_Living document — append a row to the Capability Log each time Ask SpinBite gains a new capability. Don't rewrite this doc from scratch per feature; extend it._

**Created:** 2026-07-09
**Updated:** 2026-07-10 — generalized the single-shot two-intent pipeline into the **Restaurant Planner** (see below). Same underlying capability (menu discounts), new architecture designed so future capabilities plug in without another rewrite.
**Updated again, same day:** Restaurant Planner **V2 (Execution Planner)** — turned each proposal into a persisted, versioned entity (`restaurant_planner_proposals`) with confidence scoring, deterministic explainability, pre-execution revalidation, and structured (checkbox) target selection. Fixed the two contract gaps found while auditing V1: multi-item/exclusion targeting (`scope:"items"`/`"name_contains"`/`category.exclude`) and the silent schedule-parse fallback (`startTimeParseFailed`). See the V2 section below for what changed and what was deliberately scoped down.
**Updated a third time, same day:** **Capability Management** — replaced the single global `dashboard_assistant` enabled flag with a per-capability, three-scope (`environment`/`restaurant`/`owner`) settings system, directly solving the "no restaurant-scoped rollout" blocking issue flagged in the V2 activation dossier. Not a planner change — gating happens in the tool-selection layer (`tool-registry.ts`), so a future capability gets it for free. See the Capability Management section below.
**Updated a fourth time, same day:** **Restaurant Tool Library v1** — extracted the planner's underlying operations (menu search, pricing math, ownership checks, conversation context) into named, individually-documented, registered tools (`lib/restaurant-planner/tools/`) that a future capability composes, instead of re-deriving its own version of "fetch the menu" or "check ownership." Behavior-preserving — no user-visible change, no change to the planner, the capability registry's shape, or the proposal engine. Full detail in a dedicated doc: [`restaurant-tool-library-v1.md`](./restaurant-tool-library-v1.md).
**Status as of this writing:** Two capabilities built and merged to `main`, both **disabled** pending prompt authoring (see Status below).

---

## What this is

"Ask SpinBite" is the natural-language command center on the `/admin` dashboard (`components/admin/dashboard/CommandCenter.tsx`). It is SpinBite's first shipped instance of an AI agent that can both **answer questions** about a restaurant's live data and **take real actions** on a restaurant's data, gated by an explicit human-confirmation step. This doc tracks what it can do, how the action pipeline is built, and the open guardrail question it raises against prior architecture decisions.

## Relationship to prior AI planning docs — read this before extending Ask SpinBite

Two earlier documents anticipated this work and should be read alongside this one:

- **[`ai-engine-roadmap-v1.md`](./ai-engine-roadmap-v1.md)** (2026-06-15) — a concept doc for a much larger "AI Revenue Engine" (natural-language revenue goals → auto-created game promotions → SMS campaigns → outcome tracking). It's explicitly marked "no implementation planned until operational primitives are stable." Ask SpinBite's action pipeline is the **first real, narrow implementation** of that doc's core pattern — "Layer 1: Structured Input API" and "Layer 4: Proposal UI ... AI proposes, human approves" — but scoped to one capability (menu discounts) built on a primitive that already existed and was already live in production (the `special_offer_engine`, §Architecture below), not the full goal-parser/strategy-engine/comms pipeline that roadmap describes. Layers 2, 3, 5, 6 of that roadmap remain unbuilt.
- **[`decision-log-v1.md`](./decision-log-v1.md) ADR-013** — "AI Is the North Star But Operational Primitives Must Stabilize First." Ask SpinBite's discount-action capability was deliberately built against a primitive that was already stable and already carrying live production traffic on the public menu (not a new, untested surface), which is the spirit ADR-013 asks for, even though it's a narrower slice than the roadmap doc anticipated waiting for.

### ⚠️ Open tension with `ai-engine-roadmap-v1.md`'s guardrails — needs product review

That roadmap's **Constraint #1** reads: _"No price manipulation — The AI cannot change `menu_items.price`. It can only set `reward_value` on `promotion_rewards`."_ Ask SpinBite's discount-action capability (below) does not touch the `price` column, but it does let the AI propose changes to `menu_items.special_percent`/`special_price`/`special_enabled` — i.e., the customer-facing *effective* price — under an explicit human-confirmation gate. That guardrail was written 2026-06-15, two days before the `special_offer_engine` (the very columns this feature edits) shipped, so it couldn't have accounted for this surface. Whether "AI may propose an effective-price change, never applied without a human click" satisfies the spirit of Constraint #1 or violates its letter is a product decision, not an engineering one — flagging it here rather than silently deciding either way. If/when this is resolved, update Constraint #1 in the roadmap doc to explicitly address `special_*` fields either way.

---

## Architecture: the Restaurant Planner

The pipeline below (2026-07-10) replaces the old fixed two-intent branch with a
**Restaurant Planner** — a reusable classify → resolve → propose → approve →
execute → audit shape designed so a second capability (Pricing, Promotion,
Analytics, Marketing, Inventory, Staff, Customer, Operations — see
`ai-engine-roadmap-v1.md`) plugs in without another architectural rewrite. The
one capability actually implemented is still menu discounts
(`menu_pricing`) — this is a re-architecture of the existing feature, not a
new one; see the Capability Log entry below.

```
User types a request in CommandCenter
        ↓
POST /api/admin/assistant/messages
        ↓
runPlannerTurn()  (lib/restaurant-planner/planner-engine.ts)
  ├─ buildMenuSnapshot()  (lib/restaurant-planner/context.ts) — real
  │    category/item names merged into the model's prompt context, so it
  │    can name real candidates in its own clarifying questions instead of
  │    only discovering ambiguity after guessing
  └─ generate({featureKey: 'dashboard_assistant', ...})  — same shared
       engine and rate-limit metering as every other AI feature, unchanged
        ↓
parsePlannerOutput()  (lib/restaurant-planner/types.ts) — strict JSON,
one of:
  {intent:"answer", answer} | {intent:"clarification", question} |
  {intent:"unsupported", capability, note?} |
  {intent:"menu_discount_action", capability:"menu_pricing", action}
        ↓ (menu_discount_action only)
Client resolves any relative schedule ("19:00") to a real timestamp,
using the browser's local time as a proxy for the restaurant's
        ↓
POST /api/admin/menus/discount-action/preview
        ↓
Deterministic resolution against real menu data — target names ("Desserts")
matched to real categories/items; ambiguous or unmatched names return a
reason + candidates, never a guess — plus estimateDiscountImpact()
(lib/restaurant-planner/capabilities/menu-pricing.ts), a clearly-labeled
heuristic revenue-impact estimate (margin is always null with an explicit
warning — menu_items has no cost/COGS column, so real margin isn't
computable, and this never fabricates one)
        ↓
ProposalCard renders Promotion / Discount / Schedule / Visibility /
Est. Revenue Impact / Est. Margin / Warnings — nothing has been written yet
        ↓ (human clicks Approve)
POST /api/admin/menus/discount-action/apply
        ↓
Re-runs the SAME resolution against current live data (never trusts the
client's cached diff), calls applyDiscountProposal()
(lib/restaurant-planner/capabilities/menu-pricing.ts) which writes via the
session-authenticated client (RLS is the real authorization boundary) and
logs one menu_discount_change_log row per changed item
```

### Key design decisions

- **Structured output without touching the shared provider layer, still.** `lib/intelligence/intelligence-engine.ts`, `provider.interface.ts`, and every provider adapter (`anthropic-provider.ts` etc.) remain untouched. The `dashboard_assistant` feature's validator (`lib/intelligence/validators.ts`) now requires the model's plain-text output to match the widened `PlannerOutput` union (`lib/restaurant-planner/types.ts`) instead of the old two-member `DashboardAssistantOutput`.
- **Deliberately not real LLM tool-calling (no Anthropic `tool_use` loop).** The existing deterministic post-hoc resolver already guarantees "never hallucinate menu items" — the model names a target by string, and a hallucinated or stale name simply fails to resolve — without needing the model to make live search-tool calls. A single `generate()` call per turn is simpler and cheaper than an iterative tool loop. `planner-engine.ts`'s `runPlannerTurn()` is the seam: if a future capability genuinely needs iterative live search (e.g. an Analytics Agent querying order data multiple ways before answering), swapping this single call for a real tool-calling loop is a localized change there, not a redesign of the route, the persistence schema, or the capability registry.
- **Capability-routed, not capability-enumerated.** `PlannerOutput.capability` is a string, and `lib/restaurant-planner/tool-registry.ts`'s `CAPABILITY_REGISTRY` is the lookup table `ProposalCard.tsx` would consult for a second capability's preview/apply endpoints. Adding Pricing/Promotion/Analytics/etc. means a new `lib/restaurant-planner/capabilities/*.ts` module + one registry entry + a prompt template update — not changes to the route, the persistence schema, the rate-limiting wrapper, or the UI's intent-dispatch switch.
- **The model never sees or invents database IDs.** Actions reference menu content by name (`"Desserts"`, `"Cardamom Chai"`). Resolving a name to a real `menu_items`/`menu_categories` row is ordinary deterministic code (`lib/menu-discount-actions/resolve.ts`), not something trusted to the model. Ambiguous or unmatched names surface a clear "not resolved" reason with candidates instead of guessing.
- **Schedule resolution happens in the browser, not the server.** "After 7 PM" only means something relative to the restaurant's local time, and a Vercel serverless function's clock has no reliable relationship to where the restaurant physically is. `lib/menu-discount-actions/schedule.ts` runs client-side, using the admin's own browser as a proxy for the restaurant's timezone. v1 only supports a start time — no recurring daily windows, since the underlying `menu_items.special_start_at/special_end_at` schema is a single absolute pair, not a repeating schedule. This is also why the persisted assistant message stores the raw AI action rather than a fully server-resolved proposal — the real schedule timestamp can only be computed client-side, at Approve time.
- **Apply never trusts what Preview showed.** The apply route re-runs the identical `resolveMenuDiscountAction()` against current live data before writing anything, so a stale or tampered client-side diff can never be applied — what gets written is always freshly computed from the database at write time.
- **No fabricated margin figures.** `menu_items` has no cost/COGS column, so true gross margin cannot be computed from real data. `estimateDiscountImpact()` always returns `margin: null` with an explicit warning rather than inventing a plausible-looking number — the "Estimated gross margin" field in the UI reads "Not available" until real cost data exists somewhere in the schema.
- **A dedicated, owner-scoped audit table, not the existing `intelligence_audit_log`.** That table already existed and has the right shape (`entity_id`/`old_value`/`new_value`/`created_at`, append-only) but its RLS is `is_super_admin()`-only, since it was built for platform-config mutations. `menu_discount_change_log` reuses the same shape with RLS scoped to `restaurant_id in (select id from restaurants where owner_id = auth.uid())` instead, since this is the owner's own business data. Not yet generalized to be capability-agnostic — deferred until a second write-capability actually exists.
- **Human confirmation is a real gate, not decoration.** `ProposalCard.tsx` is the only caller of the apply route, and it only calls it after an explicit button click on a rendered before/after list. No code path writes to `menu_items` as a direct result of a generation call. The planner's own tool set (currently just the menu-pricing capability) never includes a write-capable "apply" tool the model could call — `applyDiscountProposal()` is only ever invoked by the human-gated apply route.

## V2: the Execution Planner

Extends the pipeline above without replacing it — same routes' base shape, same intents, same `menu_pricing` capability. Adds a persisted, versioned **Proposal** entity and closes two contract gaps a live audit found in V1 (see the two migration comments below and the memory of that audit for the full verification detail).

- **Proposals are now first-class and append-only.** `restaurant_planner_proposals` (`supabase/migrations/20260710010000_restaurant_planner_proposals.sql`) stores one row per version — a "modify" (a follow-up like "make it 15% instead") is always a new row (`version + 1`, same `proposal_group_id`), never an UPDATE, matching every other table in this system. `dashboard_assistant_messages` gained `proposal_group_id` (the stable anchor, used to find "is this proposal thread still open") and `proposal_id` (the exact version row *that specific chat message* represents — needed so an old bubble keeps showing the numbers it had at the time on reload, not whatever the group's latest version now is; added a beat later in `20260710020000_dashboard_assistant_messages_proposal_id.sql` once the distinction became clear mid-build).
- **Two confirmed V1 gaps, fixed at the schema level, additively.** `DiscountTarget` gained `scope:"items"` (explicit selection), `scope:"name_contains"` (a fragment that matches *all* real items, unlike `scope:"item"` which stays ambiguous on >1 match — this is what makes "apply 20% off all chai" actually resolve instead of always failing), and an optional `exclude` on `category`/`name_contains` ("every dessert except gulab jamun"). `DiscountSpec` gained `dayOffset:'tomorrow'`. `ResolvedDiscountSpec` gained `startTimeParseFailed` — a non-24-hour `startTime` still falls back to "starts immediately" (the DB schema still has nothing better), but that fallback is now a visible Proposal warning instead of silent. All three original `DiscountTarget` variants and the no-dayOffset/no-parse-failure paths are byte-for-byte unchanged.
- **Structured target selection, not a retyped chat message.** An ambiguous `scope:"item"` match now surfaces real candidates (`{name, categoryName}`, sourced from the resolver, never the model) on the `clarification` message itself. `TargetSelector.tsx` renders them as checkboxes; submitting posts to `/api/admin/assistant/target-selection`, which builds `{scope:"items", names: selected}` and calls `buildProposal()` directly — **no second model call**, since the candidates were already grounded.
- **Confidence and explainability are computed from resolution facts, not asked of the model.** `computeConfidence()` (`capabilities/menu-pricing.ts`) maps the resolver's `MatchKind` (exact vs. substring vs. explicit-list vs. fragment) to high/medium/low, downgraded to low if the schedule couldn't be parsed. `explainProposal()` composes a deterministic "why" string the same way `describeProposedAction`/`describeOutcome` always have — never raw model prose.
- **The "Planning Graph" recommendation was adopted as a data shape, not an engine.** `plan_tasks: [{id, label, status}]` is a fixed, per-capability step list `buildProposal()` populates as it walks its (currently strictly linear) pipeline. No scheduler, no dependency edges, no parallel/blocked execution logic exists — building one would be speculative for a single linear capability. The JSON shape is deliberately flexible enough that a real graph could be layered on later for a capability that actually branches (e.g. a future Analytics Agent), without a storage migration.
- **Revalidation before every write.** `revalidateProposal()` diffs a proposal's persisted `resolved_snapshot` against freshly re-resolved live data right before `/apply` writes anything — a changed price or a since-deleted item aborts with "generate a new proposal" instead of applying against stale numbers. `applyDiscountProposal()` also skips (no write, no audit row) any item whose live state already exactly matches the proposed state, reporting it as `skippedNoOp` rather than silently re-writing an identical discount.
- **8 future agents are registered as metadata, not code.** `CAPABILITY_REGISTRY` gained `menu_agent`/`promotion_agent`/`pricing_agent`/`analytics_agent`/`campaign_agent`/`customer_agent`/`inventory_agent`/`ordering_agent`, each `status:'planned'`, `executionPermission:'none'`, describing capabilities/supported actions/required context but backed by zero routes or logic. Only `menu_pricing` is `status:'active'`. This is what lets an `unsupported` response name a specific planned agent instead of an arbitrary string.

## Capability Management

Replaces the single global "is `dashboard_assistant` enabled" question with a per-capability, hierarchically-scoped one — directly answers the "no restaurant-scoped rollout" limitation the V2 activation dossier flagged as a blocking issue. Not a planner change: gating lives entirely in the tool-selection layer, so it generalizes to every future capability for free.

- **Three scopes, most specific wins.** `capability_settings` (`supabase/migrations/20260710030000_capability_settings.sql`) holds rows at `environment` (platform default, `scope_id` null), `restaurant`, or `owner` scope. `resolveCapabilityDecision()` (`lib/restaurant-planner/capability-settings.ts`) checks restaurant → owner → environment, first row found wins — an explicit restaurant-level "off" overrides an environment-level "on", not just the reverse. Mutable config (plain UPDATE via a trigger-maintained `updated_at`), not append-only — same convention as `intelligence_features.enabled`, not the append-only convention used by proposals/messages, since this is current on/off state rather than history.
- **The legacy flag is migrated in, not removed.** `intelligence_features.enabled` for `dashboard_assistant` is untouched and still gates the whole feature exactly as before (`lib/intelligence/feature-resolver.ts` unchanged) — nothing that currently reads it changes behavior. `capability_settings` is seeded with one environment-level row for `menu_pricing` mirroring that flag's live value (`false`) at migration time; going forward, `isCapabilityEnabled()` only ever falls back to reading the legacy flag for `menu_pricing` specifically, and only when zero `capability_settings` rows exist for it anywhere — the moment an admin sets *any* row (even a disabled environment-level one), the new system becomes authoritative and the legacy flag is no longer consulted.
- **Checked before tool selection, not inside the planner.** `messages/route.ts`'s `menu_discount_action` branch calls `isCapabilityAvailable()` (`tool-registry.ts` — combines the static registry's `status:'active'` check with the dynamic scope resolution) *before* calling `buildProposal()`. An unavailable capability short-circuits straight to a deterministic `explainCapabilityUnavailable()` message, persisted as `intent:'unsupported'` — a server-side override of the model's classification, the same pattern already used for the ambiguous-resolution downgrade. Re-checked a second time in `discount-action/apply/route.ts` and `target-selection/route.ts` immediately before writing, in case the capability was disabled in the gap between proposal creation and approval.
- **Minimal Super Admin UI, not a full experimentation platform.** `/super-admin/capabilities` lists every `CAPABILITY_REGISTRY` key with an environment-level toggle (same button style as the Intelligence Lab feature toggle), plus a lean form for adding a restaurant- or owner-scoped override by slug/email (resolved server-side to the real id — no raw-uuid pasting). RLS is `is_super_admin()`-only on every scope — this is a platform rollout control, not a restaurant owner self-service setting; a future owner-facing toggle would need its own RLS policy, not built here.

## Files map

| Concern | File |
|---|---|
| Planner entry point (classify) | `lib/restaurant-planner/planner-engine.ts` (`runPlannerTurn`) |
| Planner output contract + parser | `lib/restaurant-planner/types.ts` (`PlannerOutput`, `parsePlannerOutput`) |
| Real menu data for prompt context | `lib/restaurant-planner/context.ts` (`buildMenuSnapshot`) |
| Capability registry (extension point, incl. 8 planned stubs) | `lib/restaurant-planner/tool-registry.ts` (`CAPABILITY_REGISTRY`) |
| Capability-agnostic proposal model | `lib/restaurant-planner/proposal.ts` (`ProposalStatus`, `Confidence`, `PlanTask`) |
| Proposal DB access (append-only, versioned) | `lib/restaurant-planner/proposals.ts` (`insertProposalVersion`, `findOpenProposalGroup`, `getProposalById`) |
| menu_pricing capability (build/estimate/revalidate/apply) | `lib/restaurant-planner/capabilities/menu-pricing.ts` |
| menu_pricing action contract (V2-widened target/discount) | `lib/intelligence/actions/menu-discount-schema.ts` (`MenuDiscountAction`) |
| Output validator | `lib/intelligence/validators.ts` (`dashboard_assistant` entry) |
| Entity resolution + before/after diff (V2 target scopes) | `lib/menu-discount-actions/resolve.ts` |
| Schedule string → timestamp (V2 dayOffset + parse-failure signal) | `lib/menu-discount-actions/schedule.ts` |
| Preview route (read-only, + impact estimate + revalidation) | `app/api/admin/menus/discount-action/preview/route.ts` |
| Apply route (writes + audits + revalidation + executed version) | `app/api/admin/menus/discount-action/apply/route.ts` |
| Checkbox selection route (no LLM call) | `app/api/admin/assistant/target-selection/route.ts` |
| Capability resolution (3-scope, legacy-flag fallback) | `lib/restaurant-planner/capability-settings.ts` (`isCapabilityEnabled`, `resolveCapabilityDecision`) |
| Combined static+dynamic availability check | `lib/restaurant-planner/tool-registry.ts` (`isCapabilityAvailable`, `explainCapabilityUnavailable`) |
| Capability settings table | `supabase/migrations/20260710030000_capability_settings.sql` |
| UI: Capability Management (env toggles + overrides) | `app/super-admin/capabilities/page.tsx`, `actions.ts` |
| Audit table | `supabase/migrations/20260709040000_menu_discount_change_log.sql` |
| Message schema (widened intents + capability column) | `supabase/migrations/20260710000000_restaurant_planner_intent_widen.sql` |
| Proposal table (versioned, append-only) | `supabase/migrations/20260710010000_restaurant_planner_proposals.sql`, `20260710020000_dashboard_assistant_messages_proposal_id.sql` |
| UI: command box + intent branch | `components/admin/dashboard/CommandCenter.tsx` |
| UI: generalized proposal card (confidence/reasoning/plan tasks) | `components/admin/dashboard/ProposalCard.tsx` |
| UI: structured target selection (checkboxes) | `components/admin/dashboard/TargetSelector.tsx` |
| Underlying discount primitive (pre-existing) | `menu_items.special_*` columns, `supabase/migrations/20260617000000_special_offer_engine.sql`, `lib/menu/special-offer.ts` |

## Status

Both `dashboard_assistant` and `sales_optimization` are registered in `intelligence_features` with `enabled: false`. Per the repo's engineering rules (prompts must never live in source code or migrations), **no prompt template exists for either yet** — that has to be authored by someone with super-admin access via `/super-admin/intelligence-lab`. Until that happens, both surfaces show a graceful "SpinBite is still learning this restaurant" message instead of erroring. This is the one manual, non-engineering step left before Ask SpinBite does anything for a real user.

**2026-07-10:** a production `dashboard_assistant` prompt template (targeting the current 4-intent `PlannerOutput` contract, `claude-sonnet-4-6`, temp 0.2) has been drafted, verified example-by-example against the live parser/resolver, and is ready to paste into Intelligence Lab — see the activation dossier (link kept outside this repo per Rule 20; ask in-thread for the artifact URL if it's been lost). Two confirmed Phase 1 contract gaps to know before authoring any future revision: (1) `resolveMenuDiscountAction` treats any multi-item name-fragment match as ambiguous unconditionally — there is no "apply to all matches" or exclusion primitive, only `scope:"category"`/`scope:"all"`; (2) `resolveDiscountSchedule` silently drops a non-24-hour `startTime` to `null` (treated as "starts immediately") rather than erroring — the prompt is the only thing enforcing the `HH:MM` format today. Neither blocks activation; both are documented as follow-up candidates, not fixed here.

**2026-07-10, superseding the paragraph above:** both gaps were fixed in V2 (see the V2 section above) — `name_contains`/`items`/`category.exclude` close the multi-item gap, `startTimeParseFailed` makes the schedule fallback visible instead of silent. A revised V2 prompt template (still 4 intents, now covering the widened target scopes + `refersToProposalId` modification + an explicit rule that Approve/Cancel are button-only and the model must never fabricate an execution response) has replaced the draft referenced above in the same activation dossier. Still not pasted into Intelligence Lab or enabled — still the one manual step blocking real users, now compounded by a confirmed gap: `intelligence_features.enabled` has no restaurant/owner scoping anywhere in `resolveFeature()`, so activation is necessarily global, not limited to a test restaurant. Flagged as a decision for whoever activates it, not fixed here.

## Capability Log

| Date | Capability | Intent / feature_key | PRs | Status |
|---|---|---|---|---|
| 2026-07-09 | Free-text Q&A about live dashboard metrics (revenue, orders, guests, promotions, coupons) | `dashboard_assistant` (answer intent) | Dashboard shell work, feature registered in same-day migration | Wired, **disabled** — no prompt template |
| 2026-07-09 | AI-generated single-paragraph "opportunity" suggestion on the dashboard | `sales_optimization` | Dashboard shell work (reused a pre-existing, previously-unused feature_key) | Wired, **disabled** — no prompt template |
| 2026-07-09 | Execute menu discount changes via natural language (clear/set, category/item/all scope, optional start-time schedule), gated by human-reviewed preview | `dashboard_assistant` (menu_discount_action intent) | #120, #121, #122, #123 | Wired end-to-end, **disabled** — no prompt template |
| 2026-07-10 | **Architecture generalization, not a new capability**: re-platformed the fixed two-intent pipeline onto the Restaurant Planner (`lib/restaurant-planner/`) — widened output to answer/clarification/unsupported/menu_discount_action, added a real menu snapshot to prompt context, extracted a capability registry + menu_pricing capability module, added a deterministic (never-fabricated) revenue-impact estimate, generalized `DiscountActionPreview.tsx` into `ProposalCard.tsx`. No behavior change for end users yet — still gated by the same disabled feature flag — but the prompt template someone eventually authors must target the new 4-intent `PlannerOutput` contract, not the old 2-intent one. | `dashboard_assistant` (all four intents) | (this PR) | Wired end-to-end, **disabled** — no prompt template |
| 2026-07-10 | **Execution Planner (V2), still menu_pricing, not a new capability**: proposals are now versioned append-only entities with confidence/reasoning/plan-task explainability and pre-execution revalidation; fixed the "apply 20% off all chai" gap (new `name_contains`/`items`/`category.exclude` target scopes) and the silent schedule-parse fallback (`startTimeParseFailed`, now a visible warning); added structured checkbox target selection (`TargetSelector.tsx`, no extra model call); registered 8 future agents in `CAPABILITY_REGISTRY` as metadata-only stubs. The "Planning Graph" idea from this round's design review was deliberately scoped down to a plain per-proposal task list, not a graph-execution engine — see the V2 section above for why. Prompt template still needs a matching revision (the same 4 intents, but `clarification` can now carry `candidates` and `menu_discount_action` can now carry `refersToProposalId`/the widened target scopes) before activation — same manual step as before, still not done. | `dashboard_assistant` (menu_discount_action + clarification, widened) | (this PR) | Wired end-to-end, **disabled** — no prompt template |
| 2026-07-10 | **Restaurant Tool Library v1, structural layer, not a new capability**: extracted `~25` reusable operations (menu search, pricing math, ownership checks, conversation context, proposal lifecycle) into named, individually-documented, registered `ToolDefinition`s (`lib/restaurant-planner/tools/`) — the stable surface a future capability composes. Fixed one real duplication (the ownership query inline-copied in all 6 Restaurant-Planner routes, now one `getRestaurant` tool) and one real bug found during the extraction (`cancelPromotion` could throw past its `ToolOutcome` contract on a DB error — now caught internally, restoring the original best-effort semantics). `buildProposal()`'s internals were deliberately left unchanged — refactoring them into the new tools would have created a circular import and redundant DB fetches; documented in the new doc rather than forced. 28 new tests, 159 passing total. See [`restaurant-tool-library-v1.md`](./restaurant-tool-library-v1.md) for the full tool list, contract, and migration detail. | n/a — infrastructure, no new intent/feature_key | (this PR) | Merged, behavior-preserving |

_Add a row here, not a new document, when Ask SpinBite gains its next capability. Only start a new versioned doc (`-v2`) if this one needs a structural rewrite, matching the convention `spinbite-platform-architecture-v3.md → v4` used elsewhere in this tree._

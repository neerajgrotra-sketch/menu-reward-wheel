# Ask SpinBite Evaluation Framework

Replays a library of restaurant conversations against the real planner pipeline and asserts on intent, capability selection, clarification, proposal generation/modification/versioning, approval, execution, unsupported handling, confidence, reasoning, and deterministic outputs — without calling the LLM on every run.

## Why two tiers

The planner has exactly one non-deterministic step: the single Anthropic call inside `generate()`. Everything before and after it is already pure or deterministic code. This framework is built around that seam:

- **Tier 1 — Deterministic Replay** (`eval/run.test.ts`, runs in default `npm test`/CI). A golden conversation stores the exact raw JSON a model turn produced. The replay runner feeds that JSON straight into the real `parsePlannerOutput` — the LLM is never called — then drives the real downstream functions. Zero API cost, zero network, fully deterministic.
- **Tier 2 — Live Model Validation** (`npm run eval:live`, opt-in only, never part of `npm test`). Re-sends a golden conversation's real input to whatever prompt is currently live and diffs the fresh output against the recorded golden output. This is the only tier that can answer "did my prompt edit break something." It requires `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`; it skips gracefully with a clear message when they're absent (as they are in this repo's default dev environment) rather than failing.

## Adding a golden conversation to an existing capability

Drop a new `*.golden.ts` file anywhere under `eval/conversations/<capability_key>/` exporting `conversation: GoldenConversation` (see `eval/runner/types.ts` for the full shape). It's picked up automatically by `eval/runner/discover.ts` — no runner code changes needed. Reuse an existing fixture under `eval/fixtures/` where possible; add a new one only for a genuinely new scenario (see below).

## Adding a whole new capability's suite

Two steps, both small:

1. Register an execution adapter in `eval/runner/replay.ts`'s `CAPABILITY_EVAL_ADAPTERS` — one entry, matching `CAPABILITY_REGISTRY`'s and `TOOL_REGISTRY`'s own convention of a small flat object, one entry per capability. Model the adapter on `eval/runner/adapters/revenue-intelligence.ts` if the capability's leaf functions take a plain `SupabaseClient`/`ToolContext` parameter (no `next/headers` dependency) — that's the easy case, no hand-mirroring needed. If the capability's real orchestration lives inline in a route handler that constructs its Supabase client via `cookies()` (like `menu_pricing`'s does), you'll need a hand-mirrored orchestrator like `eval/runner/adapters/menu-pricing.ts` — keep it an intentionally dumb, literally-commented mirror of the real route, never independently extended.
2. Drop `.golden.ts` files under a new `eval/conversations/<new_capability_key>/` directory. A golden conversation whose capability has no registered adapter fails loudly at replay time (not silently skipped) — that's what makes it obvious when step 1 was missed.

## Fixtures

- `eval/fixtures/restaurants/*.ts`, `eval/fixtures/menus/*.ts` — named, shared, reusable plain-object literals. One real restaurant shape (`punjabi-by-nature`, the real "Punjabi By Nature" test restaurant — promoted from the informal inline pattern in `lib/menu-discount-actions/resolve.test.ts`), one synthetic edge-case restaurant (`small-cafe`).
- `eval/fixtures/orders/*.ts` — only needed by `revenue_intelligence` conversations (its analytics tools read `orders`/`order_items`/`promotions`/`promotion_rewards`/`coupon_redemptions`, none of which `menu_pricing` touches). Timestamps are computed relative to `Date.now()` at import time, not hardcoded, so fixtures don't silently drift out of the 30-day trailing analysis window as real time passes.

## The fake Supabase client (`eval/runner/fake-supabase.ts`)

The one piece of genuinely new test infrastructure this framework needed — a minimal, closed-surface in-memory stand-in for `SupabaseClient<Database>`, scoped to exactly the call shapes the real leaf functions use (enumerated in the architecture doc / PR description, not open-ended). Lives entirely under `eval/`, never imported by production code. Consumers cast it (`as unknown as SupabaseClient<Database>`) rather than trying to structurally satisfy postgrest-js's real generic type — a standard test-double pattern.

## Tier 2 — capture-then-promote runbook

Once someone has `ANTHROPIC_API_KEY`/`SUPABASE_SERVICE_ROLE_KEY` available (`npm run eval:live`):

1. Run the live-eval suite. It re-sends each golden conversation's `userMessage` to the currently-active `dashboard_assistant` prompt and writes the fresh raw output to a gitignored scratch location (`eval/live/.captures/`, never committed).
2. **Review it by hand.** A capture that runs without erroring is not the same as a capture that's correct — a prompt regression can produce a plausible-looking but wrong classification that would get silently baked in as new "golden truth" if promotion isn't deliberate.
3. Only after review, manually update the relevant `.golden.ts` file's `recordedPlannerOutputRaw` (and flip `recordedSource` to `'captured'`) and commit it as an ordinary code change.

**Never auto-promote a capture.** `eval/live/capture.live-eval.ts` is currently scaffolding proving the skip-gracefully behavior — the actual capture implementation (step 1 above) is a follow-up, not yet built.

## Known scope boundaries (by design, not oversight)

- The framework asserts the REAL proposal lifecycle (`draft`/`modified` → `executed`, or → `cancelled`) — never `'approved'`, which is declared in `ProposalStatus` but is dead code (zero writes anywhere in the app).
- "Tool selection" is asserted via each capability's own developer-authored resolution-path label (`menu_pricing`'s `matchKind`, `revenue_intelligence`'s `RevenueOpportunity.toolsUsed`) — neither is runtime-traced tool-call provenance, because `TOOL_REGISTRY` itself is inert in production (the model never calls tools; Phase 1 is a single classification call, not a tool-calling loop). Building real tracing would mean instrumenting a mechanism that doesn't exist in the live system.
- A revenue-intelligence-sourced proposal's own approve/execute path is deliberately NOT re-tested by `revenue_intelligence`'s adapter — `createProposalFromOpportunity` produces an ordinary `menu_pricing` proposal, indistinguishable from any other once created, and that path is already covered by `menu_pricing`'s own golden conversations (see `apply-and-execute.golden.ts`).

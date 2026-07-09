# Ask SpinBite — AI Agent Capability Log v1

_Living document — append a row to the Capability Log each time Ask SpinBite gains a new capability. Don't rewrite this doc from scratch per feature; extend it._

**Created:** 2026-07-09
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

## Architecture: the action pipeline

```
User types a request in CommandCenter
        ↓
POST /api/admin/intelligence/generate  (featureKey: dashboard_assistant)
        ↓
Structured JSON output — {intent: "answer", answer} | {intent: "menu_discount_action", action}
        ↓ (if an action)
Client resolves any relative schedule ("19:00") to a real timestamp,
using the browser's local time as a proxy for the restaurant's
        ↓
POST /api/admin/menus/discount-action/preview
        ↓
Deterministic resolution against real menu data — target names ("Desserts")
matched to real categories/items; ambiguous or unmatched names return a
reason + candidates, never a guess
        ↓
DiscountActionPreview renders the before/after diff — nothing has been
written yet
        ↓ (human clicks Apply)
POST /api/admin/menus/discount-action/apply
        ↓
Re-runs the SAME resolution against current live data (never trusts the
client's cached diff), writes via the session-authenticated client (RLS
is the real authorization boundary), logs one menu_discount_change_log
row per changed item
```

### Key design decisions

- **Structured output without touching the shared provider layer.** `lib/intelligence/intelligence-engine.ts`, `provider.interface.ts`, and every provider adapter (`anthropic-provider.ts` etc.) are untouched. The `dashboard_assistant` feature's validator (`lib/intelligence/validators.ts`) requires the model's plain-text output to be valid JSON matching a schema (`lib/intelligence/actions/menu-discount-schema.ts`) and rejects anything else. This was a deliberate alternative to adding native tool-use/JSON-mode to the shared engine, which would have been a much larger, more shared-blast-radius change affecting every AI feature in the app.
- **The model never sees or invents database IDs.** Actions reference menu content by name (`"Desserts"`, `"Cardamom Chai"`). Resolving a name to a real `menu_items`/`menu_categories` row is ordinary deterministic code (`lib/menu-discount-actions/resolve.ts`), not something trusted to the model. Ambiguous or unmatched names surface a clear "not resolved" reason with candidates instead of guessing.
- **Schedule resolution happens in the browser, not the server.** "After 7 PM" only means something relative to the restaurant's local time, and a Vercel serverless function's clock has no reliable relationship to where the restaurant physically is. `lib/menu-discount-actions/schedule.ts` runs client-side, using the admin's own browser as a proxy for the restaurant's timezone. v1 only supports a start time — no recurring daily windows, since the underlying `menu_items.special_start_at/special_end_at` schema is a single absolute pair, not a repeating schedule.
- **Apply never trusts what Preview showed.** The apply route re-runs the identical `resolveMenuDiscountAction()` against current live data before writing anything, so a stale or tampered client-side diff can never be applied — what gets written is always freshly computed from the database at write time.
- **A dedicated, owner-scoped audit table, not the existing `intelligence_audit_log`.** That table already existed and has the right shape (`entity_id`/`old_value`/`new_value`/`created_at`, append-only) but its RLS is `is_super_admin()`-only, since it was built for platform-config mutations. `menu_discount_change_log` (new) reuses the same shape with RLS scoped to `restaurant_id in (select id from restaurants where owner_id = auth.uid())` instead, since this is the owner's own business data. This is the foundation for a future "undo the AI's last action" feature — not itself built yet.
- **Human confirmation is a real gate, not decoration.** `DiscountActionPreview.tsx` is the only caller of the apply route, and it only calls it after an explicit button click on a rendered before/after list. No code path writes to `menu_items` as a direct result of a generation call.

## Files map

| Concern | File |
|---|---|
| AI output contract + parser | `lib/intelligence/actions/menu-discount-schema.ts` |
| Output validator | `lib/intelligence/validators.ts` (`dashboard_assistant` entry) |
| Entity resolution + before/after diff | `lib/menu-discount-actions/resolve.ts` |
| Schedule string → timestamp | `lib/menu-discount-actions/schedule.ts` |
| Preview route (read-only) | `app/api/admin/menus/discount-action/preview/route.ts` |
| Apply route (writes + audits) | `app/api/admin/menus/discount-action/apply/route.ts` |
| Audit table | `supabase/migrations/20260709040000_menu_discount_change_log.sql` |
| UI: command box + intent branch | `components/admin/dashboard/CommandCenter.tsx` |
| UI: preview/confirm/apply | `components/admin/dashboard/DiscountActionPreview.tsx` |
| Underlying discount primitive (pre-existing) | `menu_items.special_*` columns, `supabase/migrations/20260617000000_special_offer_engine.sql`, `lib/menu/special-offer.ts` |

## Status

Both `dashboard_assistant` and `sales_optimization` are registered in `intelligence_features` with `enabled: false`. Per the repo's engineering rules (prompts must never live in source code or migrations), **no prompt template exists for either yet** — that has to be authored by someone with super-admin access via `/super-admin/intelligence-lab`. Until that happens, both surfaces show a graceful "SpinBite is still learning this restaurant" message instead of erroring. This is the one manual, non-engineering step left before Ask SpinBite does anything for a real user.

## Capability Log

| Date | Capability | Intent / feature_key | PRs | Status |
|---|---|---|---|---|
| 2026-07-09 | Free-text Q&A about live dashboard metrics (revenue, orders, guests, promotions, coupons) | `dashboard_assistant` (answer intent) | Dashboard shell work, feature registered in same-day migration | Wired, **disabled** — no prompt template |
| 2026-07-09 | AI-generated single-paragraph "opportunity" suggestion on the dashboard | `sales_optimization` | Dashboard shell work (reused a pre-existing, previously-unused feature_key) | Wired, **disabled** — no prompt template |
| 2026-07-09 | Execute menu discount changes via natural language (clear/set, category/item/all scope, optional start-time schedule), gated by human-reviewed preview | `dashboard_assistant` (menu_discount_action intent) | #120, #121, #122, #123 | Wired end-to-end, **disabled** — no prompt template |

_Add a row here, not a new document, when Ask SpinBite gains its next capability. Only start a new versioned doc (`-v2`) if this one needs a structural rewrite, matching the convention `spinbite-platform-architecture-v3.md → v4` used elsewhere in this tree._

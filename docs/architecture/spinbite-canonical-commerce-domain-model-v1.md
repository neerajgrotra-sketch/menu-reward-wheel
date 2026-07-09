# SpinBite Canonical Commerce Domain Model v1

**Status:** Architecture only. **Nothing in this document has been implemented.** No schema changes, no migrations, no code.
**Date:** 2026-07-08
**Purpose:** Define the permanent business model SpinBite owns regardless of which POS, payment provider, or future integration is connected — the model every future feature must fit inside.
**Verification method:** Live schema re-verified against Supabase project `viaoholpnysccaijfpox` (41 tables, full column dump), live data distributions (`session_events`, `live_interventions`, `orders`, `payments`, `promotions`, `games`), and current code organization (`app/`, `lib/`, `engine/`, `components/`). Everything stated as fact below is either freshly queried in this session or carried from `spinbite-pos-integration-layer-audit-v1.md`'s same-day verified findings — nothing is assumed from older docs without re-checking against one of these two sources.
**Relationship to other docs:** Assumes the POS Integration Audit's recommendations (`spinbite-pos-integration-layer-audit-v1.md`) are correct and does not re-litigate them — it treats that audit's provider-abstraction design as a given constraint this model must be consistent with. Supersedes no existing doc; `spinbite-platform-architecture-v4.md` remains the platform's implementation-level reference, this document sits above it as the permanent conceptual model.

---

## 0. Executive Summary

SpinBite is not becoming a POS. It is becoming the durable business-entity layer a restaurant's revenue operates on, with POS/PSP/delivery/CRM/etc. as interchangeable, swappable providers underneath it. The test for every entity in this document is: **does this survive a restaurant switching from Clover to Square?** If the answer is no, the entity is provider-owned and must never be load-bearing for SpinBite's own logic. If yes, it's canonical, and SpinBite must own its identity, lifecycle, and meaning forever.

Three things came out of this pass that weren't visible from the POS-only lens of the prior audit:

1. **Customer identity is architecturally disconnected from the session/order graph today.** `customer_profiles` (phone + consent) has no foreign key from `session_guests` or `orders` — the only path between "a phone number was captured" and "a dining visit happened" is through `play_sessions.customer_profile_id`, i.e. game-play, not ordering. A guest can place an order, be fully tracked through `session_events`, and never be linkable to their own phone number unless they separately played a promotion game. This is the single most consequential gap in the current schema relative to the AI-first mission — churn detection, lifetime value, and cross-visit personalization all depend on this link existing, and it doesn't.
2. **The ubiquitous language has real, live drift**, not just historical baggage: "session" denotes four unrelated things across four tables (one of them dead), "menu" changed meaning under the 2026-07-03 Menu Library redesign in a way that traps anyone reading older code or docs, and `games.slug` (kebab-case marketing names: `lucky-slot`, `scratch-win`) and `game_type` (snake_case technical identifiers: `reward_reels`, `scratch_card`) are two parallel, unmapped vocabularies for what should be one concept. None of this blocks the platform today, but every one of these will actively mislead an AI agent or new engineer reasoning about the schema, which is precisely the audience this document exists to protect.
3. **The extensibility test mostly passes already**, which is a genuine validation signal rather than aspiration: `order_origin` (`restaurant_qr | direct_link`) already proves the Order aggregate is channel-agnostic; `restaurant_touchpoints.type` was deliberately generalized (`table | patio | counter | pickup`) specifically to extend via a CHECK-constraint update, not a redesign; the payment-provider interface already proves the "one canonical aggregate, many interchangeable providers underneath" pattern in production. Reservations, delivery, voice ordering, digital signage, and wearables (§10) all slot into the existing entity shapes without redesign, provided the gaps in §11 are closed first.

This document produces: a full ownership review of all 41 live tables (§1), the canonical entity graph (§2), seven aggregate roots (§3), a canonical-ID and external-ID-mapping design (§4), a ubiquitous-language glossary with explicit drift flags (§5), nine bounded contexts (§6), a full business-event catalog distinguishing live from proposed events (§7), a provider-boundary audit (§8), an AI-consumption map (§9), a long-term extensibility test against eleven future integration categories (§10), a recommended schema-evolution punch list (§11), architectural risks (§12), open questions (§13), and ten constitutional rules (§14) binding on all future work.

---

## 1. Ownership Review of Every Existing Table

Reviewed against the live schema (41 tables, `public` schema). Grouped by domain area rather than as one 41-row table, for readability — every table is still covered exactly once.

**Legend** — *Owner*: who is permanently responsible for this data's correctness. *Source of truth*: where the authoritative value lives today (may differ from Owner once POS integration exists — noted where relevant). *AI deps*: what, if anything, the AI/decisioning layer reads from this table today or should in future.

### Restaurant & Location

| Table | Canonical entity | Owner | Lifecycle | Source of truth | External deps | AI deps | Scalability note |
|---|---|---|---|---|---|---|---|
| `restaurants` | Restaurant (currently conflates Restaurant + Location, see §5) | SpinBite | Created at onboarding, soft-deleted, rarely mutated after setup | SpinBite, except `pos_system` (dead stub, no source of truth at all — never read) | None live; `pos_connections` will attach here (POS audit) | Profile fields feed AI content-generation prompts (`restaurant_intelligence_profile`) | Needs an explicit Location split before true multi-location-per-brand is real (§5, §11) |
| `restaurant_settings` | Restaurant Configuration (key/value) | SpinBite | Mutated ad hoc, no versioning | SpinBite until `tax_rate_percent`/`service_fee_percent` flip to POS-owned per connection | POS tax sync (future) supersedes `tax_rate_percent` | Tax/fee values feed order pricing, not AI directly | Generic EAV shape scales fine; the two commerce-critical keys should eventually become typed columns (§11) |
| `restaurant_capabilities` | Feature Flag | SpinBite | Toggled by admin/ops | SpinBite | None | None | Directly reusable pattern for `pos_sync`-style toggles (already noted in POS audit) |
| `restaurant_touchpoints` | Touchpoint | SpinBite | Created/soft-deleted by admin | SpinBite; POS `table_mapping` (future) is a synced *reference*, not ownership transfer | Future POS table/check concept maps here, doesn't replace it | Location context for session/order AI signals | Already well-generalized (§0); good precedent |
| `restaurant_order_counters` | Order Numbering Sequence | SpinBite | Monotonic counter, one row per restaurant | SpinBite | None | None | Purely operational, not a business entity in its own right — a supporting table for the Order aggregate |

### Catalog

| Table | Canonical entity | Owner | Lifecycle | Source of truth | External deps | AI deps | Scalability note |
|---|---|---|---|---|---|---|---|
| `menus` | Menu | SpinBite (owner-scoped, not restaurant-scoped) | Created/cloned/soft-deleted by owner | SpinBite pre-POS; hybrid (import vs push per capability) post-connect | POS `menu_import`/`menu_push` (future) | Menu structure informs layout-optimization AI use cases | `version int` exists but is inert — not real optimistic concurrency (flagged in POS audit, restated §11) |
| `menu_categories` | Category | SpinBite | Scoped to a Menu, reorderable | Same as Menu | Same as Menu | Category-level sales aggregation | Name is a historical trap — this table is the *renamed original `menus` table* (§5) |
| `menu_items` | Item | SpinBite pre-POS; hybrid post-connect | Created/soft-deleted, heavily mutated (price, availability, merchandising, special-offer fields all on one row) | SpinBite pre-POS; **price/availability flip to POS-owned post-connect** (POS audit §2) | POS price/availability sync | Central input to nearly every commerce AI use case (§9) | Currently conflates catalog identity, price, availability, and marketing/merchandising metadata on one row — should decompose (§11) |
| `restaurant_menu_assignments` | Menu Assignment (join) | SpinBite | Created/toggled by owner | SpinBite | None | None | Clean many-to-many, no changes needed — the one part of the catalog domain that's already correctly modeled for multi-location reuse |

**Not yet built, canonically required**: Modifier Group, Modifier Option (§11) — zero rows, zero tables, confirmed absent by the POS audit's repo-wide grep.

### Ordering

| Table | Canonical entity | Owner | Lifecycle | Source of truth | External deps | AI deps | Scalability note |
|---|---|---|---|---|---|---|---|
| `orders` | Order | SpinBite at creation, hybrid after POS export (POS audit §8) | Created once, status-mutated through a 5-state CHECK enum, immutable after `completed`/`cancelled` | SpinBite for customer-facing state; POS becomes authoritative for kitchen/accounting state once exported | POS `order_create`/`order_status_webhook` (future) | Direct input everywhere — sales, timing, session correlation | `touchpoint_id` doesn't exist (confirmed again this session); `kitchen_notes`/`promotion_session_id` are dead columns; no persisted status-transition history (§7, §11) |
| `order_items` | Order Item | Same lifecycle as Order | Snapshot at creation (`name_snapshot`, `price_snapshot`), never mutated after | Same as Order | None directly (would gain modifier references once Modifier exists) | Item-level sales signal | Correctly immutable-snapshot today — this is good design, preserve it when Modifier support is added |

### Payments

| Table | Canonical entity | Owner | Lifecycle | Source of truth | External deps | AI deps | Scalability note |
|---|---|---|---|---|---|---|---|
| `payments` | Payment | Capability-driven (POS-managed / SpinBite-managed / hybrid, POS audit §9) | Inserted `pending` before provider call, mutated to terminal status | SpinBite (mock) today; whichever side captures, once real providers exist | PSP or POS `payment_capture`/`refund_create` | Settlement data is the eventual input to revenue-optimization AI (once real, not mocked) | `metadata jsonb` is an ungoverned grab-bag (tax/tip/fee/discount all inside it) — should promote stable fields to real columns (§11) |

### Customer Identity & Session

| Table | Canonical entity | Owner | Lifecycle | Source of truth | External deps | AI deps | Scalability note |
|---|---|---|---|---|---|---|---|
| `customer_profiles` | Customer | SpinBite, permanently (POS audit §2, restated as a constitutional rule §14) | Created/upserted at consent capture, rarely mutated after | SpinBite, always — never migrates to a POS/CRM | Future POS/CRM `customer_sync` is one-way-out (export), never source-of-truth-in | Foundational for churn/LTV/personalization AI — **currently unreachable from Order/Session** (§0, this is the headline finding) | Global (not restaurant-scoped) — correct for a cross-restaurant identity graph, but needs the missing link to Guest (§11) |
| `visit_sessions` | Visit Session | SpinBite | Opened at QR scan, closed on timeout/checkout/staff action | SpinBite | Future POS table-status sync (informational only) | Core unit of session-level behavioral analysis | Well-modeled; the `SessionPhase` client state machine (`resolving/confirmed/session_ended/resolve_failed`) is UI-only and never touches the DB — correctly kept separate |
| `session_guests` | Guest | SpinBite | Joined at device resolve, presence-tracked, never deleted | SpinBite | None | Per-guest behavioral profiling (already live, Session Intelligence V3.1) | No FK to `customer_profiles` — this is the specific missing link (§0, §11) |
| `session_events` | Behavior Event | SpinBite | Append-only, insert-only | SpinBite | None | **This is the primary AI input table today** — 10 live event types confirmed this session (`MENU_OPENED`, `ITEM_VIEWED`, `ITEM_VIEW_DURATION`, `ITEM_ADDED_TO_CART`, `ITEM_REMOVED_FROM_CART`, `CATEGORY_OPENED`, `PROMOTION_VIEWED`, `PROMOTION_PLAYED`, `ORDER_PLACED`, `SESSION_ENDED`) | Append-only design is correct and should be the template for the proposed order-event/POS-sync-event tables (§7) |
| `play_sessions` | Play Session | SpinBite | Created per game attempt, short-lived | SpinBite | None | Game-engagement AI (weighting, fatigue detection — not yet built) | The *only* current bridge between Customer and the rest of the graph (via `customer_profile_id`) — structurally accidental, not designed as the identity bridge (§0) |
| `guest_sessions` | **Dead** — superseded by `session_guests`/`play_sessions` | None (0 code references) | Frozen, 14 legacy rows | N/A | None | None | Should be dropped, not left as ambiguous residue (§11, §12) — flagged independently by the Supabase advisor for open RLS |

### Promotions & Engagement

| Table | Canonical entity | Owner | Lifecycle | Source of truth | External deps | AI deps | Scalability note |
|---|---|---|---|---|---|---|---|
| `promotions` | Promotion | SpinBite, permanently | Draft → active → paused, owner-authored | SpinBite | Optional future export to POS-native discount (one-way) | Promotion-performance AI, recommend-promotion use cases | Clean, well-scoped aggregate |
| `promotion_rewards` | Reward | SpinBite, permanently | Authored with a Promotion, referenced by redemptions | SpinBite | None | Reward-mix optimization (future) | `reward_type` default (`percent_discount`) silently produces $0 discount at checkout — a live logic bug outside this doc's scope, flagged for the product team |
| `promotion_game_assignments` | Game Assignment (join) | SpinBite | Authored with a Promotion | SpinBite | None | Game-selection weighting input | Clean join table |
| `coupon_redemptions` | Coupon | SpinBite, permanently | Issued → redeemed/expired, single-use enforced via CAS update | SpinBite | Optional future POS discount-application (one-way export) | Conversion-tracking input | RLS gap (zero policies) already flagged in POS audit as a live production bug — restated here as it also blocks any future AI read of redemption data via non-service-role paths |
| `rewards` | **Dead** — superseded by `promotion_rewards` | None (0 rows, legacy `RewardEditorPage` still reachable but not linked from primary nav) | Frozen | N/A | None | None | Should be dropped (§11) |
| `campaigns` | **Dead today, canonically required later** | None yet (0 rows, 0 code refs) | Not yet built | N/A | Future Communication Engine's export targets | Campaign-performance feedback loop (future) | Define the concept now (§5, §6) even though the table isn't live yet — prevents ad hoc reinvention when Communication Engine work starts |
| `games` | Game (catalog of available mini-games) | SpinBite | Seeded/managed by super-admin | SpinBite | None | Game-type performance comparison | `slug` (marketing name) and `game_type` (technical identifier, used elsewhere) are two unmapped vocabularies for the same concept (§5) |

### AI / Generative & Decisioning

| Table | Canonical entity | Owner | Lifecycle | Source of truth | External deps | AI deps | Scalability note |
|---|---|---|---|---|---|---|---|
| `live_interventions` | AI Decision (see §5 naming note) | SpinBite | Inserted by Decision Runtime, status-lifecycle `pending→acknowledged\|dismissed\|converted\|expired` | SpinBite | None | This *is* the AI output, not an input | Name says "intervention" but the table actually models the decision, not the dispatched action — naming drift (§5) |
| `intervention_events` | Intervention (the dispatched action, audit copy) | SpinBite | Append-only audit log | SpinBite | None | Feedback loop for decision-policy tuning | Correctly append-only; the better-named twin of `live_interventions` |
| `intelligence_features` | Feature Flag (AI-specific) | SpinBite | Toggled by super-admin | SpinBite | None | Gates which AI features run | Platform-operational, not commerce-domain |
| `intelligence_prompt_templates` | Prompt Template | SpinBite | Versioned by super-admin | SpinBite | Anthropic/OpenAI/Gemini API (generative, not decisioning) | Is itself AI configuration, not AI input | Belongs to the *Generative* Intelligence context, distinct from Decision Runtime (§6) |
| `intelligence_provider_costs` | Provider Cost Reference | SpinBite | Seeded/updated by ops | SpinBite | None | Cost accounting for generative AI usage | Platform-operational |
| `intelligence_usage_limits` | Usage Quota | SpinBite | Per-restaurant limits, reset periodically | SpinBite | None | None | Platform-operational |
| `restaurant_intelligence_profile` | Restaurant AI Context | SpinBite | Authored once, rarely mutated | SpinBite | None | Prompt-context input for generative features | 0 rows live — built but unused so far |
| `intelligence_experiments` | Prompt A/B Experiment | SpinBite | Super-admin managed | SpinBite | None | Feeds prompt-quality iteration, not commerce | 0 rows live |
| `intelligence_generation_logs` | Generation Log | SpinBite | Append-only | SpinBite | Records calls to external LLM/image providers | Cost/latency/success telemetry | Append-only, good pattern |
| `intelligence_audit_log` | Admin Action Audit (AI-config scope) | SpinBite | Append-only | SpinBite | None | None | Platform-operational, not commerce |
| `image_generation_jobs` | Image Generation Job | SpinBite | Queued → completed/failed | SpinBite | Replicate/Google Imagen | None | Supports Catalog (item images), not itself commerce data |
| `ai_generated_assets` | Generated Asset | SpinBite | Created per job, selectable | SpinBite | Same as above | None | Same |

**Note on AI table grouping**: these twelve tables actually split into two unrelated systems that happen to share the `intelligence_` prefix — a **Generative Intelligence** system (content/image generation, prompt templates, cost tracking) and a **Session Intelligence / Decision Runtime** system (`live_interventions`, `intervention_events`, plus the pure-function `lib/session-intelligence.ts`). This split is made explicit as two separate bounded contexts in §6 — treating them as one "AI" context today is itself part of the naming drift this document exists to correct.

### Platform Content & Auth (not restaurant commerce)

| Table | Canonical entity | Owner | Lifecycle | Source of truth | External deps | AI deps | Scalability note |
|---|---|---|---|---|---|---|---|
| `site_content`, `site_media`, `faqs` | Marketing Site Content | SpinBite (platform, not per-restaurant) | Managed by super-admin | SpinBite | None | None | **Not part of the commerce domain at all** — these serve spinbite.com itself, not any restaurant. Explicitly out of scope for this model; called out because their presence in the same database can mislead someone auditing "all tables" into treating them as commerce entities. |
| `profiles` | Platform User (Owner / Super Admin) | SpinBite | Created at signup | SpinBite (Supabase Auth) | None | None | Not a commerce entity — an identity/access-control entity, deliberately excluded from the Customer concept (§5 explicitly separates "Customer" from "platform user") |

---

## 2. Canonical Entity Graph

```
Restaurant (1) ──────< Touchpoint (*)
    │
    ├──< [restaurant_menu_assignments] >── Menu (*)         ← many-to-many, owner-scoped Menu
    │                                        │
    │                                        └──< Category (*)
    │                                                 │
    │                                                 └──< Item (*)
    │                                                          │
    │                                                          ├──< Modifier Group (*)  [NOT YET BUILT]
    │                                                          │        └──< Modifier Option (*)  [NOT YET BUILT]
    │                                                          │
    │                                                          └── Price, Tax  (attributes today — see §11 for
    │                                                                            proposed decomposition into
    │                                                                            first-class, versioned concepts)
    │
    ├──< Promotion (*) ──< Reward (*) ──< Coupon (*) >── Customer (via redemption, session-scoped only)
    │
    ├──< Visit Session (*) [via Touchpoint]
    │        │
    │        ├──< Guest (*)
    │        │        │
    │        │        ├──< Behavior Event (*)
    │        │        │
    │        │        └──< Order (*) ────< Order Item (*)
    │        │                 │
    │        │                 ├──< Payment (0..*)
    │        │                 │
    │        │                 └──< AI Decision (*) [via session_id/guest_id, not order_id directly]
    │        │
    │        └── Play Session (*) ──> Customer   ← the ONLY current DB path from a dining
    │                                              context to Customer identity (§0, §11)
    │
    └── Campaign (*) [NOT YET LIVE] ──> Customer (segment targeting, many-to-many, future)

Customer (Restaurant-independent, global identity)
    │
    └──< Play Session (*) ──< Coupon (redemption context)
         (no direct edge to Visit Session, Guest, or Order today — see §0, §11, §12)

Analytics / Revenue Intelligence — no stored entity; purely derived read
    projections over {Order, Order Item, Payment, Behavior Event, AI Decision}.
    Must remain read-only — never a write path back into any canonical entity.
```

**Cardinalities, stated explicitly:**

- Restaurant 1—* Touchpoint
- Restaurant *—* Menu (via `restaurant_menu_assignments`)
- Menu 1—* Category 1—* Item
- Item 1—* Modifier Group (proposed) 1—* Modifier Option (proposed)
- Restaurant 1—* Promotion 1—* Reward 1—* Coupon
- Coupon *—1 Customer, but only reachable via `play_session → customer_profile_id`, never via the order that redeemed it (**gap**, §0)
- Restaurant 1—* Visit Session (via Touchpoint)
- Visit Session 1—* Guest, 1—* Behavior Event, 1—* Order
- Guest 1—* Order (via `orders.guest_id`)
- Order 1—* Order Item, 0..*—Payment (a Payment may exist before its Order during checkout — `payments.order_id` is nullable)
- Guest/Visit Session 1—* AI Decision (via `session_id`/`guest_id` — **not** via Order directly, meaning an AI Decision can't currently be traced to the specific order it may have influenced)
- Customer 1—* Play Session — **no other canonical entity has a direct edge to Customer today**

**The single most important structural fact this graph makes visible**: Customer sits in its own disconnected subgraph, joined to the rest of the commerce graph only through the narrow, incidental path of game-play. Fixing this (§11) is the highest-leverage schema change this document recommends — higher leverage than anything in the POS audit, because it blocks core AI use cases (§9) regardless of whether POS integration ever ships.

---

## 3. Aggregate Roots

An aggregate root is the entity that owns its own consistency boundary — child entities never exist independently of it, and external code only reaches child entities through it.

### Restaurant
- **Purpose**: the tenant boundary for everything commerce-related.
- **Lifecycle**: created at onboarding, soft-deleted, effectively immutable identity thereafter (name/slug rarely change).
- **Ownership**: SpinBite, permanently, no exceptions.
- **Invariants**: `owner_id` must always resolve to a valid auth user; `slug` unique platform-wide; soft-delete (`deleted_at`) must cascade visibility (not data) to Menus, Touchpoints, Promotions.
- **Relationships**: owns Touchpoint, is assigned Menus (not owns), owns Promotion, owns Visit Session (via Touchpoint).
- **Example**: "Punjabi By Nature" — one `restaurants` row, one owner, multiple touchpoints, two assigned menus.

### Customer
- **Purpose**: the permanent, cross-restaurant identity of a real person, anchored to a phone number.
- **Lifecycle**: created at first consent capture (today: only via game-play), enriched over time (name, future loyalty), never restaurant-scoped, never deleted except by explicit privacy request.
- **Ownership**: SpinBite, permanently — the platform's single most defensible strategic asset (POS audit §2, restated as a constitutional rule §14).
- **Invariants**: `phone_number_e164` globally unique; consent timestamp required before any marketing use; must never be overwritten by a POS/CRM sync (import is one-directional, always additive/enriching, never authoritative-replacing).
- **Relationships**: today, only to Play Session. Should extend to Guest/Order (§11).
- **Example**: a diner who played a spin-wheel at Restaurant A last month and orders at Restaurant B today should, once §11 ships, resolve to the same Customer row across both.

### Menu
- **Purpose**: an authored, reusable catalog structure — the redesigned (2026-07-03), owner-scoped, multi-location-shareable unit.
- **Lifecycle**: created/cloned/edited by an owner, assigned to one or more Restaurants, soft-deleted.
- **Ownership**: SpinBite pre-POS; hybrid post-connect, per-menu based on which capability (`menu_import` vs `menu_push`) is active for that connection (never both directions for the same Menu at once — POS audit §2).
- **Invariants**: `(owner_id, name)` unique; a Menu's Categories/Items only make sense in the context of that Menu — no orphaned Category.
- **Relationships**: contains Category → Item (→ Modifier Group → Modifier Option, once built); assigned to Restaurant via join table.
- **Example**: "Weekend Brunch" menu, authored once, assigned to two of an owner's three locations.

### Order
- **Purpose**: the record of what a Guest committed to buying, and the durable, idempotent unit the entire pipeline (payment, kitchen, POS export, analytics) hangs off of.
- **Lifecycle**: created once (idempotent, DB-enforced), status-mutated through a small closed set of states, immutable once terminal.
- **Ownership**: SpinBite at creation; hybrid after POS export (SpinBite remains authoritative for what the *customer* sees, POS becomes authoritative for kitchen/accounting state — POS audit §8).
- **Invariants**: `idempotency_key` unique; `status` transitions only via the closed set already enforced in code (`pending→preparing→ready→completed`, any→`cancelled`); `subtotal`/line totals are snapshots, never recomputed retroactively from current menu prices.
- **Relationships**: contains Order Item; produces/consumes Payment; correlates to Visit Session + Guest; (proposed) produces AI Decision input, produces order-lifecycle Business Events (§7).
- **Example**: a QR-originated order for 3 items, one coupon applied, exported to a connected POS as a kitchen ticket.

### Promotion
- **Purpose**: the authored commerce/engagement mechanism — the umbrella over Reward and Coupon.
- **Lifecycle**: draft → active → paused, owner-authored, time-bounded (`starts_at`/`ends_at`).
- **Ownership**: SpinBite, permanently, no exceptions — even a POS with its own discount engine never becomes the source of truth for a SpinBite Promotion (POS audit §2); a Promotion may optionally be *exported* to a POS as a native discount, one-directionally.
- **Invariants**: exactly one `restaurant_id`; `(restaurant_id, slug)` unique; a Promotion's Rewards must belong to it, a Reward's Coupons must reference a valid, unexpired issuance.
- **Relationships**: contains Reward; Reward issues Coupon; Coupon redemption should (once §11 ships) resolve to Customer and Order both, not neither.
- **Example**: "Spin to Win" promotion at Restaurant A, three weighted Rewards, redeemed via Coupon at checkout.

### Campaign
- **Purpose**: an outbound, targeted communication to a Customer segment — the eventual export surface of the Communication Engine (per `spinbite-platform-architecture-v4.md`'s named platform engines).
- **Lifecycle** (defined now, not yet built): drafted → scheduled/triggered → sent → measured.
- **Ownership**: SpinBite, permanently.
- **Invariants** (proposed, since not yet live): must target a defined Customer segment, never an unrestricted raw export (this constraint is already a locked platform decision in v4 — "Campaigns must route through SpinBite; no unrestricted raw customer export"); every send must be an auditable Business Event.
- **Relationships**: targets Customer (segment, many-to-many); references Promotion optionally (a campaign promoting a specific promotion); produces Business Events feeding conversion measurement.
- **Example** (future): "Win back lapsed diners" campaign targeting Customers with no Order in 60 days, offering a Promotion.

### Visit Session
- **Purpose**: the bounded window of a real-world dining visit at a specific Touchpoint — the anchor for all in-visit behavioral and ordering activity.
- **Lifecycle**: opened at QR scan/resolve, closed on timeout, checkout, or staff action; one active session per Touchpoint enforced at the DB level.
- **Ownership**: SpinBite, permanently — no POS has an equivalent concept; a POS `table_mapping` (future) is informational only, never authoritative over this entity.
- **Invariants**: `status='active' ⟺ ended_at IS NULL` (already enforced); exactly one active Visit Session per Touchpoint (already enforced via partial unique index).
- **Relationships**: contains Guest, Behavior Event, Order; the correct anchor for cross-visit-to-Customer linkage once built (§11) — not `play_sessions`, which is incidental to this purpose.
- **Example**: a party of four scans the QR at Table 7, one Visit Session, three of the four devices resolve as distinct Guests.

**Payment**, while not in the requested example list, is treated as its own aggregate root (not a child of Order) because its lifecycle, failure modes, and reconciliation needs are genuinely independent — an Order can exist with zero, one, or (rare, retried) more than one Payment attempt, and Payment must be independently auditable for refund/chargeback purposes regardless of the Order's own state.

---

## 4. Stable / Canonical IDs

**Rule, stated once and applied everywhere in this section**: every canonical entity has exactly one SpinBite-issued UUID primary key. That UUID — never a provider ID, never a natural key like a phone number or slug — is what internal business logic, foreign keys, and AI/decisioning code reference. Slugs, short codes, and provider IDs are presentation or integration *aliases*, resolved to the canonical UUID at the boundary and never propagated inward.

| Entity | AI reference? | Provider reference? | Customer reference? | URL reference? | Report reference? | Notes |
|---|---|---|---|---|---|---|
| Restaurant | Yes (context) | Yes, via `pos_locations` mapping (POS audit) | No | Yes — `slug`, not UUID | Yes, UUID (internal), name (display) | `slug` already the correct URL alias pattern |
| Menu | Yes (context) | Yes, via `pos_external_mappings` | No | Indirectly (`?menu=` query param today) | Yes | — |
| Item | Yes (primary input) | Yes, via `pos_external_mappings` | No (customers never see the UUID) | No (rendered by name within a Menu page) | Yes | Price/availability sync keys off this mapping |
| Modifier Group/Option (proposed) | Yes | Yes, via mapping | No | No | Yes | Design the mapping table entry for these *before* building the tables (§11), not after |
| Touchpoint | Yes (context) | Yes, via future table-mapping | No | Yes — `touchpoint_code`, not UUID | Yes | `touchpoint_code` already the correct alias pattern |
| Order | Yes (primary input) | Yes, via `pos_order_exports.external_order_id` (POS audit) | Indirectly (via Guest→Customer once §11 ships) | Yes — `orders.id` itself is used directly in `/r/order/[orderId]` today (see note below) | Yes | **Flag**: the order-tracking URL exposes the raw UUID directly — acceptable given orders are not globally listable (post-Phase-0 RLS fix) and UUIDs are unguessable, but worth noting as the one deliberate exception to "never expose the raw UUID," made for a good reason (no separate short-code system exists for orders) |
| Payment | No (never surfaced to AI as raw provider data, §9) | Yes, via `pos_payment_attempts` | No | No | Yes (aggregated only) | — |
| Customer | Yes (once linked, §11) | Yes, via future `customer_profiles` × restaurant × POS-customer-id mapping (1-to-many, POS audit §2) | Yes — but a Customer never sees their own UUID, only their phone number as their identifier | No | Yes | The one entity where the "natural key" (`phone_number_e164`) is legitimately customer-facing — it's how the platform itself identifies them at consent capture, distinct from internal FK usage |
| Promotion | Yes | Optional future one-way export | No | Yes — `slug` | Yes | — |
| Coupon | Yes | Optional future one-way export | Yes — `coupon_code` is the customer-facing identifier | No (code entered/scanned, not URL) | Yes | `coupon_code` already the correct alias pattern |
| Campaign (future) | Yes | No (SpinBite-native, never provider-owned) | No (targets Customer, never exposes ID to them) | No | Yes | — |
| Visit Session | Yes (primary input) | Informational only, never authoritative | Indirectly, once §11 ships | No (never exposed as a URL param — `session_access_code` is a separate 6-digit display code, correct pattern) | Yes | `session_access_code` already the correct alias pattern |
| Guest | Yes (primary input) | No | Should become the FK anchor to Customer (§11) | No | Yes | `guest_token` is a *credential*, not an identifier alias — different purpose, don't conflate |
| AI Decision (`live_interventions`) | N/A (this is AI output) | No | No | No | Yes | — |

**External ID mapping** — reaffirms and generalizes the POS audit's `pos_external_mappings` design (§7 of that document) rather than proposing a competing scheme: one generic mapping table per external-system category (POS, and eventually delivery/CRM/accounting), keyed `(connection_id, entity_type, spinbite_id, external_id)`, never a bespoke `clover_item_id`-style column bolted onto a canonical table. This document adds one refinement: **the `entity_type` enum in that mapping table should be defined now, once, covering every canonical entity in §2** (`restaurant | menu | category | item | modifier_group | modifier_option | customer | order | payment | table`), even though only a subset is needed for Phase 1-6 of the POS roadmap — so that a future delivery-platform or CRM integration extends the same table rather than each integration inventing its own mapping shape.

---

## 5. Ubiquitous Language

The official vocabulary. Terms not listed here should be treated as provisional until added.

| Term | Canonical meaning | Table(s) | Status |
|---|---|---|---|
| **Restaurant** | The tenant/business entity that owns menus, promotions, and touchpoints | `restaurants` | Stable, but currently conflates Location (§11 recommends splitting) |
| **Location** | *(not a distinct concept in the schema today)* A restaurant's physical premises | — | **Should be introduced as an explicit term now**, even before the schema splits it out, so new docs/code stop silently using "Restaurant" to mean "physical place" |
| **Touchpoint** | A named customer interaction point at a Restaurant: table, patio, counter, pickup, etc. | `restaurant_touchpoints` | Stable, already well-generalized — a model example of correct ubiquitous language |
| **Menu** | A named, owner-authored, reusable catalog structure, assignable to one or more Restaurants | `menus` | **Drift warning**: pre-2026-07-03 this word meant "the restaurant's one implicit menu." Anyone reading code/docs/commit history before that date is reading the old meaning. New material must always mean "a Menu" (the named entity) or explicitly say "a Restaurant's assigned menus" (the resolved plural set) — never "the menu" unqualified. |
| **Category** *(table name: `menu_categories`)* | A named grouping of Items within a Menu | `menu_categories` | **Drift warning**: this table is the *literal renamed original `menus` table* from before the 2026-07-03 redesign. Historical migrations/comments referring to "menus" may actually mean today's Category. |
| **Item** | A single orderable catalog entry within a Category | `menu_items` | Stable term, but the underlying row conflates catalog identity with price, availability, and marketing metadata (§1, §11) |
| **Modifier Group / Modifier Option** | *(not built)* A named set of customer-selectable customizations for an Item, with optional price delta | — | Canon defined now; schema build deferred to POS audit Phase 3 per that document's own sequencing — **the concept should not be redesigned in three different ways by three different future features before the real table exists** |
| **Price** | The amount charged for an Item (or Modifier Option) | `menu_items.price` (attribute today) | Stable meaning, unstable ownership — flips from SpinBite-owned to POS-owned per §2/POS-audit §2 the moment a connection exists in that mode |
| **Tax** | The jurisdiction-driven amount added to a Price at checkout | `restaurant_settings` (flat %, no UI) | Same ownership-flip caveat as Price; today's implementation is a stand-in, not the canonical shape (§11) |
| **Promotion** | An authored commerce/engagement mechanism with a defined Reward pool and Game(s) | `promotions` | Stable |
| **Reward** | A defined prize a Promotion can grant (a discount, a free item, etc.) | `promotion_rewards` | Stable — but the dead `rewards` table (different, legacy) should be retired so the word has exactly one referent (§11) |
| **Coupon** | An *issued instance* of a Reward, redeemable once | `coupon_redemptions` | Stable — the Reward/Coupon distinction is already correctly modeled, just needs the dead `rewards` table removed so nobody confuses the two |
| **Game** | A mini-game experience (spin wheel, scratch card, etc.) offered by a Promotion | `games`, `promotion_game_assignments` | **Drift warning**: `games.slug` (marketing names — `lucky-slot`, `scratch-win`, `pick-a-card`) and `game_type` (technical identifiers used in `play_sessions`/`promotion_game_assignments` — `reward_reels`, `scratch_card`, `open_the_door`) are two parallel, unmapped vocabularies for the same six concepts, confirmed live this session. Recommend either dropping `games.slug` in favor of `game_type` everywhere, or adding an explicit, documented mapping — not leaving the two to be silently correlated by position/convention. |
| **Customer** | A permanent, cross-restaurant identity anchored to a phone number, present regardless of whether they've ever dined anywhere | `customer_profiles` | Stable meaning; structurally disconnected from the rest of the graph (§0, §11) |
| **Guest** | A single participant (device/person) within one Visit Session — may never become a Customer | `session_guests` | Stable — the Guest→Customer transition (at consent) is a real domain event that today has no code path to actually perform the linkage (§11) |
| **Visit Session** | The bounded window of one real-world dining visit at one Touchpoint | `visit_sessions` | Canonical term — use this, not bare "session," in all new material |
| **Play Session** | A single attempt at a Promotion's Game | `play_sessions` | Canonical term — distinct from Visit Session; today it's the accidental bridge to Customer (§0) |
| ~~Guest Session~~ | *(retired)* | `guest_sessions` | **Dead table, near-identical name to `session_guests` — actively confusing.** Recommend dropping the table (§11) and never using this term again; use "Guest" or "Play Session" per the actual intent. |
| **SessionPhase** | Client-side-only UI state machine (`resolving/confirmed/session_ended/resolve_failed`) | Not a DB concept | Correctly kept separate from `visit_sessions.status` — do not conflate the two when writing about "session state" |
| **Behavior Event** | An append-only record of a guest action during a Visit Session | `session_events` | Canonical term for what's sometimes called "session event" or "interaction log" in older docs — prefer "Behavior Event" going forward, it's less overloaded |
| **Order** | A committed purchase, created once, idempotent | `orders` | Stable — no drift found, the cleanest term in the whole schema |
| **Order Item** | A single line within an Order, a price/name snapshot at order time | `order_items` | Stable |
| **Payment** | A single capture attempt against an Order (or pending one) | `payments` | Stable |
| **Opportunity** | A detected condition worth possibly acting on — the *input* to a Decision | `engine/decision-engine/opportunity-detector.ts`, `live_interventions.opportunity_type` | Defined here formally for the first time — previously used interchangeably with "Intervention" |
| **Decision** | The AI runtime's choice of whether/how to act on an Opportunity | `live_interventions` (despite the table's name) | **Naming drift**: this table's name says "intervention" but its actual content and status lifecycle (`pending→acknowledged\|dismissed\|converted\|expired`) model a *Decision*, not the dispatched action. A `status='dismissed'` row was never actually an intervention. Recommend treating "AI Decision" as the canonical name for this concept going forward in docs/comments, independent of whether the table is ever renamed. |
| **Intervention** | The concrete dispatched action taken as a result of a Decision (e.g., `waiter_notification`) | `intervention_events` (the better-named twin of the two) | Canonical — this table's name is the correct one; `live_interventions` is the one that's actually misnamed |
| **Conversion** | A Behavior Event or Order outcome attributable to a specific Decision/Intervention | `intervention_events.converted`, `.conversion_value` | Defined here formally — no prior single definition existed in docs |
| **High Intent** | *(informal term used in product framing, e.g. "push a beverage upsell at high-intent tables")* — not a stored value anywhere | — | **Should be formally defined** before AI work references it as if it were a queryable field — today it would have to be derived ad hoc from `session_events` patterns (e.g. `ITEM_VIEW_DURATION` + `ITEM_ADDED_TO_CART` without `ORDER_PLACED`) each time, with no canonical definition to keep those derivations consistent across features |
| **Campaign** | An outbound, targeted communication to a Customer segment | `campaigns` (dead today) | Canon defined now (§3) ahead of the table being built, specifically to prevent ad hoc reinvention |
| **Analytics / Revenue Intelligence** | Derived, read-only projections over commerce data — never itself a source of truth | No dedicated tables today | Explicitly not a stored entity — a bounded context (§6), not an aggregate |

---

## 6. Bounded Contexts

Grounded against the actual current code layout (`app/`, `lib/`, `engine/`, `components/`), not an idealized DDD diagram — where a context's code is genuinely already organized this way, that's noted; where it isn't, that's flagged as drift to fix opportunistically, not urgently.

### Restaurant Management
- **Responsibilities**: Restaurant profile, branding, hours, Touchpoint management, restaurant-level settings/capabilities.
- **Owned entities**: `restaurants`, `restaurant_settings`, `restaurant_capabilities`, `restaurant_touchpoints`, `restaurant_order_counters`.
- **Public interface**: "get restaurant profile for display," "resolve touchpoint code," "check capability flag."
- **Events published**: `RestaurantOnboarded`, `TouchpointCreated` (proposed, §7).
- **Depends on**: nothing (root context).
- **Forbidden dependencies**: must never reach into Catalog, Ordering, or Promotions tables directly.
- **Code today**: `app/admin/restaurants/**`, `components/admin/restaurants/**` — matches the context boundary well already.

### Catalog
- **Responsibilities**: Menu/Category/Item authoring, (future) Modifier authoring, Menu-to-Restaurant assignment.
- **Owned entities**: `menus`, `menu_categories`, `menu_items`, `restaurant_menu_assignments`.
- **Public interface**: "resolve a restaurant's active menus," "get item details," (future) "get item's modifier groups."
- **Events published**: `ItemCreated`, `ItemPriceChanged`, `MenuAssignedToRestaurant` (proposed, §7).
- **Depends on**: Restaurant Management (for assignment).
- **Forbidden dependencies**: must never depend on Session Intelligence, Ordering, or POS Integration — Catalog is authored independently of how it's consumed.
- **Code today**: `lib/menu/**`, `app/admin/menus/**` — matches well.

### Ordering
- **Responsibilities**: Cart-to-Order conversion, order status lifecycle, order-item snapshotting.
- **Owned entities**: `orders`, `order_items`.
- **Public interface**: "create order (idempotent)," "transition order status," "get order for tracking."
- **Events published**: `OrderSubmitted`, `OrderAccepted`, `OrderStatusChanged`, `OrderCancelled` (§7).
- **Depends on**: Catalog (price/availability at order time), Customer Identity & Session (Visit Session/Guest attribution), Promotions (coupon application).
- **Forbidden dependencies**: must never depend on Payments' internal orchestration — Payments *calls into* Ordering (to create the order after capture), not the reverse; must never depend on POS Integration directly — all POS interaction happens through the provider interfaces (POS audit §4), never inline in order-creation logic.
- **Code today**: `lib/orders/**`, `hooks/useCart.ts`, `app/api/public/orders/**` — matches well; cart itself is client-only/ephemeral, correctly not modeled as a server entity.

### Payments
- **Responsibilities**: Payment capture orchestration, provider abstraction, refunds.
- **Owned entities**: `payments`.
- **Public interface**: the existing `PaymentProvider` interface (`createCheckout/authorizePayment/capturePayment/refundPayment/verifyWebhook`) — already provider-neutral in production.
- **Events published**: `PaymentCaptured`, `PaymentFailed`, `PaymentRefunded` (§7).
- **Depends on**: Ordering (to create the order once capture succeeds).
- **Forbidden dependencies**: must never let a specific provider's shape leak past the `PaymentProvider` interface boundary into Ordering or any UI component — already correctly enforced today, must remain so as POS-managed payment is added (POS audit §9).
- **Code today**: `lib/payments/**` — the single best-organized context in the codebase today; the template for how every other context should look.

### Promotions & Engagement
- **Responsibilities**: Promotion authoring, Reward definition, Coupon issuance/redemption, Game selection and runtime.
- **Owned entities**: `promotions`, `promotion_rewards`, `promotion_game_assignments`, `coupon_redemptions`, `games`, `play_sessions`.
- **Public interface**: "get active promotions for a restaurant/item/category," "issue coupon," "redeem coupon," "resolve weighted game for a play."
- **Events published**: `PromotionActivated`, `CouponIssued`, `CouponRedeemed`, `GamePlayed` (mix of live and proposed, §7).
- **Depends on**: Catalog (item/category targeting), Restaurant Management.
- **Forbidden dependencies**: must never depend on POS Integration for its own logic — a Promotion is fully valid with zero POS connection; POS export of promotions (future) is a one-way, optional add-on, never a dependency.
- **Code today**: `lib/game-pool/**`, `lib/games/**`, `components/promotion-builder/**`, `components/games/**` — already tightly colocated, matches this context boundary closely; this is one context, not two, despite Games and Promotions living in visually separate admin screens.

### Customer Identity & Session Intelligence
- **Responsibilities**: Customer identity/consent capture, Visit Session lifecycle, Guest presence, Behavior Event capture, Decision Runtime (AI decisioning over sessions).
- **Owned entities**: `customer_profiles`, `visit_sessions`, `session_guests`, `session_events`, `live_interventions`, `intervention_events`.
- **Public interface**: "resolve/join a visit session," "record a behavior event," "get session intelligence summary," "evaluate session for intervention opportunities."
- **Events published**: nearly all of §7's session-scoped events; also **consumes** `OrderSubmitted`/`PaymentCaptured` from Ordering/Payments as triggers for decisioning.
- **Depends on**: Restaurant Management (Touchpoint), Ordering (order events as decisioning triggers).
- **Forbidden dependencies**: must never depend on POS Integration or Catalog internals — decisioning already correctly operates only on its own event stream (POS audit §10 confirmed this is additive-only).
- **Code today**: `engine/session-presence/**`, `engine/decision-engine/**`, `engine/decision-runtime/**`, `lib/session-intelligence.ts` — this is genuinely two sub-contexts sharing one folder tree today (presence/identity vs. decisioning); fine to keep colocated in code, but worth keeping conceptually distinct in this document since Decision Runtime consumes Session Intelligence's output rather than being the same thing.

### Generative Intelligence
- **Responsibilities**: LLM/image-generation orchestration for content creation (menu item images, marketing copy) — **distinct from** Session Intelligence's behavioral decisioning (§1's grouping note, §5).
- **Owned entities**: `intelligence_features`, `intelligence_prompt_templates`, `intelligence_provider_costs`, `intelligence_usage_limits`, `restaurant_intelligence_profile`, `intelligence_experiments`, `intelligence_generation_logs`, `intelligence_audit_log`, `image_generation_jobs`, `ai_generated_assets`.
- **Public interface**: "generate item image," "generate content for feature X."
- **Events published**: `GenerationJobCompleted` (implicit today via job status polling, not a real event — candidate for §7's proposed events).
- **Depends on**: Catalog (generates assets *for* Items), Restaurant Management (context/branding for prompts).
- **Forbidden dependencies**: must never depend on Session Intelligence or Ordering — this context has no behavioral or transactional awareness, by design.
- **Code today**: `lib/intelligence/**` — matches well; this context is already cleanly separated from `engine/decision-*` in code, even though both get casually called "AI" in conversation (§5's naming note).

### Campaign & Communication Engine *(not yet built)*
- **Responsibilities**: outbound, targeted Customer communication — SMS/push/email/wallet, per `spinbite-platform-architecture-v4.md`'s named "Communication Engine."
- **Owned entities**: `campaigns` (currently dead, to be rebuilt properly, not resurrected as-is — §11).
- **Public interface** (proposed): "create campaign targeting segment X," "send campaign," "get campaign performance."
- **Events published** (proposed): `CampaignSent`, `CampaignEngaged`.
- **Depends on**: Customer Identity (segment resolution), Promotions (optional promotion attachment).
- **Forbidden dependencies**: must never bypass Customer Identity to reach raw contact data directly — the locked platform decision ("no unrestricted raw customer export") should be enforced at this context's boundary, not left to callers' discipline.
- **Code today**: none — defining the context now, ahead of code, specifically so it isn't designed twice.

### POS Integration
- **Responsibilities**: exactly as designed in `spinbite-pos-integration-layer-audit-v1.md` — connection lifecycle, capability registry, sync orchestration, provider adapters.
- **Owned entities**: `pos_connections`, `pos_locations`, `pos_external_mappings`, `pos_sync_jobs`, `pos_sync_events`, `pos_webhook_events`, `pos_order_exports`, `pos_payment_attempts` (all proposed, none built).
- **Public interface**: the `POSProvider` interface bundle (`MenuSyncProvider | OrderProvider | PaymentProvider | InventoryProvider | CustomerProvider | WebhookHandler`) plus `CapabilityRegistry`.
- **Events published**: `POSConnectionEstablished`, `POSSyncCompleted`, `POSOrderExported`, `POSWebhookReceived` (§7).
- **Depends on**: Catalog, Ordering, Payments (as the *target* of sync, called by them — not the reverse).
- **Forbidden dependencies**: **must never be depended upon by Promotions, Customer Identity, Campaign, or Generative Intelligence** — restated from POS audit §2 as a hard boundary, because those contexts are exactly the ones this document identifies as SpinBite's permanent strategic core, and any dependency in that direction would mean losing platform functionality if a POS disconnects.
- **Code today**: none — this document and the POS audit define the context ahead of implementation.

### Revenue Intelligence / Analytics
- **Responsibilities**: derived, read-only reporting and forecasting over the commerce domain — sales trends, promotion performance, session-to-order conversion, (future) AI-driven revenue recommendations.
- **Owned entities**: none — by design, this context owns no source-of-truth data, only read models/projections over Ordering, Payments, Promotions, and Session Intelligence.
- **Public interface**: "get sales summary," "get promotion performance," (future) "get AI revenue recommendation."
- **Events published**: none (pure consumer).
- **Depends on**: Ordering, Payments, Promotions, Customer Identity & Session Intelligence — reads their published events/interfaces only, never their tables directly.
- **Forbidden dependencies**: must never write back into any other context's tables — a report that "corrects" a number by writing to `orders` or `payments` would violate the whole model.
- **Code today**: thin — `app/api/admin/dashboard-metrics`, `app/api/admin/promotion-metrics`/`promotion-performance` — the closest thing to this context existing today, worth growing deliberately as this context rather than accreting ad hoc metrics endpoints inside other contexts' API route groups.

### Platform Content & Marketing *(explicitly out of the commerce domain)*
- **Responsibilities**: spinbite.com's own marketing site content, FAQs, media.
- **Owned entities**: `site_content`, `site_media`, `faqs`.
- **Note**: included here only to draw the boundary clearly — this context has zero relationship to any restaurant's commerce data and should never be referenced by any of the contexts above.

---

## 7. Business Event Model

Distinguishes **Live** (already firing, confirmed via live `session_events`/`intervention_events` data this session) from **Proposed** (needed for the canonical model, not yet implemented — several already recommended independently by the POS audit and cross-referenced here rather than redesigned).

### Live events (confirmed via `session_events`, 10 types, all firing in production)

| Event | Publisher | Subscribers | Payload | Idempotency | Ordering | Retention |
|---|---|---|---|---|---|---|
| `MENU_OPENED` | Customer Experience (public menu page) | Session Intelligence | `{session_id, guest_id, restaurant_id}` | Not required (view event, safe to duplicate) | Not required | Indefinite (append-only) |
| `CATEGORY_OPENED` | Customer Experience | Session Intelligence | `{session_id, guest_id, category_id}` | Not required | Not required | Indefinite |
| `ITEM_VIEWED` | Customer Experience | Session Intelligence | `{session_id, guest_id, menu_item_id}` | Not required | Not required | Indefinite |
| `ITEM_VIEW_DURATION` | Customer Experience | Session Intelligence | `{session_id, guest_id, menu_item_id, duration_ms}` | Not required | Not required | Indefinite |
| `ITEM_ADDED_TO_CART` | Cart (client) | Session Intelligence, Decision Runtime | `{session_id, guest_id, menu_item_id, quantity}` | Not required | Weak (best-effort ordering by `created_at`) | Indefinite |
| `ITEM_REMOVED_FROM_CART` | Cart (client) | Session Intelligence, Decision Runtime | Same shape | Not required | Weak | Indefinite |
| `PROMOTION_VIEWED` | Customer Experience | Session Intelligence | `{session_id, guest_id, promotion_id}` | Not required | Not required | Indefinite |
| `PROMOTION_PLAYED` | Promotions & Engagement | Session Intelligence | `{session_id, guest_id, promotion_id}` | Not required (Play Session itself is the idempotent record) | Not required | Indefinite |
| `ORDER_PLACED` | Ordering | Session Intelligence, Decision Runtime | `{session_id, guest_id, order_id}` | Should be (currently relies on Order's own idempotency, not a dedicated event key) | Must follow Order creation | Indefinite |
| `SESSION_ENDED` | Customer Identity & Session Intelligence | Analytics (future) | `{session_id, reason}` | Not required | Must be last event for a session | Indefinite |

### Live decisioning events (confirmed via `live_interventions`/`intervention_events`, 2 opportunity types, 1 action type, exactly matching Decision Runtime V1's documented scope)

| Event | Publisher | Subscribers | Payload | Idempotency | Ordering | Retention |
|---|---|---|---|---|---|---|
| `OpportunityDetected` (`high_interest_no_purchase`, `dessert_interest_after_main_order`) | Decision Runtime | AI Decision record (`live_interventions`) | `{session_id, guest_id, opportunity_type, confidence_score, reasoning_summary}` | Enforced — unique `(session_id, opportunity_type)` where `status='pending'` | Must follow the triggering Behavior Event | Indefinite |
| `InterventionDispatched` (`waiter_notification` only) | Decision Runtime dispatcher | `intervention_events` (audit) | `{session_id, trigger_type, action_taken, confidence_score}` | Not enforced at DB level today — cooldown is in-memory only (20s, resets on cold start — a known limitation, not fixed here) | Must follow AI Decision | Indefinite (append-only audit) |

### Proposed events — Ordering (extends the POS audit's `order_events` recommendation into a full catalog)

| Event | Publisher | Subscribers | Payload | Idempotency | Ordering | Retention |
|---|---|---|---|---|---|---|
| `OrderSubmitted` | Ordering | Payments, POS Integration, Analytics | `{order_id, restaurant_id, items[], subtotal}` | Keyed on `orders.idempotency_key` (already exists) | First in the order lifecycle | Indefinite |
| `OrderAccepted` | Ordering (post-payment or direct) | POS Integration, Kitchen (future) | `{order_id}` | Idempotent per `order_id` | After `OrderSubmitted` | Indefinite |
| `OrderExported` | POS Integration | Analytics | `{order_id, pos_connection_id, external_order_id}` | Idempotent per `(order_id, pos_connection_id)` | After `OrderAccepted` | Indefinite |
| `OrderStatusChanged` | Ordering | Customer Experience (tracker), Analytics | `{order_id, from_status, to_status, changed_by}` | Not required (each transition is its own event) | Strictly ordered per `order_id` | Indefinite — **this is the event that must exist to close the console.log-only audit gap flagged in both this document and the POS audit** |
| `OrderCancelled` | Ordering or POS Integration (either direction) | Payments (trigger refund), POS Integration (propagate cancel) | `{order_id, reason, initiated_by}` | Idempotent per `order_id` | Terminal | Indefinite |

### Proposed events — Payments

| Event | Publisher | Subscribers | Payload | Idempotency | Ordering | Retention |
|---|---|---|---|---|---|---|
| `PaymentCaptured` | Payments | Ordering (order creation trigger), Analytics | `{payment_id, order_id, amount}` | Keyed on `payments` idempotency index (already exists) | After authorize | Indefinite |
| `PaymentFailed` | Payments | Customer Experience (retry prompt) | `{payment_id, reason}` | Same | — | Indefinite |
| `PaymentRefunded` | Payments | Ordering (reflect on order — requires the `orders.status` gap noted in §1 to be addressed), Analytics | `{payment_id, order_id, amount}` | Idempotent per `payment_id` | After capture | Indefinite |

### Proposed events — Promotions & Engagement (mostly already implicit in table state, formalized here)

| Event | Publisher | Subscribers | Payload | Idempotency | Ordering | Retention |
|---|---|---|---|---|---|---|
| `PromotionActivated` / `PromotionPaused` | Promotions & Engagement | Analytics | `{promotion_id, restaurant_id}` | Idempotent per state transition | — | Indefinite |
| `CouponIssued` | Promotions & Engagement | Analytics | `{coupon_redemption_id, promotion_reward_id}` | Enforced via `coupon_code` uniqueness (already exists) | — | Indefinite |
| `CouponRedeemed` | Ordering (at checkout) | Promotions & Engagement, Analytics | `{coupon_redemption_id, order_id}` | Enforced via CAS `status='issued'→'redeemed'` (already exists) | After `OrderSubmitted` | Indefinite — **should also carry `customer_profile_id` once §11's Guest→Customer link exists, closing the current gap where a redemption can't be attributed to a Customer through the order path** |

### Proposed events — Campaign *(design-level only, context not yet built)*

| Event | Publisher | Subscribers | Payload | Idempotency | Ordering | Retention |
|---|---|---|---|---|---|---|
| `CampaignSent` | Campaign & Communication Engine | Analytics | `{campaign_id, customer_id, channel}` | Must be idempotent per `(campaign_id, customer_id)` to prevent duplicate sends | — | Indefinite, subject to future retention policy for PII-adjacent send logs |
| `CampaignEngaged` (open/click/redeem) | Customer-facing surfaces | Campaign & Communication Engine, Analytics | `{campaign_id, customer_id, engagement_type}` | Not required | After `CampaignSent` | Indefinite |

### Proposed events — POS Integration (cross-references POS audit §6, not redesigned here)

`POSConnectionEstablished`, `POSSyncCompleted` (per entity type), `POSWebhookReceived`, `POSOrderExported` — full detail already specified in `pos_sync_events`/`pos_webhook_events`/`pos_order_exports` in the POS audit; not repeated here to avoid two documents disagreeing on the same design.

**Cross-cutting rule for every event above, live or proposed**: an event's payload references canonical SpinBite UUIDs only (§4) — never a provider-shaped ID, never a denormalized snapshot of mutable data beyond what's needed for the event's own meaning (e.g., `OrderSubmitted`'s `subtotal` is a legitimate snapshot; embedding the full current Menu Item row would not be).

---

## 8. Provider Boundary Verification

Re-examined specifically for canonical-entity leakage, extending the POS audit's grep-based check with a domain-model lens.

**No current violation exists in code** — confirmed again this session: zero references to `clover`/`square`(as POS)/`toast`(as POS)/etc. anywhere, and the one existing provider interface (`PaymentProvider`) is already correctly provider-neutral in its request/response types.

**One existing seam that must be actively protected, not just noted**: `payments.provider` is an unconstrained free `text` column with a single hardcoded factory (`getPaymentProvider()`). This is not itself a violation — it's the *hole* a violation would eventually go through if a future engineer, under deadline pressure, starts branching application logic on `payments.provider === 'clover'` outside the provider implementation itself. The constitutional rule (§14) exists specifically to make this an explicit, documented prohibition rather than a hope.

**One existing pattern flagged as borderline, not yet a violation**: `payments.metadata jsonb` already holds tax/tip/service-fee/coupon-discount breakdown data — none of it provider-specific today (it's all SpinBite-computed), but it establishes a precedent of "put miscellaneous charge data in an untyped JSONB blob" that a future POS-managed payment integration could easily extend with genuinely provider-shaped fields, at which point the canonical `Payment` aggregate would start silently depending on provider shape through its own metadata column. §11 recommends promoting the stable, non-provider-specific fields to real columns now, specifically to keep `metadata` reserved for what it should be: a strictly provider-specific overflow, not a general-purpose grab bag.

**`restaurants.pos_system`** (the dead onboarding stub, §1): explicitly flagged again here because it is exactly the kind of column a future engineer might reach for "since it's already there" when POS work starts — it must not be repurposed. The real connection state lives in `pos_connections` (POS audit design); this column should be dropped, not reused (§11).

**Confirmed clean**: `Order`, `Item`, `Customer`, `Menu` — none of these canonical entities carry any field today whose meaning depends on a specific provider. This is the correct state and the bar every future change must be checked against (§14, rule 2).

---

## 9. AI Consumption Map

For each example command, which canonical entities are the correct input — and whether the current graph actually supports it today.

| AI use case | Canonical entities required | Supported today? |
|---|---|---|
| Increase beverage sales by 20% today | Item, Category, Order, Order Item, Behavior Event | **Yes** — all required entities exist and are populated |
| Detect likely churn | Customer, Order history, Visit Session history | **No** — blocked entirely on the Customer↔Guest/Order link gap (§0, §11); until fixed, "churn" can only be measured within `play_sessions`' narrow game-play history, not actual dining/ordering behavior |
| Optimize menu layout | Item, Category, Behavior Event (`ITEM_VIEWED`, `ITEM_VIEW_DURATION`), Order (conversion correlation) | **Yes** — this is already the best-supported advanced use case in the current graph |
| Recommend promotions | Promotion, Reward, Coupon, Order, Behavior Event | **Yes**, with the caveat that recommendation quality is currently limited by the same Customer-linkage gap for anything personalized beyond restaurant-wide aggregates |
| Recommend staffing | Visit Session volume/timing, Order timing | **Partially** — current data supports volume-based staffing recommendations; true kitchen-load staffing needs the proposed `OrderStatusChanged` event history (§7), which doesn't exist yet |
| Detect abandoned orders | Behavior Event (`ITEM_ADDED_TO_CART` without a following `ORDER_PLACED`) | **Yes, approximately** — there is no durable server-side Cart entity (by design, §1), so "abandoned cart" must be inferred from the Behavior Event stream rather than read from a Cart table; this is the correct approach given Cart's deliberately ephemeral nature, not a gap to fix |
| Generate marketing campaigns | Customer, Campaign (not yet built), Order history, Promotion performance | **No** — blocked on both the Campaign context (§6) and the Customer linkage gap |
| Forecast inventory | Item, Order Item, (future) POS `inventory_sync` capability | **Partially** — sales-velocity forecasting from Order Item history works today; true stock-level forecasting needs POS Integration's `InventoryProvider` (per the POS audit), not a gap in this document's model |

**Consumption discipline (restates and extends POS audit §10 as a rule, not just a recommendation)**: AI/decisioning code must consume only normalized canonical-entity data (Behavior Events, Order/Order Item, Payment settlement data once real) — never raw provider payloads (`pos_webhook_events.raw_payload`), never `payments.metadata`'s unstructured JSONB directly (read the promoted columns, §11), and never a denormalized dump of an entire aggregate when a specific field will do. This keeps the AI layer's input surface stable even as the entities underneath continue to evolve or swap providers — exactly the property the whole domain model exists to guarantee.

---

## 10. Long-Term Extensibility Test

For each future integration category, whether the canonical model (once §11's gaps are closed) supports it without redesign.

| Integration | Attaches to | Redesign needed? |
|---|---|---|
| **Reservations** | New Reservation aggregate: Customer + Restaurant + Touchpoint (table) + time window | No — Customer, Restaurant, Touchpoint are all stable anchors already |
| **Delivery platforms** (DoorDash, UberEats) | Another `order_origin` value + another `OrderProvider`-shaped adapter (reusing the POS audit's interface almost verbatim) | No — validates that the POS abstraction generalizes beyond POS; `order_origin`'s existing `restaurant_qr \| direct_link` enum already proves Order is channel-agnostic |
| **Accounting** (QuickBooks, Xero) | Read-only export of Order + Payment + Tax data; one-directional, never feeds back | No — but confirms Payment's stable-column promotion (§11) should happen before this integration, since exporting from an untyped `metadata` blob is exactly the kind of friction this would surface immediately |
| **Inventory** | Item, via the already-proposed `InventoryProvider` capability | No |
| **CRM** | Customer, via the same synced-copy pattern as POS customer sync (POS audit §2) | No — but blocked in practice on the same Customer↔Order/Guest gap (§11); a CRM sync of a Customer who's never linkable to their own orders has little value |
| **Gift cards** | New GiftCard aggregate (balance, redemption events) | **Yes, minor** — Gift Card is a third value-transfer mechanism distinct from Coupon (a Coupon is single-use/promotion-bound; a Gift Card is a stored-value balance) and needs its own entity, not reuse of Coupon — flagged so nobody tries to force-fit it into the Coupon table later |
| **Loyalty** | LoyaltyAccount aggregate keyed by `customer_profile_id` | No — Customer is already the correct, ready anchor; deliberately not pre-built today per existing product guidance (confirmed absent in the POS audit), which is the right call |
| **Digital signage** | Read-only consumer of Menu, Item, Promotion | No — validates Menu/Promotion are already channel-agnostic presentation sources |
| **Voice ordering** | Another `order_origin` / Touchpoint type | No — same precedent as delivery platforms |
| **Wearables** | Same as voice ordering | No |
| **Robotics / kitchen automation** | Consumes Order, Order Item, and (future) Kitchen Routing/Station concepts from the Order Operations Engine audit | No — this is a KDS-adjacent consumer, not a canonical-model change |

**Conclusion**: ten of eleven categories require zero redesign of the canonical model once §11's gaps (Customer linkage, event history, Modifier concept, Payment field promotion) are closed. Only Gift Cards need a genuinely new aggregate — and that's correctly scoped as new, not a sign the existing model is wrong. This is a strong validation signal: **the model doesn't need to anticipate every future integration by name — it needs the handful of structural fixes in §11, after which the existing shapes (channel-agnostic Order, provider-neutral Payment, globally-anchored Customer) absorb almost everything on this list for free.**

---

## 11. Recommended Schema Evolution

A punch list, not migrations. Ordered roughly by leverage (highest-impact first), cross-referencing where an item was already flagged by the POS audit versus newly found here.

1. **Link `customer_profiles` to the dining/ordering graph** (new finding, this document) — e.g., a nullable `customer_profile_id` FK on `session_guests`, populated whenever a Guest completes consent capture (today only reachable via game-play; should also be reachable at order-time phone capture, order tracking, or coupon claim). This is the single highest-leverage fix in this entire document — it unblocks churn detection, LTV, and cross-visit personalization, none of which are possible today regardless of POS status.
2. **Build Modifier Group / Modifier Option** (POS audit, restated) — design the concept generically now (§5 canon already defined), build the schema once real POS modifier data is available to validate the shape against (POS audit Phase 3 sequencing stands).
3. **Add `orders.touchpoint_id`** (POS audit + Order Operations audit, restated) — direct-link orders currently have zero structured location.
4. **Build a persisted order-status event history** (`OrderStatusChanged`, §7; POS audit + Order Operations audit both independently flagged the console.log-only gap) — build once, informed by all three documents, not three times.
5. **Build `restaurant_staff`** (POS audit + Order Operations audit, restated — now confirmed by three independent audits including this one, since Campaign/Communication Engine work will also eventually need staff-level sender permissions, not just kitchen/POS work).
6. **Promote `payments.metadata`'s stable fields to real columns** (new finding, this document, §8) — `tax_amount`, `tip_amount`, `service_fee_amount`, `discount_amount` as typed columns; reserve `metadata` for genuinely provider-specific overflow only, ahead of Accounting/POS-managed-payment integrations that would otherwise have to parse JSONB.
7. **Retire dead tables**: `rewards`, `guest_sessions` (drop outright — both are 0-value, 0-or-near-0-reference, and actively confusing per §5's naming warnings); `campaigns` should be *redesigned*, not resurrected as-is, when Campaign & Communication Engine work actually starts.
8. **Resolve `games.slug` vs. `game_type` drift** (new finding, this document, §5) — either drop `slug` in favor of the technical identifier everywhere, or add an explicit, documented, enforced mapping.
9. **Drop `restaurants.pos_system`** (POS audit, restated with sharper reasoning here, §8) — must not be repurposed when POS work starts; the real connection state belongs in `pos_connections`.
10. **Introduce an explicit Location concept** (new finding, this document, §5) — even a thin `restaurant_locations` table with a 1:1 relationship to `restaurants` today would stop the conflation from deepening, ahead of any real multi-location-per-brand need.
11. **Define the `pos_external_mappings.entity_type` enum to cover the full canonical entity set now** (§4), not just the subset needed for Phase 1-6 of the POS roadmap, so future delivery/CRM/accounting integrations extend one table rather than each inventing its own.

Nothing in this list should be built as a single sweeping migration — each is independently sequenced within the POS roadmap (`spinbite-pos-integration-layer-audit-v1.md` §12) or, for items not on that roadmap (1, 6, 7, 8, 10), should get their own lightweight Phase-0-style cleanup pass, informed by this document.

---

## 12. Architectural Risks

| Risk | Why it matters | Where addressed |
|---|---|---|
| Customer identity graph disconnected from Order/Session | Blocks the majority of the AI-first mission's actual value (§9) — this is not a nice-to-have gap, it's the one that most directly contradicts "AI-first Restaurant Revenue Operating System" | §0, §11 item 1 |
| Ubiquitous language drift (`session` overloaded 4 ways, `menu` meaning-shift, `reward` vs `rewards`, `games.slug` vs `game_type`) | Actively misleads any future engineer or AI agent reasoning about the schema cold — the exact failure mode that caused the `play_sessions` constraint and `supabase_realtime` publication incidents in unrelated domains (doc said one thing, reality was another) | §5 |
| `payments.metadata` as an ungoverned JSONB grab-bag | Risks becoming a silent provider-shape leak as POS-managed payment and Accounting integrations land (§8) | §8, §11 item 6 |
| No canonical event history for Order status | AI/analytics has only current-state snapshots, no queryable timeline — directly limits "detect high-wait-risk orders"-class commands | §7, §11 item 4 |
| Dead tables (`rewards`, `campaigns`, `guest_sessions`) left live | Creates real ambiguity for anyone — human or AI — auditing "all tables" without this document in hand; also carries forward the open-RLS risk already flagged on `guest_sessions` by the Supabase advisor | §1, §5, §11 item 7 |
| Provider-neutral discipline depends on convention, not enforcement | `payments.provider` free-text + single hardcoded factory is easy to violate under deadline pressure with no lint/type-level guardrail today | §8, §14 rule 2 |
| RLS/security risks | Already fully covered in the POS audit (§1.5, §3, §11 Phase 0 of that document) — not re-audited here to avoid two documents drifting out of sync; referenced, not repeated | POS audit |
| Bounded-context boundaries are conceptual only, not enforced | Nothing today prevents a future feature from reaching directly into another context's table instead of its published interface — this document defines the boundary (§6) but only code review/architecture discipline enforces it | §6, §14 rule 7 |

---

## 13. Open Questions

1. Should Location become a real distinct table now, ahead of any actual multi-location-per-brand need, or is the current 1:1-with-Restaurant conflation acceptable to defer further?
2. Should the Modifier Group/Option schema be speculatively designed now, or genuinely wait for real Clover modifier data to shape it correctly, per the POS audit's Phase 3 sequencing? (This document's position: define the *concept* now, §5 already does — defer the *schema* as the POS audit recommends.)
3. Should `games.slug` be removed outright, or is there a product reason (e.g., customer-facing marketing copy) it needs to remain distinct from `game_type`?
4. Who is accountable for keeping this document and `spinbite-platform-architecture-v4.md` from drifting apart over time, given v4 remains the implementation-level reference and this document sits above it conceptually? (Recommend: any change to a canonical entity's ownership or lifecycle triggers a review of both documents together, not just the one being edited.)
5. Is a formal deprecation/removal process needed for dead tables (`rewards`, `guest_sessions`), or can they be dropped in a routine cleanup migration once this document is reviewed?
6. Should Behavior Events eventually be typed more richly (e.g., a discriminated union per `event_type` with a typed payload schema) now that they're confirmed as the primary AI input table, rather than the current single `metadata jsonb` shape?

---

## 14. Constitutional Rules

Binding on all future SpinBite work. A change that violates one of these should be treated as a design defect, not a style preference — and should trigger an update to this document, not a silent exception.

1. **Every canonical entity has exactly one SpinBite-issued UUID.** Business logic, AI/decisioning code, and internal APIs reference that UUID — never a provider ID, never a natural key — as the sole identity.
2. **Provider-specific identifiers and payloads live only in mapping/side tables** (`pos_external_mappings`, `*.metadata jsonb` reserved strictly for genuinely provider-specific data) — never as a required column on a canonical entity itself.
3. **Customer identity (`customer_profiles`) is permanently SpinBite-owned.** It is never migrated to, treated as secondary to, or overwritten by any POS, PSP, or CRM's customer record. External systems' customer data is imported as enrichment, never as replacement.
4. **Price and Tax are POS-owned once a POS is connected in that mode.** SpinBite never merges or edits a POS-sourced price/tax value — the POS value always wins, with no timestamp-based conflict resolution (restated from the POS audit as binding here too).
5. **Every state-changing business event is persisted as an immutable event record**, not only reflected as a mutated current-state column. Console.log-only audit trails are not acceptable for any canonical entity's lifecycle transitions.
6. **AI/decisioning code never consumes raw provider-shaped payloads** (POS webhook JSON, raw provider API responses) — only normalized canonical events and entities.
7. **A bounded context may only depend on another context's published interface or events, never reach directly into another context's tables.** Forbidden-dependency lists in §6 are binding, not advisory.
8. **New integrations (delivery, reservations, CRM, accounting, gift cards, etc.) are modeled as new instances of the existing provider-abstraction pattern** (§4, §10; POS audit §4) — not bespoke, one-off designs each time.
9. **Dead tables and columns are actively retired once confirmed unused**, not left as ambiguous historical residue for the next reader (human or AI) to misinterpret.
10. **The ubiquitous language defined in §5 is the only sanctioned vocabulary** for new code, comments, PRs, and documentation. A term not in that glossary is provisional; a deviation from a defined term requires updating this document, not silently drifting from it.

# SpinBite Business Invariants v1 — The Constitutional Rulebook

**Status:** Binding reference document. Not a schema audit, not a code audit, not an architecture audit — a **business invariant audit**. No code, no migrations, no implementation in this document.
**Date:** 2026-07-08
**Purpose:** Every rule below must remain true regardless of what gets built on top of SpinBite next — regardless of which POS connects, which AI model runs, which payment processor is active, or which engineer or agent writes the next PR. **No future feature should be implemented if it violates one of these invariants.** Where an invariant is currently violated in production, that violation is documented explicitly below, not hidden — a rulebook that pretends everything already complies with it is not a rulebook, it's fiction.
**Inputs:** `spinbite-platform-architecture-v4.md` (Platform Constitution), `spinbite-order-operations-engine-v1.md` (Ordering Architecture), the payment orchestrator and its live code, `spinbite-pos-integration-layer-audit-v1.md`, `spinbite-canonical-commerce-domain-model-v1.md`, `spinbite-customer-identity-spine-v1.md`, the Session Intelligence architecture docs (`/architecture/*.md`), the Promotions/Rewards/Coupon system's live code and schema, the Restaurant Workspace admin surface, the Generative and Decisioning AI code (`lib/intelligence/**`, `engine/decision-runtime/**`), and — for every violation claim below — the live Supabase schema and live production code, verified this session, not assumed from any prior document.
**How to use this document:** Every rule has a Priority (P0 = must gate any PR touching this area; P1 = fix before broader rollout of the affected feature; P2 = important, address opportunistically). A PR that violates a P0 rule should not merge. A PR that violates a P1 rule should not merge without an explicit, reviewed exception noted in the PR description.

---

## Restaurant

### R-1: Restaurant identity never changes implicitly
**Rule:** A `restaurants.id` (and its `owner_id`) is set once and never silently reassigned by any code path, migration, or integration.
**Why it exists:** Every other canonical entity (Menu, Order, Promotion, Touchpoint) anchors to this ID — a silent reassignment would corrupt every downstream relationship at once.
**What breaks if violated:** RLS policies scoped to `owner_id`, every FK in the schema, every admin session, every POS connection mapping.
**Tables:** `restaurants`.
**Services:** Restaurant Management (per the canonical domain model's bounded contexts).
**AI implications:** Any AI-driven "restaurant merge/split" feature (not currently planned) must go through an explicit, audited migration path, never a direct `UPDATE restaurants SET owner_id = ...`.
**POS implications:** A POS connection maps to one `restaurant_id`; the POS Integration Layer must never infer or change restaurant identity from POS-side data.
**Security implications:** `owner_id` is the root of nearly every RLS policy in the schema — its integrity is the tenant-isolation boundary itself.
**Migration implications:** Any future ownership-transfer feature (e.g., selling a restaurant to a new owner) needs its own explicit, audited flow — never an ad hoc `UPDATE`.
**Priority:** P0.

### R-2: Restaurant deletion is never hard delete
**Rule:** Removing a restaurant from active use must always be a soft-delete (`deleted_at` timestamp), preserving every historical order, payment, and menu record it ever produced.
**Why it exists:** A restaurant's historical data is permanent business/financial record, not disposable state — and once real payments and POS integration exist, a hard delete becomes a compliance and reconciliation hazard, not just a data-loss risk.
**What breaks if violated:** Financial reconciliation, order history, any future accounting export, any AI model trained on historical performance, any legal record-retention requirement.
**Tables:** `restaurants`, and by FK cascade: `orders`, `payments`, `menus`, `menu_items`, `promotions`, `rewards`.
**Services:** Restaurant Management.
**AI implications:** AI-driven churn/performance analysis over restaurants must never encounter a restaurant that "disappeared" without a trace — soft-delete preserves the historical signal.
**POS implications:** A disconnected/deleted restaurant's `pos_external_mappings` history must remain queryable for audit purposes even after soft-delete.
**Security implications:** Hard delete of a restaurant a POS is actively synced against would leave the POS connector holding references to nothing.
**Migration implications:** Any restaurant-deletion code path must write `deleted_at`, never `DELETE FROM restaurants`.
**Priority:** P0.
**⚠️ CURRENTLY VIOLATED — see Violations §1.**

### R-3: Restaurant capabilities are explicit, never inferred
**Rule:** Whether a restaurant has a given feature active (ordering, table management, payment simulation, future POS sync) is always an explicit row in a capability table, never inferred from the presence/absence of other data.
**Why it exists:** Inferred capability ("they have orders, so ordering must be on") breaks the moment historical data exists from a feature that's since been disabled, and blocks intentional per-restaurant rollout control.
**What breaks if violated:** Feature gating becomes unpredictable; a restaurant could "gain" a capability accidentally by acquiring data that looks like it, or lose one by having that data deleted.
**Tables:** `restaurant_capabilities`.
**Services:** Restaurant Management, consumed by every other context that needs a feature gate.
**AI implications:** AI features must check a capability flag before acting (e.g., don't propose a POS-driven action for a restaurant with no POS capability), not infer availability from data shape.
**POS implications:** A `pos_sync` capability flag (POS audit §4.3) is the correct extension of this existing pattern — already validated in production for `ordering`/`table_management`/`payment_simulation`.
**Security implications:** Capability checks are a legitimate authorization gate, not just a UX toggle — must be enforced server-side, not just hidden in the UI.
**Migration implications:** New features always ship with a new `restaurant_capabilities.capability_name` value, never a schema-presence check.
**Priority:** P1.
**Status:** Currently compliant — this is the one existing pattern in the codebase already worth defending, not correcting.

### R-4: A restaurant's location and legal/business identity are conceptually distinct, even before the schema splits them
**Rule:** New code must not further conflate "Restaurant" (the tenant/business entity) with "Location" (the physical premises) — even though today's schema represents both as one `restaurants` row, no new feature should deepen that coupling by, e.g., assuming `restaurants.address_line1` is a stable business identifier.
**Why it exists:** Multi-location brands and franchise scenarios will eventually need the split (canonical domain model §11); every day that passes without this discipline makes the eventual split more expensive.
**What breaks if violated:** True multi-location-per-brand support, POS merchant-vs-location mapping (a POS "merchant" ≠ a SpinBite "restaurant" for chains).
**Tables:** `restaurants` (today); future `restaurant_locations` (not built).
**Services:** Restaurant Management.
**AI implications:** Cross-location analytics for a brand (a future ask, per the AI use cases in the POS audit) needs Location as a first-class grouping key eventually — don't build analytics that assumes 1 restaurant = 1 location permanently.
**POS implications:** `pos_locations` (POS audit §7) already anticipates this split on the integration side — the canonical side should not fall further behind it.
**Security implications:** None directly.
**Migration implications:** Deferred, tracked as an open question in the canonical domain model (§13.1) — not urgent, but must not be made harder by new coupling.
**Priority:** P2.

### R-5: Restaurant soft-delete must cascade *visibility*, never data
**Rule:** When a restaurant is soft-deleted, its menus, touchpoints, orders, and promotions must become invisible in every customer-facing and admin-facing query, but the underlying rows must remain fully intact.
**Why it exists:** This is the actual point of soft-delete (R-2) — visibility control without data loss. A soft-delete implementation that forgets to filter one query path (e.g., a report that doesn't check `deleted_at`) creates a "ghost restaurant" that leaks into results it shouldn't.
**What breaks if violated:** A deleted restaurant's stale data appearing in an active admin list, a public menu page, or an AI training/analytics query.
**Tables:** `restaurants`, and every table joined transitively from it.
**Services:** Restaurant Management, Catalog, Ordering — every context must independently honor the parent's soft-delete state, not just the ones that check it today.
**AI implications:** Analytics/AI queries must always join through the restaurant's `deleted_at IS NULL` state unless explicitly building historical/deleted-restaurant reporting.
**POS implications:** A soft-deleted restaurant's POS connection should be treated as disconnected for sync purposes, even if the `pos_connections` row itself isn't touched.
**Security implications:** Low — this is a correctness rule, not a tenant-isolation one.
**Migration implications:** Once R-2 is fixed (soft-delete actually wired to the delete action), every existing query path that reads `restaurants`-joined data should be audited for a missing `deleted_at` filter.
**Priority:** P1.

---

## Menu

### M-1: Items belong to exactly one canonical menu (via exactly one category)
**Rule:** A `menu_items` row has exactly one `category_id`, and that category belongs to exactly one `menu_id` — no item exists outside this hierarchy, and no item spans multiple menus directly (multi-menu reuse happens at the Menu-to-Restaurant assignment level, never by an item belonging to two menus at once).
**Why it exists:** This is what makes the Menu Library redesign's reuse model (one Menu, many Restaurants) coherent — reuse happens by assigning a whole Menu, not by items floating between menus independently.
**What breaks if violated:** Menu editing becomes ambiguous ("which menu am I actually changing this item for?"), and POS catalog sync (which imports per-menu) would have no stable target.
**Tables:** `menu_items`, `menu_categories`, `menus`.
**Services:** Catalog.
**AI implications:** Menu-layout optimization AI must reason per-Menu, not assume a restaurant has one flat item list.
**POS implications:** POS catalog import/export (POS audit Phase 3) targets one Menu at a time — this invariant is what makes that well-defined.
**Security implications:** None directly.
**Migration implications:** None — already correctly enforced by the live schema's NOT NULL FKs.
**Priority:** P0.
**Status:** Currently compliant.

### M-2: Prices have exactly one source of truth at any given moment
**Rule:** For a given `menu_items` row, exactly one system is authoritative for its price at any point in time — SpinBite before a POS connects in price-owning mode, the POS after. Never both simultaneously, never a merge.
**Why it exists:** This is the POS audit's ownership-flip rule (§2, §6.3), restated here as binding across the whole platform, not just the POS layer — a price with two simultaneous authorities is a silent overcharge/undercharge risk.
**What breaks if violated:** A guest sees one price, gets charged another; POS ticket totals disagree with what SpinBite displayed; refund/dispute exposure.
**Tables:** `menu_items.price`.
**Services:** Catalog, POS Integration.
**AI implications:** Any AI-driven "dynamic pricing" feature (not currently planned) must go through whichever system currently owns price — never write `menu_items.price` directly from an AI decision without going through that authority.
**POS implications:** Core to the POS audit's design — restated here as a platform-wide constitutional rule, not just a POS-project convention.
**Security implications:** Price integrity affects revenue directly — any code path that writes `menu_items.price` should be traceable to exactly one authorized source at a time.
**Migration implications:** No schema change needed today (SpinBite is sole owner, pre-POS); becomes load-bearing the moment Phase 3 of the POS roadmap ships.
**Priority:** P0.

### M-3: Modifiers cannot exist without a parent group, and a group cannot exist without a parent item
**Rule:** (Forward-binding — the modifier concept doesn't exist in the schema yet, per the POS audit and canonical domain model.) Once built, a Modifier Option must always belong to exactly one Modifier Group, and a Modifier Group must always belong to exactly one Item — no orphaned modifier data.
**Why it exists:** This mirrors M-1's hierarchy discipline and is the correct shape for POS modifier import (every mainstream POS enforces the same hierarchy).
**What breaks if violated:** A modifier with no parent has no price context, no display context, and no valid place in an order.
**Tables:** Future `modifier_groups`, `modifier_options`.
**Services:** Catalog.
**AI implications:** Upsell recommendations involving modifiers ("add extra cheese") depend on this hierarchy being intact to know what's actually offerable.
**POS implications:** POS audit Phase 3 — this hierarchy should be validated against real Clover modifier data before the schema is finalized, not designed in the abstract.
**Security implications:** None directly.
**Migration implications:** N/A — not yet built.
**Priority:** P1 (binding once built; not yet applicable).

### M-4: Archived/deleted items remain historically valid on past orders
**Rule:** Deleting or archiving a `menu_items` row must never invalidate, blank out, or cascade-delete any `order_items` row that referenced it.
**Why it exists:** An order is a permanent record of what was actually sold — it cannot retroactively become invalid because the menu changed later.
**What breaks if violated:** Historical sales reporting, receipts, refund calculations, and any AI trained on order history would all silently corrupt as menus evolve.
**Tables:** `menu_items`, `order_items`.
**Services:** Ordering, Catalog.
**AI implications:** Sales-history AI must always be able to answer "what did this order actually contain" even for long-deleted items.
**POS implications:** POS-driven menu changes (item removed from POS) must never be allowed to touch historical `order_items` snapshots.
**Security implications:** None directly.
**Migration implications:** None — already correctly enforced (`order_items.menu_item_id ON DELETE SET NULL`, with `name_snapshot`/`price_snapshot` preserved independently of the live `menu_items` row).
**Priority:** P0.
**Status:** Currently compliant — this is one of the strongest existing invariants in the codebase and should be explicitly protected against regression.

### M-5: Merchandising metadata is never confused with commerce logic
**Rule:** Tags like "Chef Special," "Popular," "Featured" are display/marketing metadata and must never carry pricing or promotional logic of their own — a promotion is always a `promotions`/`promotion_rewards` row, never an implicit effect of a merchandising tag.
**Why it exists:** This is Platform Architecture v4's own locked invariant ("Merchandising tags ≠ commerce promotions"), restated here because it's exactly the kind of shortcut a future feature might take under time pressure ("just discount everything tagged Featured").
**What breaks if violated:** Two competing systems for "why is this item cheaper" — one auditable (Promotions), one not (tag-driven) — makes revenue reporting and AI-driven promotion recommendations unreliable.
**Tables:** `menu_items.tags`, `promotions`, `promotion_rewards`.
**Services:** Catalog, Promotions & Engagement — must remain separate.
**AI implications:** AI-driven "optimize menu positioning" (a named use case) must only ever touch merchandising metadata, never promotional pricing — a boundary that must be enforced in the AI's own tool/action surface, not just convention.
**POS implications:** Merchandising tags are SpinBite-only concepts with no POS equivalent — must never be exported as if they were POS-native discounts.
**Security implications:** None directly.
**Migration implications:** None — already correctly separated in the schema (`special_enabled`/`special_type`/etc. on `menu_items` is a distinct "Special Offer Engine" feature, not a tag-driven one — worth confirming this doesn't itself blur the line, see Violations §3).
**Priority:** P1.

### M-6: A Menu's `version` field, if it exists, must mean something
**Rule:** If a table exposes a version/revision field, either it is real optimistic-concurrency-relevant state that something reads and enforces, or it doesn't exist at all — no decorative version columns.
**Why it exists:** A version column nobody reads is worse than no version column — it signals a guarantee ("this is tracked/safe to compare") that isn't actually kept, and the next engineer who trusts it will be wrong.
**What breaks if violated:** Someone builds conflict detection logic against `menus.version` assuming it's incremented reliably, and silently gets no protection.
**Tables:** `menus.version`.
**Services:** Catalog.
**AI implications:** None directly.
**POS implications:** The POS ownership-flip rule (M-2) is exactly the scenario that would benefit from real version tracking — this gap should be closed before Phase 3 of the POS roadmap, not left decorative.
**Security implications:** None directly.
**Migration implications:** Either wire real increment-on-write logic and a real conflict check, or remove the column — currently neither.
**Priority:** P2.
**⚠️ CURRENTLY VIOLATED — see Violations §4.**

---

## Orders

### O-1: Order numbers are immutable and gapless-per-restaurant is not guaranteed, but never reused
**Rule:** Once `orders.order_number` is assigned via `next_order_number()`, it never changes, and it is never reassigned to a different order even if the original is cancelled.
**Why it exists:** Order numbers are customer-facing and staff-facing identifiers ("order #47") — reassignment would create confusion and, worse, could misattribute a cancelled order's number to an unrelated new one in conversation/receipts.
**What breaks if violated:** Kitchen ticket confusion, customer confusion, any reconciliation against a POS ticket number.
**Tables:** `orders.order_number`, `restaurant_order_counters`.
**Services:** Ordering.
**AI implications:** None directly.
**POS implications:** `pos_order_exports.external_ticket_number` (POS audit) is a separate concept from `orders.order_number` — never conflate the two into one field.
**Security implications:** None directly.
**Migration implications:** None — already correctly enforced (`next_order_number()` is a monotonic, atomic counter with no update path found anywhere).
**Priority:** P0.
**Status:** Currently compliant.

### O-2: Orders never disappear
**Rule:** Once created, an `orders` row is never hard-deleted, by any code path, for any reason, including restaurant deletion.
**Why it exists:** An order is a financial and legal record the moment it's created — deleting it destroys evidence a restaurant, a customer, or a regulator may later need.
**What breaks if violated:** Financial reconciliation, dispute resolution, tax records, any AI trained on sales history.
**Tables:** `orders`, `order_items`, `payments`.
**Services:** Ordering, Payments.
**AI implications:** Sales-history and forecasting AI must be able to trust that the historical order set never silently shrinks.
**POS implications:** A `pos_order_exports` failure must never be "resolved" by deleting the SpinBite-side order — only by retry or explicit cancellation (which itself doesn't delete the row, per O-1's logic extended here).
**Security implications:** Order deletion is effectively evidence destruction — should require the highest level of authorization if ever legitimately needed (e.g., GDPR-adjacent deletion of PII-bearing fields only, never the whole row).
**Migration implications:** None needed for new code (no delete path exists in `lib/orders/**`) — but see Violations §1, since restaurant hard-delete currently cascades into this table regardless of what the ordering code itself does.
**Priority:** P0.
**⚠️ CURRENTLY VIOLATED (indirectly, via R-2's violation) — see Violations §1.**

### O-3: Order totals always reconcile with what was actually charged
**Rule:** The sum of an order's line items plus tax, tip, service fee, and minus any discount must always equal the amount actually captured in the corresponding `payments` row — and that reconciliation must be computable from queryable fields, not require parsing an unstructured JSONB blob.
**Why it exists:** This is the single most basic financial-integrity guarantee a commerce platform can make — if totals don't reconcile, nothing built on top of order data (reporting, accounting export, AI revenue analysis) can be trusted.
**What breaks if violated:** Every downstream financial report is silently wrong; accounting integrations (a named future POS-audit extensibility category) would have nothing reliable to export.
**Tables:** `orders.subtotal`, `order_items.line_total`, `payments.amount`, `payments.metadata`.
**Services:** Ordering, Payments.
**AI implications:** Revenue-optimization AI use cases (POS audit §10) require this reconciliation to hold — "increase pasta sales by 20%" is meaningless if sales totals themselves aren't trustworthy.
**POS implications:** POS-side ticket totals must reconcile against SpinBite's own totals at export time — a mismatch should be surfaced, not silently accepted.
**Security implications:** None directly, but financial-discrepancy bugs are effectively silent revenue-integrity bugs.
**Migration implications:** Promote the stable fields currently trapped in `payments.metadata` (`tax_amount`, `tip_amount`, `service_fee_amount`, `discount_amount`) to real typed columns — already recommended in the canonical domain model (§11.6).
**Priority:** P0.
**⚠️ CURRENTLY VIOLATED — see Violations §5.**

### O-4: Orders always belong to exactly one restaurant, and are always attributable to a session or an explicit direct channel
**Rule:** `orders.restaurant_id` is always set (already enforced, NOT NULL); `orders.order_origin` always correctly reflects whether the order came from an active Visit Session (`restaurant_qr`) or not (`direct_link`) — and when it did, the order should reliably carry the identifying `guest_id` of who placed it.
**Why it exists:** Order attribution is the foundation every reporting, kitchen-routing, and identity-linkage feature depends on — an order that's "sort of" attributed to a session (has `visit_session_id` but not `guest_id`) is a broken middle state, not a valid one.
**What breaks if violated:** Kitchen/table routing, the Customer Identity Spine's order-linkage design (§5 of that document), any per-guest reporting.
**Tables:** `orders.restaurant_id`, `orders.visit_session_id`, `orders.guest_id`, `orders.order_origin`.
**Services:** Ordering, Customer Identity & Session Intelligence.
**AI implications:** Per-guest personalization and group/table intelligence both depend on reliable guest attribution.
**POS implications:** Table/check mapping (POS audit §5) needs a reliable identifying guest/touchpoint reference on every session-originated order.
**Security implications:** None directly.
**Migration implications:** Fix the resolve-timing race that currently causes this (Customer Identity Spine §5, §11 Phase 4) — already scoped as a fix, not a new finding here.
**Priority:** P0.
**⚠️ CURRENTLY VIOLATED — see Violations §6 (cross-referenced from the Customer Identity Spine document).**

### O-5: Orders are immutable after payment except through explicit correction events
**Rule:** Once an order's payment succeeds, its line items, prices, and subtotal never change in place — any correction (item removed after the fact, price dispute resolved, partial refund) happens through a new, explicit, auditable event, never an `UPDATE` to the original row's financial fields.
**Why it exists:** This is what makes an order a trustworthy historical record (ties directly to M-4 and O-3) — a mutable "current state" order can't be reconciled against a payment captured against a specific, frozen set of facts.
**What breaks if violated:** A payment captured against $42.00 that later shows as a $38.00 order (silently edited) is an unreconcilable, potentially fraud-adjacent state.
**Tables:** `orders`, `order_items`, future correction/adjustment records (not yet designed — flagged as a gap, not solved here).
**Services:** Ordering, Payments.
**AI implications:** None directly, but any future "AI auto-corrects an order" feature must create a new event, never mutate the original.
**POS implications:** A POS-side order modification (a void/comp applied at the terminal) must flow back as a new event SpinBite records, not a silent overwrite of the original order.
**Security implications:** Protects against a specific fraud pattern (charge one amount, silently record a lower one).
**Migration implications:** `order_items`/`orders`' financial fields are already snapshot-style and not mutated post-creation in current code (verified — no update path found) — but there is no formal "correction event" mechanism yet for the cases that will need one (partial refund, staff comp). This is a genuine future gap, not a current violation.
**Priority:** P1.
**Status:** Currently compliant in practice (nothing mutates financial fields post-creation), but the "explicit correction event" half of this rule has no mechanism built yet — tracked as a gap for whenever partial refunds/comps become a real feature.

### O-6: One Visit Session may produce multiple independent Orders; no implicit merging
**Rule:** Multiple guests at one table each submitting their own order is valid and expected — the platform must never implicitly merge, split, or reassign order ownership between guests sharing a session.
**Why it exists:** This reflects how dining actually works (separate checks, shared table) and avoids inventing a "table tab" concept the product hasn't actually designed.
**What breaks if violated:** An implicit merge would misattribute spend/behavior between guests, corrupting both order history and any per-guest AI personalization.
**Tables:** `orders.visit_session_id`, `orders.guest_id`.
**Services:** Ordering.
**AI implications:** Per-guest LTV/preference tracking (Customer Identity Spine §7) depends on orders staying correctly un-merged.
**POS implications:** If a future bill-splitting feature is built, it must be an explicit, separately-designed feature — not an emergent side effect of how orders currently relate to sessions.
**Security implications:** None directly.
**Migration implications:** None — already correctly the current behavior (verified: no merge/split logic exists anywhere).
**Priority:** P1.
**Status:** Currently compliant.

---

## Customer Identity

*(This category's baseline is `spinbite-customer-identity-spine-v1.md` — rules here restate its constitutional section as platform-binding, not re-derive it.)*

### C-1: Identity resolution only ever becomes stronger, never weaker, for a given person
**Rule:** Once a `session_guest` is linked to a `customer_profiles` row, that link is never silently downgraded back to anonymous — a correction (wrong number entered) must go through an explicit re-link event, not a deletion that returns the guest to an unlinked state with no trace.
**Why it exists:** Silent identity downgrade would erase exactly the cross-visit history (order, coupon, preference) the entire identity spine exists to preserve.
**What breaks if violated:** Churn/LTV calculations silently lose history; a "fixed" wrong phone number looks identical to "never was linked" without an audit trail.
**Tables:** `session_guest_customer_links` (proposed).
**Services:** Customer Identity & Session Intelligence.
**AI implications:** Any AI reading customer history must be able to trust that a link, once established, has a permanent record even if superseded.
**POS implications:** A POS-side customer match correction (Phase 8) must also go through this same superseding mechanism, not a raw delete.
**Security implications:** None directly.
**Migration implications:** `session_guest_customer_links.superseded_at` (already designed in the Identity Spine, §3.4) is the mechanism — apply it consistently.
**Priority:** P1.

### C-2: Anonymous ordering is always supported, permanently, with zero degraded experience
**Rule:** No future feature may require a phone number, name, or any identity claim to browse, order, or pay — anonymous must remain a first-class, fast, fully-featured path forever.
**Why it exists:** This is a hard product constraint stated explicitly by the user across two prior sessions and restated as a constitutional rule in the Identity Spine document (§13, rule 1) — restated here as platform-wide, not identity-project-scoped, because a future unrelated feature (e.g., a loyalty program) could easily violate it by accident if this isn't a standing constraint every team checks against.
**What breaks if violated:** Guest-first QR ordering — the platform's core current product — degrades or breaks; conversion drops; the stated product philosophy is violated.
**Tables:** N/A — this is a behavioral rule, not a schema one.
**Services:** Ordering, Customer Identity, Catalog (any menu-viewing gate would also violate this).
**AI implications:** AI-driven personalization must degrade gracefully to session-only signal (Identity Spine §7) when no identity exists — never force identity capture to "unlock" a feature that currently works anonymously.
**POS implications:** POS-managed payment/order flows (POS audit §9) must not introduce an identity requirement the SpinBite-managed path doesn't have.
**Security implications:** None directly.
**Migration implications:** None — this is a design constraint on all future migrations, not a current-state fix.
**Priority:** P0.
**Status:** Currently compliant — and must actively stay that way as a checked constraint on every future feature, not just an assumption.

### C-3: Phone verification cannot silently merge customers
**Rule:** If a phone-capture event would resolve to an *existing* `customer_profiles` row different from what a session's prior signals suggested, the system must never silently overwrite or merge without an explicit, auditable merge event.
**Why it exists:** Two different real people could plausibly share a device/session in edge cases (a shared family phone, a borrowed device) — an automatic silent merge risks attributing one person's history to another.
**What breaks if violated:** Cross-contaminated order/preference history between two actual different people; a privacy violation, not just a data-quality one.
**Tables:** `customer_profiles`, future `customer_merge_events`.
**Services:** Customer Identity.
**AI implications:** Personalization built on a bad merge actively misleads — worse than personalization built on no data at all.
**POS implications:** POS-import customer matching (Identity Spine §9) must also route ambiguous matches to review, never silent auto-merge — same rule, same reasoning, restated at the POS boundary.
**Security implications:** A privacy-adjacent rule — merging two people's identity without consent/verification is a real harm, not just a bug.
**Migration implications:** `customer_merge_events` (Identity Spine §3.4) is the designed mechanism — every merge, whenever it happens, must write to it.
**Priority:** P0.
**Status:** N/A today (no merge logic exists at all yet) — binding the moment any merge capability is built (Phase 8).

### C-4: Customer merges are always auditable
**Rule:** Every merge of two `customer_profiles` rows is recorded with who/what initiated it, why, and when — and is reversible in principle (the audit trail must contain enough information to undo it, even if the undo tooling isn't built yet).
**Why it exists:** Same reasoning as C-3 — a merge is a high-consequence, low-frequency action that deserves the same rigor as a financial correction event (O-5).
**What breaks if violated:** An incorrect merge with no audit trail is undiscoverable and unfixable.
**Tables:** `customer_merge_events`.
**Services:** Customer Identity.
**AI implications:** None directly.
**POS implications:** POS-driven merges (Phase 8) must populate the same audit table as any other merge source — one mechanism, not a POS-specific one.
**Security implications:** Audit trail requirement, same class as O-5/order corrections.
**Migration implications:** None — not yet built, designed correctly in the Identity Spine.
**Priority:** P1 (binding once merge logic exists; not yet applicable).

### C-5: `customer_profiles` stays global; visibility is restaurant-scoped, never the table itself
**Rule:** Restated verbatim from the Identity Spine's own constitutional rules (§13, rules 3-4) as platform-binding: `customer_profiles` is never partitioned by restaurant; every restaurant-facing read of customer data is filtered server-side by `restaurant_id` at the query layer, with zero exceptions.
**Why it exists:** This is the single most safety-critical rule in the entire identity design — violating it would let one restaurant see another restaurant's customers' cross-restaurant behavior, a serious privacy and competitive-harm exposure.
**What breaks if violated:** Restaurant A sees Restaurant B's customer's order history, phone number, or coupon activity — a privacy breach with real business-harm consequences (competitive intelligence leak).
**Tables:** `customer_profiles`, every table joined through it for reporting.
**Services:** Customer Identity, Restaurant Management (any admin screen), Revenue Intelligence / Analytics.
**AI implications:** Any AI reading customer data for one restaurant's benefit must never have access to that customer's other-restaurant history unless the customer explicitly consented to cross-restaurant AI features (not currently planned).
**POS implications:** A POS connection is inherently restaurant-scoped — POS customer sync must never leak a customer's other-restaurant SpinBite activity into the POS-side record.
**Security implications:** This is the rule — restated here because it's this important, not because it's a new idea.
**Migration implications:** No current admin screen exists yet to violate this (Identity Spine §1.10 confirms no customer admin view exists at all today) — but it must be the first thing tested when Phase 6 (admin customer timeline) ships, per that document's own acceptance criteria.
**Priority:** P0.

### C-6: Consent is channel-scoped and always revocable
**Rule:** Marketing/communication consent is tracked per channel (SMS, email, push, wallet) and can always be set to "revoked," not just "granted" — a consent record that can only move forward is not a consent record.
**Why it exists:** TCPA and similar regimes require honoring opt-out; an irreversible consent flag creates real legal exposure the moment outbound marketing automation exists.
**What breaks if violated:** Continuing to text/email someone who opted out — a compliance violation with statutory penalties in some jurisdictions, not just a bad look.
**Tables:** `customer_consents` (proposed, Identity Spine §3.4), replacing `customer_profiles.marketing_consent`'s current one-way boolean.
**Services:** Customer Identity, future Campaign & Communication Engine.
**AI implications:** Any AI-driven campaign/marketing feature must check current (not historical) consent state before acting — restated from Identity Spine §7 as binding platform-wide.
**POS implications:** None directly.
**Security implications:** Compliance-critical.
**Migration implications:** Build `customer_consents` before any real outbound-communication feature ships — already scoped as Phase 2/9 in the Identity Spine.
**Priority:** P0.
**⚠️ CURRENTLY VIOLATED — see Violations §7.**

---

## Promotions, Rewards, and Campaigns

### PR-1: Coupons have exactly one owner at issuance, and ownership is checked at redemption
**Rule:** Every issued coupon (`coupon_redemptions` row) is anchored to the session/guest context that claimed it; redemption must verify that context matches (or is a legitimate continuation of it — same visit, or the same linked customer across visits), not merely check the coupon's own status/expiry.
**Why it exists:** Without this, any valid unexpired coupon code is redeemable by anyone who obtains it — a direct fraud/abuse vector, and the platform's current biggest concrete security gap in this category.
**What breaks if violated:** Coupon codes become effectively public currency the moment they leak (screenshot, shared link, guessed pattern) — restaurants lose control over their own promotional spend.
**Tables:** `coupon_redemptions`.
**Services:** Promotions & Engagement, Ordering (at redemption/apply time).
**AI implications:** Fraud-detection AI (a plausible future feature) needs this ownership signal to exist as a baseline before it can detect anomalies against it.
**POS implications:** If coupons are ever exported to a POS as native discounts (POS audit §2), the POS-side redemption also needs an equivalent ownership concept, or the fraud surface just moves.
**Security implications:** This is a security rule as much as a business rule — cross-listed deliberately.
**Migration implications:** Add `coupon_redemptions.issuing_session_guest_id` and the soft ownership check in `resolveCouponDiscount()` — already scoped as Identity Spine §6, §11 Phase 5.
**Priority:** P0.
**⚠️ CURRENTLY VIOLATED — see Violations §8.**

### PR-2: Coupons cannot migrate between promotions or restaurants
**Rule:** A `coupon_redemptions` row's `promotion_id`/`restaurant_id` are set at issuance and never change — a coupon issued by Promotion A can never be redeemed as if it belonged to Promotion B, even if both are active at the same restaurant.
**Why it exists:** Coupon value (discount type, amount, expiry) is defined by its originating Reward/Promotion — decoupling the two would make redemption math nondeterministic.
**What breaks if violated:** Reward-mix accounting (which promotion "paid for" which discount) becomes untrustworthy.
**Tables:** `coupon_redemptions`, `promotions`, `promotion_rewards`.
**Services:** Promotions & Engagement.
**AI implications:** Promotion-performance AI depends on this attribution staying fixed.
**POS implications:** None directly.
**Security implications:** None beyond PR-1.
**Migration implications:** None — already correctly enforced (no update path found to these FK fields).
**Priority:** P0.
**Status:** Currently compliant.

### PR-3: Rewards become immutable after issuance
**Rule:** Once a `promotion_rewards` row has been used to issue at least one `coupon_redemptions` row, its `reward_type`/`reward_value` should never change in a way that would retroactively alter the meaning of already-issued coupons.
**Why it exists:** A guest who won "20% off" and hasn't redeemed yet must get exactly that discount, not whatever the reward has since been edited to.
**What breaks if violated:** A guest is shown one discount at win-time and charged a different one at redemption — a trust and potentially legal (advertised-price) issue.
**Tables:** `promotion_rewards`, `coupon_redemptions`.
**Services:** Promotions & Engagement, Ordering.
**AI implications:** None directly.
**POS implications:** None directly.
**Security implications:** None directly — a trust/correctness rule.
**Migration implications:** No enforcement mechanism currently exists (no version/lock on `promotion_rewards` once coupons reference it) — flagged as a gap, not a currently-observed violation, since reward editing after issuance wasn't found in any audited code path this session.
**Priority:** P2.

### PR-4: Campaign attribution never changes after redemption/conversion
**Rule:** (Forward-binding — `campaigns` is currently a dead, unused table.) Once a conversion event is attributed to a specific Campaign, that attribution is permanent — a later-running campaign cannot retroactively claim credit for an earlier conversion.
**Why it exists:** Campaign ROI measurement depends on stable, non-retroactive attribution — this is standard marketing-analytics discipline, stated now so it's not improvised under pressure when Campaign work actually starts.
**What breaks if violated:** Campaign performance reporting becomes gameable/unreliable, undermining exactly the "AI recommends campaigns based on performance" use case this platform is building toward.
**Tables:** Future `campaigns`, `campaign_events` (not yet designed).
**Services:** Future Campaign & Communication Engine.
**AI implications:** Campaign-recommendation AI (POS audit §10, canonical domain model §9) is only as trustworthy as this attribution discipline.
**POS implications:** None directly.
**Security implications:** None directly.
**Migration implications:** N/A — not yet built.
**Priority:** P2 (binding once built; not yet applicable).

### PR-5: Reward exposure/play is always possible anonymously; claiming a reward is where identity may optionally enter
**Rule:** Restated from the platform's own locked decision ("Phone number at claim, not at play") as a binding constitutional rule, not just a product preference — no future promotion/game feature may require identity before a guest can play or see their result.
**Why it exists:** This is the specific mechanism that makes C-2 (anonymous ordering always supported) true for the engagement/gaming side of the platform too — restated here because it's a distinct surface from ordering and worth its own explicit rule.
**What breaks if violated:** Game engagement drops; the core "anonymous-first, progressive enrichment" identity philosophy (Platform Constitution) is violated at its most game-like, highest-engagement touchpoint.
**Tables:** `play_sessions`, `promotions`, `promotion_rewards`.
**Services:** Promotions & Engagement.
**AI implications:** None directly.
**POS implications:** None directly.
**Security implications:** None directly.
**Migration implications:** None.
**Priority:** P0.
**Status:** Currently compliant.

### PR-6: A reward's default configuration must never silently produce a worthless outcome
**Rule:** Every `reward_type` that a Promotion can be configured with must have working checkout-time logic — a reward type that's a valid, selectable, default-eligible value in the schema but produces $0 discount at redemption is a data-integrity bug, not an acceptable gap.
**Why it exists:** A restaurant owner configuring a promotion has every reason to trust that a schema-valid `reward_type` actually works — silent no-op behavior undermines trust in the whole promotions system.
**What breaks if violated:** A guest wins a reward that turns out to be worthless at redemption — a broken promise, visible to the customer, reflecting badly on the restaurant, not just a backend bug.
**Tables:** `promotion_rewards.reward_type`.
**Services:** Promotions & Engagement, Ordering (redemption logic).
**AI implications:** None directly.
**POS implications:** None directly.
**Security implications:** None directly.
**Migration implications:** Either implement `percent_discount` handling in `resolveCouponDiscount()`, or remove it as a selectable/default value until it is implemented.
**Priority:** P1.
**⚠️ CURRENTLY VIOLATED — see Violations §9.**

---

## Payments

### PAY-1: Payment attempts are immutable once captured; corrections are new events
**Rule:** The core facts of a captured payment (`amount`, `transaction_id`, `provider`, timestamp) never change after capture. A refund is a distinct, new financial event with its own amount and timestamp, not a status flip on the original row.
**Why it exists:** A payment record is a financial ledger entry — ledgers don't get edited, they get new entries that reference the old ones. This is standard accounting discipline, not a SpinBite-specific preference.
**What breaks if violated:** Reconciliation against a real PSP/POS statement becomes impossible if SpinBite's own record of "what happened" has been rewritten in place; a partial refund has nowhere to record its own amount if the mechanism is just "flip the original row to `refunded`."
**Tables:** `payments`, future refund/adjustment records.
**Services:** Payments.
**AI implications:** None directly.
**POS implications:** POS-managed payment reconciliation (POS audit §9) needs this discipline to correctly compare SpinBite's ledger against the POS's own.
**Security implications:** Protects against a specific manipulation pattern (quietly reducing a recorded charge after the fact).
**Migration implications:** Introduce a distinct refund-event record (not designed in this document — flagged as a gap for the Payments context to design properly, likely as part of POS audit Phase 5).
**Priority:** P0.
**⚠️ CURRENTLY VIOLATED — see Violations §10.**

### PAY-2: Refunds never modify the original payment's charged amount
**Rule:** Even before a proper refund-event table exists, no code path may decrement `payments.amount` to reflect a partial refund — the original amount charged is permanent; the refunded amount is tracked separately.
**Why it exists:** Same reasoning as PAY-1, isolated as its own rule because "don't touch the amount field" is a simpler, immediately-checkable version of the fuller PAY-1 principle that can be enforced today even before the full refund-event mechanism is built.
**What breaks if violated:** "How much was this customer actually charged" becomes an unanswerable question from the `payments` table alone.
**Tables:** `payments.amount`.
**Services:** Payments.
**AI implications:** None directly.
**POS implications:** None directly.
**Security implications:** Same class as PAY-1.
**Migration implications:** None currently needed — verified no code path mutates `payments.amount` post-capture today.
**Priority:** P0.
**Status:** Currently compliant (narrowly — the `amount` field itself is never touched; the broader PAY-1 violation is about `status` mutation standing in for a proper refund event).

### PAY-3: Payment providers cannot mutate order totals
**Rule:** A payment provider's response (success/fail/amount confirmation) is verified against SpinBite's own server-computed total — never the reverse. A provider is never trusted to tell SpinBite what the order should have cost.
**Why it exists:** This is the correct trust boundary for any external system that handles money — SpinBite computes the truth, the provider executes against it and confirms, it never redefines it.
**What breaks if violated:** A compromised or buggy provider integration could silently undercharge or overcharge by returning a different amount than requested, and SpinBite would have no independent check.
**Tables:** `payments`, `orders`.
**Services:** Payments.
**AI implications:** None directly.
**POS implications:** Directly relevant to POS-managed payment (POS audit §9) — the POS terminal's reported charge amount must be validated against SpinBite's own computed total, not blindly trusted.
**Security implications:** Core financial-integrity boundary.
**Migration implications:** None currently needed — the existing orchestrator already computes the charge amount server-side before calling the provider (verified, `payment-orchestrator.ts`).
**Priority:** P0.
**Status:** Currently compliant.

### PAY-4: A payment's provider is explicit and typed, never inferred
**Rule:** `payments.provider` must always be an explicit, valid value from a known, constrained set — never blank, never freely-typed by anything other than the orchestrator itself.
**Why it exists:** This is the seam the POS audit already flagged (§8) as the one place provider-neutrality discipline could erode under pressure — restated here as a binding rule, not just an observation.
**What breaks if violated:** Ambiguous or unconstrained provider values make it impossible to reliably route refunds, webhooks, or reconciliation logic to the correct provider implementation.
**Tables:** `payments.provider`.
**Services:** Payments.
**AI implications:** None directly.
**POS implications:** Every future POS-managed payment path must register as a distinct, known provider value here — never overload an existing one.
**Security implications:** None directly.
**Migration implications:** Add a CHECK constraint (or equivalent app-layer enum validation) once more than one real provider exists — not urgent while only `mock` is live, but should not be forgotten when `StripeProvider`/POS-managed capture ship.
**Priority:** P2 (P0 once a second real provider exists).

### PAY-5: A payment never exists without a clear path back to a restaurant and (eventually) an order
**Rule:** `payments.restaurant_id` is always set; `payments.order_id` may be temporarily null (pending, during the checkout-before-order-creation window) but must always resolve to a real order once the payment succeeds — a succeeded payment with a permanently null `order_id` is an unreconciled, "lost" charge.
**Why it exists:** Money captured with no corresponding order is exactly the kind of state that becomes a customer complaint and a support/refund nightmare if it isn't caught immediately.
**What breaks if violated:** A guest is charged, the order-creation step fails, and nothing surfaces this as an incident requiring resolution.
**Tables:** `payments.order_id`, `orders`.
**Services:** Payments, Ordering.
**AI implications:** None directly.
**POS implications:** None directly.
**Security implications:** None directly — an operational-integrity rule.
**Migration implications:** The existing orchestrator's compensating-refund-on-order-creation-failure path (verified: `payment-orchestrator.ts:305-312`) already handles this case reasonably — but per PAY-1, the refund itself should be a new event, not a status flip, once that mechanism exists.
**Priority:** P1.
**Status:** Currently compliant in intent (a compensating refund is attempted), imperfect in mechanism (per PAY-1's violation).

---

## AI

### AI-1: AI proposes; business services execute
**Rule:** No AI/decisioning code path writes directly to a canonical business entity (`orders`, `menu_items`, `promotions`, `payments`, `customer_profiles`). AI output is always a proposal, recommendation, or decision *record* — a human action or an explicit, separately-authorized business service performs the actual mutation.
**Why it exists:** This is the load-bearing safety boundary for everything the platform's AI-first mission depends on — without it, "AI-first" becomes "AI has unchecked write access to revenue-critical data," which is a fundamentally different and much riskier platform.
**What breaks if violated:** A misbehaving prompt, a bad model output, or a prompt-injection attack (via any AI feature that reads external/customer-supplied text) could directly corrupt canonical business data with no human or service-layer check in between.
**Tables:** All canonical entities — this rule's whole point is that AI-authored code has no special write path to any of them.
**Services:** Generative Intelligence, Session Intelligence / Decision Runtime — both must call into the *same* business services (Ordering, Catalog, Payments) that any other caller would, never a privileged AI-only write path.
**AI implications:** This is the AI implication — stated as its own rule because it's the most important one in this entire document for the platform's stated long-term direction.
**POS implications:** An AI-driven POS action (e.g., "AI pauses a sold-out item's promotion") must go through the same `MenuSyncProvider`/capability-gated path any admin action would, never a direct write.
**Security implications:** This is a security boundary as much as a business one.
**Migration implications:** None needed today — verified compliant (see Status).
**Priority:** P0.
**Status:** Currently compliant — `live_interventions`/`intervention_events` (Decision Runtime) and `ai_generated_assets`/`image_generation_jobs` (Generative Intelligence) are both AI's own output tables; neither writes to a canonical entity directly. The one nuance worth naming: `app/api/admin/generate-food-image/accept` writes `menu_items.image_url`, but only in direct response to an explicit human click ("use this image") — compliant today because a human is the one executing, but this exact code path is the one to watch closely if any future "auto-apply the best generated image" automation is proposed.

### AI-2: Every AI decision is auditable
**Rule:** Every AI-generated recommendation, decision, or intervention is persisted with its reasoning, confidence, and outcome — never computed and discarded in memory only.
**Why it exists:** An unauditable AI decision can't be reviewed, disputed, improved, or trusted by a restaurant owner — this is both a trust requirement and a debugging necessity.
**Tables:** `live_interventions`, `intervention_events`, `intelligence_generation_logs`.
**Services:** Session Intelligence / Decision Runtime, Generative Intelligence.
**AI implications:** Stated as its own rule for emphasis.
**POS implications:** A future AI action affecting POS sync (e.g., an AI-recommended price change awaiting human approval) must also be logged with the same rigor.
**Security implications:** Audit trail requirement.
**Migration implications:** None needed — already correctly implemented for the live Decision Runtime scope.
**Priority:** P0.
**Status:** Currently compliant.

### AI-3: AI never consumes raw provider-shaped or unverified external payloads directly
**Rule:** Restated from both the POS audit (§10) and canonical domain model (§9, §14 rule 6) as binding here too: AI/decisioning code only ever consumes normalized, canonical SpinBite events and entities — never a raw POS webhook payload, never unverified customer-supplied free text treated as trusted structured input without sanitization.
**Why it exists:** This is both a provider-neutrality rule and a prompt-injection defense — raw external payloads are the most likely vector for either kind of corruption.
**Tables:** N/A — a data-flow rule.
**Services:** Generative Intelligence, Session Intelligence / Decision Runtime.
**AI implications:** Core to this category.
**POS implications:** Directly restates the POS audit's own AI-boundary rule.
**Security implications:** Prompt-injection and provider-shape-leakage defense, combined.
**Migration implications:** None needed today — no POS payloads exist yet to violate this; worth testing explicitly once Phase 6 (webhooks) of the POS roadmap ships.
**Priority:** P0 (binding now for existing customer-text-consuming AI features; becomes testable against real POS payloads once POS webhooks exist).

### AI-4: AI consent boundaries mirror communication consent boundaries
**Rule:** Restated from the Identity Spine (§7) as platform-binding: any AI feature that resolves to a persistent customer identity for personalization must check current consent state first — session-only AI features (which never resolve to a persistent identity) are exempt.
**Why it exists:** A customer who declined marketing consent has expressed a preference about being tracked/profiled, not merely about receiving texts — internal-only personalization should respect the same signal.
**Tables:** `customer_consents` (proposed).
**Services:** Session Intelligence / Decision Runtime (once cross-visit features exist), Generative Intelligence (if ever personalizing generated content per-customer).
**AI implications:** Core to this category.
**POS implications:** None directly.
**Security implications:** Privacy-adjacent.
**Migration implications:** Depends on `customer_consents` existing (Identity Spine Phase 2) — not yet enforceable, since no cross-visit AI personalization feature exists yet either.
**Priority:** P1 (binding the moment cross-visit personalization ships; not yet applicable).

### AI-5: AI cost and usage are always bounded and attributable
**Rule:** Every AI generation call is attributed to a restaurant, logged with cost, and subject to an enforced usage limit — no AI feature calls an external model provider without going through the existing cost/usage-tracking layer.
**Why it exists:** Generative AI has real, variable, per-call cost — an unbounded or unattributed AI feature is a direct, uncapped cost-control risk.
**Tables:** `intelligence_generation_logs`, `intelligence_usage_limits`, `intelligence_provider_costs`.
**Services:** Generative Intelligence.
**AI implications:** Core to this category.
**POS implications:** None directly.
**Security implications:** Cost-control, not security per se, but consequential enough to warrant a P1.
**Migration implications:** None needed — already correctly implemented for the existing image/content generation features.
**Priority:** P1.
**Status:** Currently compliant.

---

## POS

*(This category's baseline is `spinbite-pos-integration-layer-audit-v1.md` — every rule here is that document's design, restated as binding now, before any POS code exists, so it can never be "discovered" as violated after the fact.)*

### POS-1: Provider IDs never leak into business logic
**Rule:** No canonical entity (Order, Item, Customer, Payment) carries a field whose meaning depends on which POS provider is connected. Provider-specific identifiers and payloads live only in `pos_external_mappings` and provider-scoped metadata columns, never as a required column on a canonical table.
**Why it exists:** This is the entire point of the provider-neutral architecture — restated here as the constitutional gate, not just a design preference.
**Tables:** Every canonical table (as a negative constraint); `pos_external_mappings` (as the correct location).
**Services:** POS Integration — must never let this boundary erode under any provider-specific pressure ("just add a `clover_id` column, it's faster").
**AI implications:** AI-3 depends on this holding.
**POS implications:** The rule itself.
**Security implications:** None directly beyond general architectural integrity.
**Migration implications:** Any future migration adding a provider-named column to a canonical table should be treated as a design defect, not approved.
**Priority:** P0 (binding now, pre-emptively).

### POS-2: POS failures never lose a customer order
**Rule:** A POS export failure degrades gracefully (the order stays valid, visible, and fulfillable within SpinBite) — it never causes the order itself to be lost, cancelled, or hidden from staff.
**Why it exists:** A customer who successfully ordered and paid must never discover their order effectively vanished because of an unrelated system's outage.
**Tables:** `orders`, `pos_order_exports`.
**Services:** Ordering, POS Integration.
**AI implications:** None directly.
**POS implications:** The rule itself — restates POS audit §8's core recommendation (SpinBite creates the order locally first, exports asynchronously) as binding.
**Security implications:** None directly.
**Migration implications:** None yet — not yet built.
**Priority:** P0 (binding now, pre-emptively).

### POS-3: External synchronization is always idempotent
**Rule:** Every sync operation (webhook delivery, polling reconciliation, order export) can be safely retried or duplicated without producing a duplicate effect.
**Why it exists:** Distributed systems retry; a sync layer that isn't idempotent will eventually double-charge, double-export, or double-count something.
**Tables:** `pos_webhook_events` (dedup key), `pos_sync_jobs`, `pos_order_exports`.
**Services:** POS Integration.
**AI implications:** None directly.
**POS implications:** The rule itself — restates POS audit §6.5.
**Security implications:** Replay-protection adjacent (also covered under Security).
**Migration implications:** None yet — not yet built; the design already accounts for this (unique `(provider, external_event_id)`).
**Priority:** P0 (binding now, pre-emptively).

### POS-4: Price and tax ownership flips completely on connect — never partially, never merged
**Rule:** Restated from M-2, POS-specific: the moment a restaurant connects a POS in price-owning mode, SpinBite stops being an independent source of truth for that restaurant's prices/tax — not "mostly," not "except for manual overrides," completely.
**Why it exists:** A partial flip (POS owns price except when an owner manually overrides it in SpinBite) reintroduces exactly the two-simultaneous-authorities risk M-2 exists to prevent.
**Tables:** `menu_items.price`, `restaurant_settings` (tax).
**Services:** Catalog, POS Integration.
**AI implications:** None directly.
**POS implications:** The rule itself.
**Security implications:** None directly.
**Migration implications:** None yet — not yet built.
**Priority:** P0 (binding now, pre-emptively).

### POS-5: A disconnected or switched POS never corrupts canonical identity
**Rule:** Restated from the Identity Spine §9: switching from one POS provider to another (or disconnecting entirely) never touches `customer_profiles`, `orders`, `promotions`, or any other canonical entity's actual identity or history — only the mapping layer changes.
**Why it exists:** This is the direct payoff of every other ownership rule in this document — a POS is genuinely swappable underneath SpinBite's permanent business model, which is the platform's entire stated long-term thesis.
**Tables:** `pos_connections`, `pos_external_mappings` (the only tables that should ever reflect a POS switch).
**Services:** POS Integration.
**AI implications:** None directly.
**POS implications:** The rule itself.
**Security implications:** None directly.
**Migration implications:** None yet — not yet built.
**Priority:** P0 (binding now, pre-emptively).

---

## Sessions

### S-1: Behavior events are append-only
**Rule:** `session_events` rows are never updated or deleted after insert — the only valid operation is INSERT.
**Why it exists:** This is what makes the behavioral event stream a trustworthy input to Session Intelligence and Decision Runtime — a mutable event log could be tampered with or accidentally corrupted by a "helpful" cleanup script.
**Tables:** `session_events`.
**Services:** Session Intelligence & Decision Runtime.
**AI implications:** Core dependency for AI-3 (trustworthy input).
**POS implications:** None directly.
**Security implications:** Audit-trail integrity.
**Migration implications:** None — already correctly enforced by convention (no update/delete path found anywhere in the codebase).
**Priority:** P0.
**Status:** Currently compliant.

### S-2: A Visit Session is immutable after closure, except for its own closure metadata
**Rule:** Once `visit_sessions.status` transitions to `completed`/`abandoned`, no new orders, guests, or events may attach to it — the session's own `ended_at`/`ended_by` fields are the only fields that may still be set at closure time.
**Why it exists:** A session that can "reopen" or silently accumulate activity after closure undermines every downstream aggregate (`orders_count`, `total_spend`) and the entire Session Intelligence model's temporal boundaries.
**Tables:** `visit_sessions`, `session_guests`, `session_events`, `orders`.
**Services:** Customer Identity & Session Intelligence, Ordering.
**AI implications:** Decision Runtime's session-scoped reasoning depends on this boundary being real.
**POS implications:** None directly.
**Security implications:** None directly.
**Migration implications:** None — already correctly enforced for orders (`resolveActiveSessionId` rejects attachment to a closed session with `409 SESSION_INVALID`); worth confirming the same discipline holds for any future write path added to `session_events`/`session_guests`.
**Priority:** P0.
**Status:** Currently compliant, with a narrow theoretical race (an order submitted in the exact window a session is closing) noted as a P2 hardening item, not a confirmed violation.

### S-3: Guest attribution is set once per record, never silently rewritten
**Rule:** A `session_events`/`orders` row's `guest_id`, once set, is never changed to a different guest after the fact — a missing `guest_id` may be *added* later through an explicit, auditable backfill (per the Identity Spine's migration plan), but an already-set `guest_id` is never reassigned.
**Why it exists:** Silent reattribution would corrupt exactly the per-guest behavioral/order history the identity spine and session intelligence both depend on.
**Tables:** `session_events.guest_id`, `orders.guest_id`.
**Services:** Ordering, Customer Identity & Session Intelligence.
**AI implications:** Per-guest personalization depends on this staying stable.
**POS implications:** None directly.
**Security implications:** None directly.
**Migration implications:** The one-time historical backfill for orders with a single-guest session (Identity Spine §10) is an explicit, allowed exception to "never set after the fact" — but only because it's filling a *null*, never overwriting an existing value; this distinction should be preserved in the actual backfill script's `WHERE guest_id IS NULL` condition.
**Priority:** P1.

### S-4: Session-level counters are derived, never the primary record
**Rule:** `visit_sessions.orders_count`/`total_spend`/`guest_count` etc. are denormalized conveniences, always re-derivable from the actual `orders`/`session_guests` rows — never treated as the authoritative record if they ever drift.
**Why it exists:** Denormalized counters can drift (a known risk class, already the subject of a real past incident in this codebase — the guest-count ratchet bug documented in the Session Architecture memory). This rule exists to make sure any future feature reading these counters knows they're a cache, not a source of truth.
**Tables:** `visit_sessions` (counter columns), derived from `orders`, `session_guests`.
**Services:** Customer Identity & Session Intelligence.
**AI implications:** AI features should prefer the underlying tables over the cached counters where precision matters, per the same reasoning that already fixed the guest-count bug.
**POS implications:** None directly.
**Security implications:** None directly.
**Migration implications:** None — already correctly the current design intent (the counters are updated via RPC increments, not treated as canonical elsewhere) — restated as a rule specifically because the platform has already been burned by trusting a cached count over the derived one once.
**Priority:** P1.

### S-5: A Play Session and a Visit Session are distinct concepts and must never be conflated in code or schema
**Rule:** Restated from the canonical domain model's ubiquitous-language findings as a binding rule: no future code may treat `play_sessions` as if it were a dining visit, or `visit_sessions` as if it were a single game attempt — including in variable naming, API payload shapes, and admin UI copy.
**Why it exists:** This exact conflation is what caused the Customer Identity Spine's core finding (`play_sessions.customer_profile_id` is the only identity link, but it only fires for game-players, not diners) — the naming/conceptual confusion isn't just cosmetic, it's the root cause of a real architectural gap.
**Tables:** `play_sessions`, `visit_sessions`.
**Services:** Promotions & Engagement, Customer Identity & Session Intelligence.
**AI implications:** None directly.
**POS implications:** None directly.
**Security implications:** None directly.
**Migration implications:** None — a discipline rule for code review, not a schema change.
**Priority:** P1.

---

## Security

### SEC-1: Tenant boundaries are absolute
**Rule:** No query, RLS policy, or API route may return data from `restaurant_id` A to a caller authenticated only for `restaurant_id` B. No exceptions for "it's just metadata" or "it's unguessable anyway."
**Why it exists:** This is the foundational multi-tenancy guarantee every restaurant owner implicitly trusts the platform to keep — restated as absolute because "unguessable UUID" reasoning has already been used (incorrectly, per the violations below) to justify a weaker version of this rule elsewhere in the codebase.
**Tables:** Every table with a `restaurant_id`.
**Services:** All.
**AI implications:** AI features must never be the mechanism that bypasses this boundary (e.g., an AI feature with overly broad service-role access used carelessly).
**POS implications:** POS_connections/mappings must be as strictly tenant-scoped as everything else.
**Security implications:** The rule itself.
**Migration implications:** Every RLS policy should be reviewed against this rule specifically, not just "does a policy exist."
**Priority:** P0.
**⚠️ CURRENTLY VIOLATED — see Violations §11, §12.**

### SEC-2: Coupons require ownership validation, restated as a security rule
**Rule:** Identical to PR-1, cross-listed here because it is as much a security invariant (fraud/abuse prevention) as a business one.
**Priority:** P0.
**⚠️ CURRENTLY VIOLATED — see Violations §8.**

### SEC-3: Marketing communication requires revocable, channel-scoped consent
**Rule:** Identical to C-6, cross-listed here because failing this rule is a compliance/legal exposure, not just a data-modeling gap.
**Priority:** P0.
**⚠️ CURRENTLY VIOLATED — see Violations §7.**

### SEC-4: Every mutation is attributable to a specific actor
**Rule:** Every write to a canonical business entity — by a human (owner, staff, super-admin), a service (order pipeline, payment orchestrator), or AI (decision runtime) — is traceable to which of those it was, not just that "something" changed the row.
**Why it exists:** Without this, a disputed change (a price edit, an order status flip, a coupon redemption) has no way to answer "who/what did this," which is both a debugging necessity and, once real money and multiple staff logins exist, a fraud-investigation necessity.
**Tables:** All — this is why an event-history mechanism (order-status transitions currently console.log-only, per the POS/Order-Operations audits) matters as much as it does.
**Services:** All.
**AI implications:** AI-2 is this rule applied specifically to AI actors.
**POS implications:** A POS-driven mutation (order status update via webhook) must be attributed to "POS sync," distinguishable from a staff-driven one.
**Security implications:** The rule itself.
**Migration implications:** Build the persisted `order_events`/general audit-trail mechanism already recommended by three independent prior documents (POS audit, Order Operations audit, Canonical Domain Model) — restated here as a security rule, not just an operational nicety.
**Priority:** P0.
**⚠️ CURRENTLY VIOLATED — see Violations §13.**

### SEC-5: Destructive operations require explicit, minimal-privilege authorization — never broad EXECUTE grants "just in case"
**Rule:** Any function capable of deleting data (hard or soft) is granted EXECUTE only to the roles that legitimately need it — never to `anon` by default, even if an internal check would currently prevent misuse. Least privilege is enforced at the grant level, not solely relied upon at the application-logic level.
**Why it exists:** Defense in depth — an internal ownership check inside a function is one layer; an unnecessary grant to `anon` is an avoidable second attack surface that provides no legitimate value and should simply not exist.
**Tables:** N/A — a database-role/grant rule.
**Services:** All.
**AI implications:** None directly.
**POS implications:** None directly.
**Security implications:** The rule itself.
**Migration implications:** Audit every `SECURITY DEFINER` function's grants against who actually needs to call it (already partially surfaced by the Supabase advisor's `anon_security_definer_function_executable` warnings — 17 functions flagged, most of which have no legitimate reason for `anon` access).
**Priority:** P1.
**⚠️ CURRENTLY VIOLATED — see Violations §14.**

### SEC-6: A soft-delete convention, once established for a table, must be the only delete path for that table
**Rule:** If a table has a `deleted_at` column and code elsewhere reads/filters on it, there must not be a second, competing hard-delete code path for the same table left live alongside it.
**Why it exists:** Two competing deletion mechanisms — one safe, one destructive — is worse than having only the destructive one, because it creates false confidence that "the platform does soft-delete" when a live, clickable path to permanent data loss still exists.
**Tables:** `restaurants` (the confirmed live instance of this violation).
**Services:** Restaurant Management.
**AI implications:** None directly.
**POS implications:** None directly.
**Security implications:** The rule itself — a live, one-click, irreversible data-destruction path is a severe finding regardless of whether it requires "attacker" behavior to trigger (a confused or careless legitimate owner is enough).
**Migration implications:** Rewire the restaurant delete button to set `deleted_at`; remove or heavily gate `delete_restaurant_cascade`.
**Priority:** P0.
**⚠️ CURRENTLY VIOLATED — see Violations §1 (this is the same finding as R-2/O-2, cross-listed here as the general pattern).**

---

## Violations Found in Production (verified this session)

Ordered by severity, not by category — this is the punch list.

### §1 — CRITICAL — Restaurant "Delete" button performs an irreversible hard delete that cascades into order and payment history
**Current implementation**: `app/admin/restaurants/[restaurantId]/page.tsx:113-126` — the restaurant workspace's "Delete" action calls `.rpc('delete_restaurant_cascade', {target_restaurant_id})`. That function (verified via `pg_get_functiondef` this session) does have a correct ownership check (`owner_id = auth.uid()`), but then performs genuine `DELETE FROM` statements against `rewards`, `promotions`, `menu_items`, `menus`, and finally `restaurants` itself. Because `orders.restaurant_id` and `payments.restaurant_id` both carry `ON DELETE CASCADE` to `restaurants` (confirmed in the POS/Order audits this session), deleting the `restaurants` row **automatically cascade-deletes every order and payment that restaurant ever produced** — even though neither table is named anywhere in the function body. Meanwhile, `restaurants.deleted_at` already exists (added `20260606000000_restaurant_experience_foundation.sql`) and multiple read paths already filter on it (`app/admin/restaurants/page.tsx`, `RestaurantOverviewTab.tsx`, `RestaurantMenusTab.tsx`) — but **no code path anywhere sets it**. The soft-delete convention is half-built: the read side exists, the write side was never migrated off the old hard-delete RPC.
**Why it violates the invariant**: Directly violates R-2 (restaurant deletion is never hard delete), O-2 (orders never disappear), and SEC-6 (competing deletion mechanisms for the same table).
**Recommended correction**: Rewire the delete button to `UPDATE restaurants SET deleted_at = now() WHERE id = ... AND owner_id = auth.uid()`. Retire `delete_restaurant_cascade` entirely (or repurpose it, heavily gated, as a genuinely-intentional super-admin-only permanent-purge tool for GDPR-style deletion requests — a different, much narrower use case than "restaurant owner clicks delete").
**Severity**: Critical.
**Production impact**: Any restaurant owner clicking "Delete" today permanently and silently destroys their restaurant's entire order and payment history, with no recovery path. This is live, one click away, and has almost certainly already been exercised by at least the test/demo restaurants visible in the live row counts this session.

### §2 — CRITICAL — Coupon redemption has no ownership check
**Current implementation**: `lib/orders/apply-coupon-discount.ts`'s `resolveCouponDiscount()` validates status/expiry/promotion/reward match only — never checks the redeeming guest/session against the issuing one. `coupon_redemptions.customer_session_id` is a client-generated, unverifiable random UUID with no server-side trust value.
**Why it violates the invariant**: Directly violates PR-1/SEC-2.
**Recommended correction**: Per the Customer Identity Spine §6/§11 Phase 5 — add `coupon_redemptions.issuing_session_guest_id`, check it (soft, staff-overridable) at redemption time.
**Severity**: Critical.
**Production impact**: Any valid, unexpired coupon code at a restaurant (141 issued live, 4 redeemed) is currently redeemable by anyone who obtains the code, regardless of who it was actually issued to.

### §3 — HIGH — `restaurants` table has two public-read RLS policies, one with no source anywhere in the repository
**Current implementation**: `"public read restaurants"` (traced to the untracked `supabase/schema.sql:53`) and `"allow select restaurants"` (exists live in the database with **no corresponding file anywhere**, tracked or untracked) — both grant `SELECT ... TO public USING (true)`. A 2026-06-09 hardening migration added a properly owner-scoped third policy but never dropped either of the open ones.
**Why it violates the invariant**: Directly violates SEC-1.
**Recommended correction**: Drop both open policies after confirming no legitimate public read path depends on unconditional access (public restaurant pages should resolve via slug through the service-role client, not anon RLS).
**Severity**: High.
**Production impact**: Any caller with the public anon key can currently `SELECT * FROM restaurants` and retrieve every restaurant's `contact_email`, `phone`, `address_line1`, `owner_name`, etc., across all restaurants on the platform, unauthenticated.

### §4 — HIGH — `orders`/`order_items` have unconditional anonymous read access
**Current implementation**: `orders_public_track`/`order_items_public_track` (`20260621010000_ordering_hardening.sql`) grant `anon SELECT USING (true)` — not scoped by order ID, despite the migration's own comment claiming an "unguessable UUID" access model.
**Why it violates the invariant**: Directly violates SEC-1.
**Recommended correction**: Replace with a signed-token or ID-scoped policy, per the migration's own acknowledged (but never actioned) TODO.
**Severity**: High.
**Production impact**: All 83 orders and 105 order items across every restaurant are currently readable by any anonymous caller, not just someone holding a specific order's tracking link.

### §5 — MEDIUM — Order totals don't reconcile from queryable fields
**Current implementation**: Tax, tip, service fee, and discount amounts are computed correctly but stored only inside `payments.metadata` JSONB — `orders.subtotal` alone never equals what was actually charged (`payments.amount`).
**Why it violates the invariant**: Directly violates O-3.
**Recommended correction**: Promote `tax_amount`/`tip_amount`/`service_fee_amount`/`discount_amount` to typed columns on `payments` (already recommended in the canonical domain model §11.6).
**Severity**: Medium.
**Production impact**: No current reporting feature is known to be silently wrong yet (little real reporting exists), but any new reporting/accounting-export feature built against `orders.subtotal` alone today would be wrong from day one.

### §6 — HIGH — 73% of session-linked orders have no `guest_id`
**Current implementation**: A resolve-timing race in `TouchpointMenuPage.tsx` (guest ID state starts null, resolves async) means orders submitted before resolution completes carry `visit_session_id` but no `guest_id` — confirmed live: 49 of 67 session-linked orders (73%).
**Why it violates the invariant**: Directly violates O-4.
**Recommended correction**: Per the Customer Identity Spine §5/§11 Phase 4 — block or retry order submission until guest resolution completes; backfill the safe single-guest-session historical cases.
**Severity**: High.
**Production impact**: Per-guest order attribution, a foundational input to both kitchen routing and any personalization feature, is currently unreliable for the large majority of QR-session orders.

### §7 — HIGH — Marketing consent cannot be revoked
**Current implementation**: `app/api/public/customer-identity/route.ts` only ever moves `marketing_consent` from `false` to `true` (`if (marketing_consent && !existing.marketing_consent)`) — no code path anywhere sets it back to `false`.
**Why it violates the invariant**: Directly violates C-6/SEC-3.
**Recommended correction**: Build `customer_consents` as an append-only, channel-scoped log (Identity Spine §3.4, Phase 2) — replace the boolean's role with "most recent row per channel."
**Severity**: High (compliance-adjacent, not yet triggered since no real SMS/email campaigns exist yet — but must be fixed before any do).
**Production impact**: None yet in practice (only 1 live `customer_profiles` row, no outbound campaigns exist), but this is a ship-blocker for the Campaign & Communication Engine, not a someday-nice-to-fix.

### §8 — MEDIUM — `coupon_redemptions` has RLS enabled with zero policies, breaking the staff redemption screen
**Current implementation**: `coupon_redemptions` has RLS enabled but no policies at all; `/admin/validate` queries it via the browser (RLS-subject) client, not a service-role route — every legitimate staff lookup/redemption currently returns "not found."
**Why it violates the invariant**: A functional bug caused by an incomplete RLS setup, not itself a tenant-isolation violation (default-deny is directionally correct) — but breaks a real staff workflow.
**Recommended correction**: Route `/admin/validate` through a service-role API endpoint, consistent with every other staff-facing mutation in the codebase.
**Severity**: Medium (broken feature, not an exposure).
**Production impact**: Staff cannot currently perform manual coupon validation/redemption through the intended UI at all.

### §9 — MEDIUM — `promotion_rewards.reward_type` default silently produces a $0 discount
**Current implementation**: The column defaults to `'percent_discount'`, but `resolveCouponDiscount()` only implements `'free'`/`'discount'` — any reward left at its schema default silently zeroes out at checkout.
**Why it violates the invariant**: Directly violates PR-6.
**Recommended correction**: Implement `percent_discount` handling, or change the default/remove it as a selectable option until implemented.
**Severity**: Medium.
**Production impact**: Any promotion configured with the schema-default reward type currently issues coupons that redeem for nothing, with no error surfaced to the restaurant owner or the guest.

### §10 — MEDIUM — Refunds mutate the original payment's status rather than creating a new event
**Current implementation**: `lib/payments/payment-orchestrator.ts:305-312` — on order-creation failure after a successful mock charge, the orchestrator calls the provider's refund and marks the *same* `payments` row `'refunded'`, with no separate refund-event record carrying its own amount/timestamp.
**Why it violates the invariant**: Directly violates PAY-1.
**Recommended correction**: Introduce a distinct refund-event table/record; treat the original payment row's core facts as permanently frozen once captured.
**Severity**: Medium.
**Production impact**: Low today (only full, immediate compensating refunds occur, not partial ones), but this mechanism will not scale to real partial-refund/dispute scenarios once real payment processing exists.

### §11 — LOW — `guest_sessions` (dead table) has fully open RLS
**Current implementation**: `WITH CHECK (true)` for INSERT/UPDATE, `{anon, authenticated}` — flagged independently by the Supabase security advisor.
**Why it violates the invariant**: Technically violates SEC-1, though the table is confirmed dead (0 code references) so the practical exposure is minimal.
**Recommended correction**: Drop the table and its policies.
**Severity**: Low.
**Production impact**: Minimal — no code path reads or depends on this table, so the open policy is unused attack surface rather than an active exposure.

### §12 — LOW — Several `SECURITY DEFINER` functions are executable by `anon` with no legitimate reason to be
**Current implementation**: 17 functions flagged by the Supabase advisor as `anon`-executable, including `is_super_admin()`, `delete_restaurant_cascade`, `delete_promotion_cascade`, and several session/promotion RPCs. Most have internal checks that prevent misuse (verified for the two delete functions this session), but the `anon` grant itself provides no legitimate value and is unnecessary attack surface.
**Why it violates the invariant**: Directly violates SEC-5.
**Recommended correction**: `REVOKE EXECUTE ... FROM anon` on every function in this list that has no legitimate anonymous caller — a mechanical, low-risk cleanup pass.
**Severity**: Low (defense-in-depth hygiene, not an active exploit path given the internal checks verified this session).
**Production impact**: None currently demonstrated, but represents avoidable, unreviewed surface area.

### §13 — LOW/STRUCTURAL — No persisted audit trail for order status transitions or AI/POS-driven mutations
**Current implementation**: `app/api/admin/orders/[orderId]/status/route.ts` logs transitions via `console.log` only — no `order_events` table exists (already flagged independently by the POS audit and Order Operations audit).
**Why it violates the invariant**: Directly violates SEC-4.
**Recommended correction**: Build the persisted event-history table already recommended by three prior documents — treat this document's SEC-4 as the fourth, and hopefully final, restatement before it's actually built.
**Severity**: Low today (no dispute has yet required this trail), structurally important before real POS/AI-driven mutations exist.
**Production impact**: Currently unrecoverable audit trail beyond log retention — no incident has yet required reconstructing it, but the gap is real.

### §14 — INFORMATIONAL — Two documented, currently-compliant strengths worth explicit protection
Not violations — named here because a rulebook that only lists failures invites the false impression that nothing works. Both should be treated as regression-risk-sensitive, not just "already fine":
- **AI-1 (AI proposes, business services execute)** is fully compliant today — the Decision Runtime and Generative Intelligence systems write only to their own output tables, never directly to a canonical entity.
- **O-1/M-4 (order numbers immutable; archived items remain historically valid)** are both fully compliant today via the snapshot-model design already in `order_items` — this is the platform's single strongest existing invariant and should be the reference pattern for any future entity that needs the same guarantee (e.g., a future Modifier's price-at-order-time).

---

## Priority Summary

| Priority | Count | Meaning |
|---|---|---|
| P0 | 29 rules | Must gate any PR touching the affected area; violations are Critical/High findings above |
| P1 | 13 rules | Fix before broader rollout of the affected feature |
| P2 | 6 rules | Important, address opportunistically |

**Rule of thumb for future PR review**: if a change touches a table or service named in a P0 rule's "Tables"/"Services" fields, the PR description should explicitly state which invariants were checked, not just what the feature does.

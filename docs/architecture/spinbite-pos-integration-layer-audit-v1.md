# SpinBite POS Integration Layer — Audit v1

**Status:** Audit / design document. **Nothing in this document has been implemented.** No schema changes, no code, no branches.
**Date:** 2026-07-08
**Scope:** Full codebase + live-database audit (Supabase project `viaoholpnysccaijfpox`) of every domain a POS integration would touch, followed by a provider-neutral target architecture for a future POS Integration Layer (Clover first, then Square, Toast, Lightspeed, Revel, SpotOn, Oracle MICROS, others).
**Verification method:** Live schema pulled via Supabase MCP (`list_tables` verbose, `get_advisors`, `pg_policies`), cross-checked against `supabase/migrations/*.sql` (58 tracked files) and actual application code (`app/`, `lib/`, `components/`, `engine/`). Where a claim could only be confirmed in documentation and not in code or the live database, it is explicitly flagged as **doc-only**.
**Relationship to other docs:** Builds on and does not duplicate `/docs/architecture/spinbite-platform-architecture-v4.md` (v4.4) and `/docs/architecture/spinbite-order-operations-engine-v1.md` (KDS/kitchen-operations audit, 2026-07-08, uncommitted). Both are read-only inputs here.

---

## 0. Executive Summary

SpinBite today is a **single-tenant-per-restaurant, SpinBite-is-the-only-writer** platform. Every table in the schema — menus, items, orders, payments, touchpoints, customers — is designed with the unstated assumption that SpinBite is the permanent system of record. There is **no `external_id`, `pos_id`, `source`, or `synced_at` column anywhere in the live schema** (39 tables, confirmed by full-schema dump). This is not a partial gap to patch — it is the correct starting point for a from-scratch design, because nothing has to be un-coupled from a nonexistent POS assumption. But it means a POS Integration Layer is **100% new construction**, not a refactor.

Three things make this audit's timing good rather than premature:

1. **A directly reusable architectural precedent already exists and is proven in production**: `lib/payments/providers/payment-provider.interface.ts` — a provider-neutral interface (`createCheckout / authorizePayment / capturePayment / refundPayment / verifyWebhook`) that `lib/payments/payment-orchestrator.ts` calls without ever branching on which provider is active. The same discipline, generalized, is the right shape for `POSProvider`.
2. **The order/payment pipeline already has real, working idempotency** (DB-enforced unique keys at both the order and payment layer, race-safe on concurrent retries) — a genuine strength most platforms don't have this early, and the POS layer must preserve it rather than reinvent it.
3. **The catalog domain just finished a real architectural migration** (Menu Library v1, 2026-07-03: owner-scoped menus, many-to-many `restaurant_menu_assignments`) that already solved multi-location menu sharing — a POS layer building on top of this doesn't need to solve that problem too.

Against that, four **critical blockers** must be fixed before *any* POS code is written, not as part of the POS project but as prerequisite hygiene (Phase 0, §12):

- **No modifier/option data model exists anywhere** — zero tables, zero code, confirmed by repo-wide grep. Every mainstream POS (Clover, Square, Toast) has first-class modifier groups/options with price deltas. This is the single largest catalog gap and blocks any real menu-parity sync.
- **`orders.touchpoint_id` does not exist**, despite `spinbite-platform-architecture-v4.md` §5.4 asserting it as "authoritative." Order location today is either a free-text snapshot (`table_identifier`) or reachable only by joining through `visit_sessions` — and **direct-link orders (no QR session) have zero structured location at all.** A POS order/table mapping cannot be built on top of this as-is.
- **Two live, unremediated public-read RLS policies expose the entire `restaurants` table** (all 12 restaurants' contact info, addresses, business data) to any anonymous caller — one of them (`"allow select restaurants"`) exists **only in the live database with no source file anywhere**, tracked or untracked — the same drift pattern that caused the `play_sessions` and `supabase_realtime` incidents flagged in prior audits. `orders`/`order_items` have an equivalent unconditional anon-read policy. A POS layer will add more sensitive fields to these same tables (external tokens' *adjacent* data, order totals at scale) — fix this first.
- **No staff/role model exists** — every authorization check in the order/payment/admin path is `restaurants.owner_id === auth.uid()`. A POS connection is inherently a location-level credential that multiple staff need to act under; there is no primitive to scope that today.

The recommended target architecture (§4–§9) is a provider-neutral **POS Integration Kernel**: a capability registry, a set of narrow provider interfaces (menu/order/payment/inventory/customer/webhook), and a sync/mapping layer (`pos_connections`, `pos_external_mappings`, `pos_sync_jobs`, `pos_webhook_events`) that sits *beside* the existing domain tables rather than inside them. Ownership classification (§2) keeps SpinBite as the permanent system of record for its actual strategic assets — customer identity, promotions/coupons, session intelligence, AI decisioning — while treating catalog, price, tax, and payment capture as **POS-owned once connected, SpinBite-cached before that**. Clover should be the first *connector*, not the architecture; every interface in §4 is written with zero Clover-specific nouns.

**Do not build yet.** This document is an audit and a design proposal. Section 12 sequences the work; nothing before Phase 1 should touch product code, and Phase 0 is entirely risk cleanup on the *existing* platform, independent of whether POS work ever starts.

---

## 1. Current-State Findings

### 1.1 Live schema inventory (39 tables, `public` schema, verified via `list_tables`)

Catalog/admin: `restaurants`, `menus`, `menu_categories`, `menu_items`, `restaurant_menu_assignments`, `restaurant_touchpoints`, `restaurant_capabilities`, `restaurant_settings`, `restaurant_order_counters`
Order/payment: `orders`, `order_items`, `payments`
Session/identity: `visit_sessions`, `session_guests`, `session_events`, `customer_profiles`, `play_sessions`, `guest_sessions` (dead)
Promotions/engagement: `promotions`, `promotion_rewards`, `promotion_game_assignments`, `coupon_redemptions`, `rewards` (dead, 0 rows), `campaigns` (dead, 0 rows), `games`
Intelligence/AI: `intelligence_features`, `intelligence_prompt_templates`, `intelligence_provider_costs`, `intelligence_usage_limits`, `restaurant_intelligence_profile`, `intelligence_experiments`, `intelligence_generation_logs`, `intelligence_audit_log`, `image_generation_jobs`, `ai_generated_assets`, `live_interventions`, `intervention_events`
Content/marketing: `site_content`, `site_media`, `faqs`
Auth: `profiles`

**No table with any of these names exists**: `pos_connections`, `pos_locations`, `pos_external_mappings`, `pos_sync_jobs`, `pos_webhook_events`, `pos_capabilities`, `order_events`, `restaurant_staff`, `modifiers`, `modifier_groups`, `modifier_options`, `tax_rates`, `organizations`/`brands`. This is a genuinely blank slate — confirmed, not assumed.

### 1.2 Catalog domain (restaurants → menus → categories → items)

- **`restaurants`** (34 columns, 12 rows) carries a **`pos_system text`** column — added via an untracked legacy file (`supabase/add_restaurant_profile_fields.sql:14`, not in `supabase/migrations/`), never read or written by any application code. It is a vestigial onboarding question ("what POS do you use?"), not an integration point. **Do not build on top of this column** — it has no constraint, no code path, and predates the tracked migration system.
- **Menu Library v1** (`supabase/migrations/20260703000000_menu_library_v1.sql`, merged 2026-07-03) is real and matches its own documentation exactly, verified column-by-column: `menus` is owner-scoped (`owner_id → auth.users`, not restaurant-scoped), `menu_categories` (the renamed original `menus` table) is rescoped to `menu_id`, `menu_items.category_id` + `menu_items.restaurant_id` (kept for authoring), and `restaurant_menu_assignments` is a genuine many-to-many join with `active_start_time/active_end_time/active_days` columns explicitly reserved (nullable, unused) for future time-based menu switching.
- **`menus.version integer`** exists but is inert — nothing increments it, nothing reads it for conflict resolution. It is a placeholder, not a real versioning system, and must not be assumed to provide optimistic-concurrency protection.
- **No modifier/option model exists at all.** Repo-wide grep for "modifier" across every `.ts`/`.tsx`/`.sql` file returns zero matches. The only adjacent field is `order_items.special_instructions text` — one unstructured free-text field with no price delta, no structure, no linkage to the catalog.
- **Price** is `menu_items.price numeric` — decimal major-currency-unit convention (`24.99`), not integer minor units (cents). This convention is consistent platform-wide (`order_items.price_snapshot`, `orders.subtotal`, `payments.amount` all follow it) — differs from Stripe's and most POS APIs' minor-unit convention and needs explicit conversion at any integration boundary.
- **Tax** has no dedicated table or per-item/category field. It is a single flat percentage stored as a key/value row in `restaurant_settings` (`key='tax_rate_percent'`), computed at checkout time in `lib/payments/payment-orchestrator.ts:190-194`, and has **no admin UI anywhere** to set it — it can currently only be changed by a direct database write. `DEFAULT_TAX_RATE_PERCENT = 0` (`lib/payments/pricing-defaults.ts`).
- **Touchpoints** (`restaurant_touchpoints`, `supabase/migrations/20260623000000_touchpoint_management_v1.sql`) are a deliberately generalized concept (`type CHECK IN ('table','patio','counter','pickup')`, migration header comment explicitly frames this as extensible), soft-deletable, no `external_id`.
- **Admin workspace** (`app/admin/restaurants/[restaurantId]/page.tsx`) has exactly 8 tabs — Overview, Branding, Menus, Promotions, Tables, QR Codes, Payments, Settings — no Integrations/POS tab exists.

### 1.3 Order / cart / payment pipeline

- **Cart is entirely client-side** (`hooks/useCart.ts`, `sessionStorage`-persisted) — no server-side cart table exists. The order row, created at submission time, is the first durable record.
- **`orders`** (`supabase/migrations/20260621000000_ordering_engine_v1.sql`, 83 live rows): real columns include `order_number` (per-restaurant unique), `status` (CHECK-enforced 5-state: `pending|preparing|ready|completed|cancelled` — a genuinely constrained enum, not a free string), `order_origin` (CHECK: `restaurant_qr|direct_link`), `idempotency_key text UNIQUE`, `visit_session_id`, `guest_id`. Two dead columns confirmed: `kitchen_notes` (never read/written) and `promotion_session_id` (exists only in generated types, never referenced in app code). **`orders.touchpoint_id` does not exist** — re-confirmed independently against the live schema dump in this audit, matching the prior Order Operations audit exactly. Location is reachable only via `table_identifier` (free-text snapshot) or one join through `visit_session_id → visit_sessions.touchpoint_id`; **`direct_link`-origin orders have no structured location reference at all.**
- **`order_items`** is a full snapshot model (`name_snapshot`, `price_snapshot`, `effective_price_snapshot`, `special_active_snapshot`, `line_total`) — later menu edits never retroactively alter historical orders. This is good design to preserve. No modifier/variant decomposition exists (matches §1.2).
- **`special_instructions` is a live, precisely-located data-loss bug** (not a missing feature): `CartSheet.tsx` has a working textarea bound to it, but the value is dropped before the network request — the POST body only ever sends `{menu_item_id, quantity}`. Unrelated to POS work but worth fixing regardless, since a POS kitchen ticket would need this field to exist end-to-end.
- **Idempotency is a genuine strength**, not a gap: `orders.idempotency_key UNIQUE` with a proper check-then-insert-then-catch-23505 pattern (`lib/orders/create-order.ts:111-124`), and a parallel `payments_restaurant_idempotency_uidx` partial unique index on `(restaurant_id, metadata->>'idempotency_key')` scoped to non-failed rows. Payment and order idempotency keys are deliberately linked but distinct (`${key}:order` derivation). **A POS adapter must preserve this pattern**, not replace it — e.g., a POS webhook retried by the provider's own infrastructure should hit the same style of guard.
- **Payments** (`payments` table, `supabase/migrations/20260701000000_payment_simulation_v1.sql`, 13 rows) is backed by a real orchestration layer (`lib/payments/payment-orchestrator.ts`, 354 lines): idempotency check → capability gate → server-side price re-resolution → coupon re-validation → tax/fee/tip computation → payment row inserted `pending` *before* calling the provider → `createCheckout → authorizePayment → capturePayment` → compensating refund on downstream order-creation failure. Only implementation is `MockPaymentProvider` — always succeeds, no real PSP call. **No webhook route exists anywhere in `app/api`** — `verifyWebhook` is unused stub scaffolding. No 3DS/async pause-and-resume path exists (`authorizePayment` always returns `succeeded` synchronously). `payments.provider` is an unconstrained free string with a single hardcoded factory (`getPaymentProvider()`), not restaurant-configurable.
- **`payments.status` includes `refunded`; `orders.status` does not.** A refunded payment cannot currently be reflected on the order itself.
- **Order status transitions** (`app/api/admin/orders/[orderId]/status/route.ts`) use a hardcoded `VALID_TRANSITIONS` map, single authorization check (`restaurant.owner_id === auth.uid()`), and **console.log-only audit trail** — no persisted `order_events` table. (Matches the prior Order Operations audit's finding that a staff/role model and an event-sourced order history are both prerequisites for kitchen-facing work, independent of POS.)
- **Coupons attach to orders in two disconnected places**: `orders.coupon_id` (misleadingly named — actually stores `coupon_redemptions.id`) and the discount math itself, which lives entirely in `payments.metadata` JSONB, never as a column on `orders` or a line on `order_items`. There is no line-item-level discount representation a POS receipt/ticket could read directly. Redemption status flips `issued → redeemed` **non-transactionally, after** order creation — the code's own comment acknowledges this fails open, not closed, on error.
- **Live logic bug found, unrelated to POS**: `promotion_rewards.reward_type` defaults to `'percent_discount'`, but checkout (`lib/orders/apply-coupon-discount.ts:51`) only honors `'free'|'discount'` — the default value silently produces a $0 discount. Flagged for the product team; not part of this audit's scope to fix.

### 1.4 Customer identity, sessions, promotions

- **`customer_profiles`** is **global, not restaurant-scoped** — keyed by a globally-unique `phone_number_e164`, with no `restaurant_id` column at all. This is the single most important fact for POS customer-sync design: SpinBite's identity graph is phone-number-global, while every POS models customers per-merchant-account/location. A future sync is inherently **one SpinBite customer → many POS customer records**, never a 1:1 column addition.
- **No gift card or loyalty-points concept exists anywhere** — confirmed by exhaustive grep; a prior technical-design doc explicitly recommended *not* pre-building loyalty fields, and none were built. Clean blank slate for a future POS loyalty-sync boundary.
- **The real coupon/promotion tables** are `promotions` (65 rows), `promotion_rewards` (357 rows), `promotion_game_assignments` (69 rows), `coupon_redemptions` (142 rows) — `rewards` and `campaigns` are legacy/dead (0 rows, effectively unused). No POS discount/promotion sync exists in code or schema.
- **Session Intelligence / Decision Runtime** (`lib/session-intelligence.ts`, `engine/decision-runtime/runtime.ts`) consumes only SpinBite-native `session_events` and `orders` rows — it has zero current coupling to any POS concept, which means a POS integration is **additive** to this layer (new event sources), not a rework.
- **`guest_sessions`** is a dead legacy table (14 rows, zero code references) with fully open RLS (`WITH CHECK (true)` for INSERT/UPDATE, `anon`+`authenticated`) — flagged by Supabase's own advisor. Should be cleaned up regardless of POS work.
- **`coupon_redemptions` has RLS enabled but zero policies** — this currently **breaks the staff manual-redemption screen** (`app/admin/validate/page.tsx`), which queries via the browser client (subject to RLS) rather than a service-role API route. Every lookup and redemption silently returns "not found" for legitimate staff today. This is a live production bug, found during this audit, unrelated to POS but worth flagging immediately since a POS-driven redemption flow would hit the identical gap.

### 1.5 Provider abstractions, auth/tenancy, RLS

- **Two genuine, reusable provider-pattern precedents already exist**: `lib/payments/providers/*` (payment orchestration, described above) and `lib/intelligence/providers/*` (a real multi-vendor fan-out across Anthropic/OpenAI/Gemini/Imagen/Replicate, selected via a `getProvider(name)` switch). No POS-specific scaffolding exists anywhere — zero hits for `clover`, `square`(as POS), `toast`(as POS), `lightspeed`, `revel`, `spoton`, `micros`, `external_id`, `pos_*` (beyond the dead `pos_system` column) across the entire codebase.
- **Auth is Supabase Auth (email/password) only.** `profiles.role` is DB-CHECK-constrained to exactly `restaurant_owner | super_admin` — no staff/employee role exists anywhere. `app/staff/page.tsx` is an unauthenticated static mock, not a real role. `restaurants.owner_id` is **1 owner : many restaurants** (not unique), enforced consistently via `owner_id = auth.uid()` subqueries across ~15 migrations.
- **No organization/brand entity exists above `restaurants`** — confirmed by grep across all 58 migrations. Multi-location today is purely "one owner, N restaurant rows."
- **Critical, live, unfixed RLS finding**: `restaurants` has **two** wide-open `SELECT ... TO public USING (true)` policies. One traces to an untracked legacy file (`supabase/schema.sql:53`); the other, `"allow select restaurants"`, **has no source anywhere in the repository, tracked or untracked** — it exists only in the live database, an exact instance of the doc/schema drift class flagged in prior audits (`play_sessions` constraint, `supabase_realtime` publication gap). A 2026-06-09 hardening migration re-scoped a *third* restaurants policy but never dropped either of these two, so the hardening pass had no actual effect on public exposure. Anyone with the public anon key can currently `SELECT * FROM restaurants` and get every restaurant's `contact_email`, `phone`, `address_line1`, `owner_name`, `pos_system`, etc., across all 12 restaurants.
- **`orders_public_track` / `order_items_public_track`** (added in `20260621010000_ordering_hardening.sql`) grant `anon` `SELECT USING (true)` — **unconditional**, not scoped by order UUID despite the migration's own comment claiming an "unguessable UUID" access model. This currently exposes all 83 orders / 105 order items across all 12 restaurants to any anonymous caller, not just someone holding one specific order's link.
- **Migration discipline is good for new work** (consistent ship-then-audit-then-fix-forward pattern across several 2026-06/07 hardening sprints) but has a real boundary weakness: several pre-migration-era loose `.sql` files at the repo root (`schema.sql`, `menu_system.sql`, `auth_multi_restaurant.sql`, etc.) were never ported into the tracked system and are the direct source of at least one of the two orphan `restaurants` policies above.
- **No per-tenant secret storage pattern exists anywhere.** All current secrets (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, etc.) are global platform-level env vars, never persisted to a database row. The one genuinely reusable convention is **"deny all client RLS policies, force every write through a service-role API route"** — used consistently for `orders`, `visit_sessions`, `session_guests` — and this is the right pattern to extend for OAuth token storage, not the two existing key/value tables (`restaurant_settings`, `restaurant_capabilities`), which both expose their raw values directly to the owning restaurant's own browser client.

---

## 2. Domain Object Ownership Classification

Ownership is stated **as of "POS connected"** — before a restaurant connects a POS, SpinBite is necessarily the sole owner of everything (there is nothing to sync with). The classification below is what changes once a connection exists.

| Object | Ownership (POS connected) | Rationale |
|---|---|---|
| Restaurant (SpinBite entity) | **SpinBite-owned** | SpinBite's tenant root; POS has no concept of "restaurant," only "merchant/location." |
| Location (POS merchant/location) | **Synced copy** (`pos_locations`) | Cached from the provider for display/validation; SpinBite's `restaurants` row remains the tenant anchor. |
| Menu | **Hybrid** | SpinBite is the authoring surface (already rebuilt for multi-location reuse); once connected, becomes either import-driven (POS owns) or push-driven (SpinBite owns) per provider capability — never both directions at once for the same menu. |
| Category | **Synced copy** | Follows menu ownership; POS category taxonomy rarely maps 1:1 to SpinBite's, expect lossy mapping. |
| Item | **Hybrid** | SpinBite owns AI/marketing metadata (images, tags, merchandising, special-offer fields) permanently; price/availability become POS-owned once connected in POS-source-of-truth mode. |
| Modifier group / option | **POS-owned / synced copy** | SpinBite has none today — must be built as an imported concept from day one, not an authored one, since matching POS modifier semantics (required/optional, min/max select, price delta) is the harder problem and SpinBite has no existing model to defend. |
| Price | **POS-owned once connected** | The single most consequential ownership decision: once a POS is the payment/ticket system of record, its price is what actually gets charged. SpinBite must display a synced cache, never an independently-edited value, once connected — divergence here is a direct revenue/trust risk. |
| Tax | **POS-owned / synced** | SpinBite's current flat per-restaurant percentage has no admin UI and no jurisdiction model; a real POS tax engine is authoritative and must fully replace it once connected, not merge with it. |
| Table / touchpoint | **SpinBite-owned, mapped** | Touchpoints are SpinBite's own customer-experience primitive (QR-driven session entry) — keep owning it, but maintain a mapping to the POS's table/check concept where one exists. |
| Order | **SpinBite-owned at creation, hybrid after export** | SpinBite must remain authoritative for the customer-facing state (what the guest sees) even after POS export; POS becomes authoritative for kitchen/accounting state. See §8 for the full recommendation. |
| Order item | **Hybrid**, same lifecycle as order | |
| Payment | **Hybrid — capability-driven, not fixed** | Depends on which payment model is active per restaurant (§9): POS-managed → POS-owned; SpinBite-managed → SpinBite-owned; hybrid → split by leg. |
| Refund | **Owned by whichever side captured the original payment** | Must never be issuable from the side that didn't capture — this is a common integration bug class. |
| Customer | **SpinBite-owned, permanently** | The phone-identity graph is a deliberate strategic asset (per platform mission — SpinBite as the AI/customer/revenue layer, not a POS clone). Sync a mapping to POS customer records; never let a POS become the customer system of record. |
| Coupon / reward | **SpinBite-owned, permanently** | Proprietary commerce/engagement engine; may optionally be *exported* to a POS as a native discount if the provider supports it, but SpinBite is always the authoring source. |
| Promotion | **SpinBite-owned, permanently** | Same as coupon/reward. |
| Campaign | **SpinBite-owned, permanently** | (Table currently dead/unused — classification is for when it's built out.) |
| Session behavioral events | **SpinBite-owned, derived/analytics-only** | No POS has an equivalent concept; this is pure SpinBite intelligence-layer input. |
| AI recommendations / interventions | **SpinBite-owned, derived/analytics-only** | Downstream consumer of (eventually) POS order/payment data, never a POS concept itself. |

**Two invariants fall out of this table and should be treated as hard constraints on the design in §4–§9:**

1. **Customer identity and the commerce/promotion engine never become POS-owned, under any capability configuration.** This is what keeps SpinBite "the AI operating layer above many POS systems" rather than a thin ordering front-end for whichever POS a restaurant happens to run.
2. **Price and tax flip ownership the moment a POS connects, all the way.** There is no safe middle ground where SpinBite keeps editing price while a POS is also live — that produces exactly the silent-overwrite risk flagged in §1.2 (no versioning, no diff, no conflict table today).

---

## 3. Current Coupling Risks (summary — see §1 for full detail)

| Risk | Where | Severity for POS work |
|---|---|---|
| No `external_id`/`source`/`synced_at` on any table | Entire schema | Foundational — every synced entity needs this; none exists today |
| No modifier/option model | Catalog | Blocks real menu parity with any mainstream POS |
| `orders.touchpoint_id` doesn't exist; direct-link orders have no structured location | `orders` | Blocks table/check mapping for roughly half of order-origin traffic |
| Flat, UI-less tax percentage | `restaurant_settings` | Incompatible with POS per-item/category tax models out of the box |
| No staff/role model | `profiles`, every order/admin auth check | POS connections are location-level; nothing today scopes access below "the one owner" |
| No org/brand entity | `restaurants` | Multi-location POS rollouts (one Clover account, many locations) have no anchor point |
| Public anon-read on `restaurants`, `orders`, `order_items` | RLS | Amplifies blast radius the moment more sensitive synced data lands in these tables |
| `coupon_redemptions` zero RLS policies | RLS | Already breaks staff redemption UI; a POS-driven redemption path would hit the same wall |
| No webhook infrastructure anywhere (`app/api/**/webhook` doesn't exist) | Payments | Real POS/PSP integration is unusable without signature-verified webhook ingestion — building from scratch, not extending |
| No idempotent webhook/event dedup pattern | — | Must be designed net-new (§6), can borrow the *style* of the existing order/payment idempotency but not literally reuse it |
| No encrypted-secret storage precedent | Env vars only | OAuth token storage has nothing to extend; must be new pattern (§11) |
| `payments.provider` unconstrained free string, single hardcoded factory | Payments | Needs a real multi-provider config layer before a second provider (POS or PSP) can coexist with the mock |
| No persisted order-status audit trail (console.log only) | Orders | A POS-driven or webhook-driven status change today is unrecoverable after log rotation |

---

## 4. Provider-Neutral POS Architecture

### 4.1 Design principle

Every interface below is written with **zero Clover-specific (or any-provider-specific) nouns**. A provider implementation translates its own API shape into these types; nothing above the provider boundary — order pipeline, admin UI, AI layer — may ever see a raw provider payload or branch on `provider === 'clover'`. This is the same discipline already proven by `lib/payments/payment-orchestrator.ts` never branching on which `PaymentProvider` is active — generalize it, don't reinvent it.

### 4.2 Core interfaces

```ts
// Every POS-integration interface operates against a resolved connection,
// never against restaurant_id directly — capability checks happen before
// any of these are called (see CapabilityRegistry, §4.3).

interface POSConnectionContext {
  connectionId: string;
  restaurantId: string;
  provider: string;          // free-text provider key, e.g. "clover" — never branched on outside the connector
  externalLocationId: string;
}

// --- Catalog ---
interface MenuSyncProvider {
  importCatalog(ctx: POSConnectionContext): Promise<ExternalCatalogSnapshot>;
  pushCatalog(ctx: POSConnectionContext, catalog: SpinBiteCatalogSnapshot): Promise<PushResult>;
  importModifiers(ctx: POSConnectionContext): Promise<ExternalModifierGroup[]>;
  // capability-gated: not called at all if provider lacks menu_push / modifier_sync
}

// --- Orders ---
interface OrderProvider {
  exportOrder(ctx: POSConnectionContext, order: NormalizedOrder): Promise<ExternalOrderRef>;
  getOrderStatus(ctx: POSConnectionContext, externalOrderId: string): Promise<ExternalOrderStatus>;
  cancelOrder(ctx: POSConnectionContext, externalOrderId: string, reason: string): Promise<void>;
}

// --- Payments (generalizes the existing PaymentProvider interface) ---
interface PaymentProvider {
  createCheckout(req: CreateCheckoutRequest): Promise<CheckoutSession>;
  authorizePayment(req: AuthorizePaymentRequest): Promise<AuthorizePaymentResult>;
  capturePayment(req: CapturePaymentRequest): Promise<CapturePaymentResult>;
  refundPayment(req: RefundPaymentRequest): Promise<RefundPaymentResult>;
  verifyWebhook(req: VerifyWebhookRequest): Promise<VerifyWebhookResult>;
}

// --- Inventory / 86ing ---
interface InventoryProvider {
  getAvailability(ctx: POSConnectionContext, externalItemIds: string[]): Promise<AvailabilityMap>;
  subscribeAvailabilityChanges?(ctx: POSConnectionContext): AsyncIterable<AvailabilityChangeEvent>;
}

// --- Customers / loyalty ---
interface CustomerProvider {
  findOrCreateExternalCustomer(ctx: POSConnectionContext, customer: NormalizedCustomer): Promise<ExternalCustomerRef>;
  syncLoyaltyBalance?(ctx: POSConnectionContext, externalCustomerId: string): Promise<LoyaltyBalance>;
}

// --- Webhooks (provider-agnostic ingestion boundary) ---
interface WebhookHandler {
  verifySignature(rawBody: Buffer, headers: Record<string, string>, secret: string): boolean;
  parseEvent(rawBody: Buffer): NormalizedPOSEvent;   // normalizes into SpinBite's own event shape immediately
}

// --- Capability discovery, queried at runtime everywhere else in the app ---
interface CapabilityRegistry {
  supports(provider: string, capability: POSCapability): boolean;
  getConfig(connectionId: string, capability: POSCapability): Record<string, unknown> | null;
}
```

**Root `POSProvider`** is not a single fat interface implemented by one class — it is a **bundle of the above**, resolved per connection. A provider implementation ships whichever of `MenuSyncProvider | OrderProvider | PaymentProvider | InventoryProvider | CustomerProvider | WebhookHandler` it actually supports; the orchestration layer checks `CapabilityRegistry.supports()` before ever calling one, and falls back per §5 when it doesn't. This is deliberately not a single "implement everything or nothing" contract — Clover, Square, and Toast differ enough in what they expose (KDS, gift cards, webhook reliability) that a monolithic interface would force fake stub implementations, which is exactly what should be avoided.

### 4.3 Where this plugs into existing code

- `lib/payments/payment-orchestrator.ts` gains a second call site: after its existing `createOrderWithItems` step, it (optionally, capability-gated) hands the order to `OrderProvider.exportOrder`. It does not change its own PSP-facing logic.
- `getPaymentProvider()` (currently a hardcoded single-instance factory) becomes connection-aware: `getPaymentProvider(connectionId | 'default')`, resolving to `MockPaymentProvider`, a future `StripeProvider`, or a future `CloverPaymentProvider` — all implementing the same `PaymentProvider` interface already in the codebase today.
- `restaurant_capabilities` (existing table, currently seeded with `ordering`/`table_management`/`payment_simulation`) is the right *pattern* to extend for a `pos_sync` restaurant-level toggle, but is **not** sufficient alone for provider-capability data — see §6 for why that needs its own table (`restaurant_capabilities` answers "is this feature on for this restaurant," not "does this specific connected provider support X").

---

## 5. Capability Matrix

Capabilities are queried, never assumed. Each is a boolean per (provider, connection) resolved by `CapabilityRegistry`.

| Capability | Meaning | Where SpinBite uses it | If unsupported |
|---|---|---|---|
| `menu_import` | Provider can export its catalog to SpinBite | Initial sync, ongoing price/availability refresh | Menu stays SpinBite-authored; no sync at all — restaurant runs "SpinBite catalog, disconnected from POS catalog" |
| `menu_push` | SpinBite can write catalog changes to the provider | Admin menu edits propagate outward | Admin UI shows catalog as read-only-from-POS; edits blocked with an explicit "managed by your POS" message, not a silent no-op |
| `modifier_sync` | Provider exposes modifier groups/options | Rendering true item customization on the QR menu | Item shown without modifiers (current behavior) — explicitly flagged in admin UI as "modifiers not available for this connection" so the gap is visible, not silent |
| `inventory_sync` | Provider can report/push availability (86'd items) | Hiding sold-out items in near-real-time | Falls back to manual `menu_items.available` toggle (already exists) |
| `order_create` | Provider accepts order creation via API | Order export (§8) | Order stays SpinBite-only; kitchen must re-key from a SpinBite-facing screen — flag prominently, this is a poor experience and should gate the "go live" checklist |
| `order_status_webhook` | Provider pushes order status changes | Reflecting POS-side status back to the customer tracker | Falls back to polling (§6) at a defined interval; if polling is also unsupported, SpinBite's own status becomes the only status shown (no POS reconciliation) |
| `kitchen_routing` | Provider has its own KDS/station routing | Determines whether SpinBite's own future KDS work (per the Order Operations audit) is needed for this restaurant | If supported, SpinBite order export is the deliverable, not a SpinBite-side KDS screen; if unsupported, SpinBite's own KDS becomes relevant for this restaurant |
| `payment_capture` | Provider can capture payment directly | POS-managed payment model (§9) | SpinBite-managed (PSP) payment is the only option for this connection |
| `payment_link` | Provider supports a hosted/link-based checkout | Alternative low-integration payment path | Falls back to `payment_capture` or SpinBite-managed |
| `refund_create` | Provider can issue refunds via API | Admin-initiated refunds | Refund must be performed manually in the provider's own dashboard; SpinBite records the refund as "pending external action" rather than claiming success |
| `table_mapping` | Provider has a table/check concept mappable to `restaurant_touchpoints` | Attaching orders to the right physical table on the POS side | `pos_order_exports.external_ticket_number` stored without a table linkage; ticket appears un-tabled on the POS side, staff manually assign |
| `customer_sync` | Provider supports customer record lookup/create | Attaching orders to a POS-side customer for reporting | Order exports without customer attribution on the POS side |
| `loyalty_sync` | Provider has its own loyalty program | Whether SpinBite's (currently nonexistent) loyalty concept should defer to the POS's | N/A today (no SpinBite loyalty exists) — recorded for future use |
| `gift_cards` | Provider supports gift card redemption/issuance | Accepting a POS gift card as tender at SpinBite checkout | Gift card tender option hidden entirely for this connection |
| `tax_sync` | Provider exposes tax rates/rules | Replacing SpinBite's flat per-restaurant percentage | SpinBite's existing flat-percentage fallback remains active — but this must be visibly labeled as an estimate, not the POS's authoritative rate, once any connection exists |
| `tips` | Provider handles tip capture/distribution | Whether SpinBite's checkout should collect a tip itself | If unsupported, SpinBite collects and separately reports tip totals for manual reconciliation |
| `service_fees` | Provider models service/convenience fees distinctly from tax | Correct fee labeling on receipts | SpinBite's existing flat service-fee percentage remains the fallback, same caveat as `tax_sync` |

**Design rule**: an unsupported capability must always be **visible and explicit** in the admin UI (a labeled "not available with your connected POS" state), never a silent degrade. This directly follows the platform's existing session-architecture invariant against silent state divergence (§ "Single source of truth for guest count" precedent in prior session-architecture work) — the same discipline applies here: never let a capability gap look like normal, working behavior.

---

## 6. Sync Architecture

### 6.1 Connection lifecycle

1. **Connect**: restaurant owner initiates OAuth from a new admin "Integrations" tab (doesn't exist today — new work). Redirect → provider consent → callback exchanges code for tokens → `pos_connections` row created, `status='pending'` until the first successful capability probe, then `'connected'`.
2. **Location mapping**: if the provider account has more than one location, admin picks which external location maps to this SpinBite restaurant; result cached in `pos_locations`.
3. **Capability probe**: on connect, query (or look up from the static capability registry seed data, §6.4) which capabilities this specific merchant account actually has — plan tiers vary within a single provider.
4. **Initial import**: capability-gated full catalog pull (`menu_import`), written into a staging area (not directly into live `menus`/`menu_items` — see §6.3 conflict handling) for owner review before activation.
5. **Incremental sync**: webhook-driven where `order_status_webhook`/inventory webhooks exist; polling fallback on a fixed interval otherwise (`pos_sync_jobs` with `job_type='poll_*'`).
6. **Disconnect**: tokens revoked at the provider, `pos_connections.status='disconnected'`, all synced entities freeze in their last-known state (never deleted), admin UI clearly marks the restaurant as "was connected, now disconnected" rather than silently reverting to SpinBite-authored mode.

### 6.2 OAuth/token storage

No existing precedent to extend (§1.5, §3). New pattern: ciphertext columns on `pos_connections` (app-layer AES-GCM, KMS-managed key — or Supabase Vault if available on the project's tier), **zero client-side RLS SELECT grant** on the raw columns, mirroring the existing "service-role only" convention already used for `orders`/`visit_sessions` writes. Owner-facing "connection status" UI reads through a narrow API route that returns only non-secret fields (status, connected_at, external_merchant_id) — never the token columns, even encrypted.

### 6.3 External ID mapping and conflict resolution

`pos_external_mappings` (§7) is the single generic mapping table for every synced entity type — not a bespoke `clover_menu_item_id` column bolted onto `menu_items`. Each mapping carries a `sync_hash` (content hash of the last-synced representation) so incremental sync can cheaply detect "did this change on either side since we last looked" without diffing full payloads every time.

**Conflict resolution rule, stated explicitly because §2 makes it a hard constraint**: for entities where ownership flips to POS on connect (price, tax, availability), **the POS value always wins** — there is no merge, no "last writer wins by timestamp." SpinBite-side edits to a POS-owned field are either blocked in the UI (`menu_push` unsupported) or, if `menu_push` is supported, treated as a push request that itself becomes the new POS-side value (not a local override that silently diverges). For entities where SpinBite retains ownership (customer identity, promotions), the reverse holds — POS-side data is read-only input, never overwrites SpinBite's row.

### 6.4 Capability registry (two-layer, per §4.3)

- A **static, SpinBite-maintained `provider_capabilities` seed table**: `(provider, capability_name, supported boolean, notes text)` — hand-curated from each provider's public API docs, shipped as data (not code) so adding "Square now supports X" is a data migration, not a deploy.
- A **per-connection override table** (`pos_connection_capabilities` or a `capabilities_verified jsonb` column on `pos_connections`) for cases where a specific merchant's plan tier differs from the provider default — populated by the capability probe in §6.1 step 3.

### 6.5 Retries, dead-letter, idempotency

`pos_sync_jobs` (§7) is a real queue, not a fire-and-forget call: `status IN (queued|running|succeeded|failed|dead_letter)`, `attempts`/`max_attempts`, exponential-backoff `next_run_at`. On exhausting `max_attempts`, a job moves to `dead_letter` and raises an alert (§11) rather than silently disappearing — this is the single most important operational property to get right, since a silently-dropped order-export job is a customer-facing failure (kitchen never sees the order). Webhook ingestion (`pos_webhook_events`) is deduplicated on `(provider, external_event_id)` — a provider retrying its own webhook delivery must be a no-op on the second delivery, following the same discipline already proven in the existing order/payment idempotency design (§1.3).

### 6.6 Stale-data detection, audit, manual resync

`pos_sync_events` (§7) is an append-only audit log of every import/export/conflict/error, separate from the job queue (jobs are operational state, events are the permanent record — same "operational vs. historical" split already used correctly elsewhere in the platform, e.g. `visit_sessions` counters vs. `session_events`). Admin UI surfaces a "Sync Activity" panel per connection reading this table, plus a manual "Resync now" action that enqueues a fresh `pos_sync_jobs` row rather than bypassing the queue.

---

## 7. Data Model Recommendations

All tables below are new; none touch existing tables' columns directly (menu/order/payment tables gain nothing beyond what's noted inline — the sync layer sits beside them).

| Table | Purpose | Key columns | Indexes | RLS | Phase |
|---|---|---|---|---|---|
| `pos_connections` | One row per (restaurant, provider) OAuth grant | `id, restaurant_id, provider, status, external_merchant_id, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scopes text[], connected_by, connected_at, last_verified_at, last_error, metadata jsonb` | `unique(restaurant_id, provider) where status='connected'` | Service-role only; no SELECT for `authenticated`/`anon` even on non-secret columns — owner UI reads via a narrow API route | 1 |
| `pos_locations` | Cached external location record | `id, pos_connection_id, restaurant_id, external_location_id, name, address jsonb, timezone, currency, raw_metadata jsonb` | `unique(pos_connection_id, external_location_id)` | Owner-scoped SELECT (non-secret), service-role write | 1/2 |
| `provider_capabilities` | Static, hand-curated capability-by-provider seed data | `provider, capability_name, supported boolean, notes text` | `unique(provider, capability_name)` | Public read (no tenant data), service-role/admin write | 1 |
| `pos_connection_capabilities` | Per-merchant capability overrides discovered at connect time | `pos_connection_id, capability_name, supported boolean, verified_at` | `unique(pos_connection_id, capability_name)` | Owner-scoped SELECT, service-role write | 1 |
| `pos_external_mappings` | Generic entity↔external-ID mapping | `id, restaurant_id, pos_connection_id, entity_type CHECK(...), spinbite_id, external_id, external_updated_at, sync_hash, sync_direction CHECK(import\|export\|bidirectional), last_synced_at` | `unique(pos_connection_id, entity_type, external_id)`, `unique(pos_connection_id, entity_type, spinbite_id)`, `(restaurant_id, entity_type)` | Owner-scoped SELECT, service-role write | 3 |
| `pos_sync_jobs` | Async work queue | `id, restaurant_id, pos_connection_id, job_type, status CHECK(...), attempts, max_attempts, next_run_at, payload jsonb, result jsonb, error, started_at, finished_at` | `(status, next_run_at)` for worker polling; `(restaurant_id, job_type)` | Service-role only | 2 |
| `pos_sync_events` | Append-only sync audit log | `id, restaurant_id, pos_connection_id, entity_type, entity_id, external_id, action CHECK(import\|export\|conflict\|error), detail jsonb, created_at` | `(restaurant_id, created_at)`, `(entity_type, entity_id)` | Owner-scoped SELECT (Sync Activity panel), service-role write | 2 |
| `pos_webhook_events` | Raw inbound webhook log, dedup, replay protection | `id, provider, pos_connection_id, external_event_id, event_type, signature_verified boolean, raw_payload jsonb, status CHECK(received\|processing\|processed\|failed\|ignored), received_at, processed_at, error` | `unique(provider, external_event_id)` | Service-role only | 6 |
| `pos_order_exports` | Order → external ticket lifecycle, decoupled from `orders.status` | `id, order_id UNIQUE, restaurant_id, pos_connection_id, external_order_id, export_status CHECK(pending\|exporting\|exported\|acknowledged\|failed\|not_applicable), attempts, external_status text, external_ticket_number, error` | `(restaurant_id, export_status)`, `(external_order_id)` | Owner-scoped SELECT, service-role write | 4 |
| `pos_payment_attempts` | POS-side capture attempts, distinct from the existing `payments` (SpinBite/PSP-side) table | `id, payment_id, order_id, restaurant_id, pos_connection_id, external_payment_id, attempt_status CHECK(...), amount, raw_response jsonb` | `(order_id)`, `(external_payment_id)` | Owner-scoped SELECT (raw_response redacted in the read API), service-role write | 5 |
| `pos_connection_secrets` | Only if a future compliance review requires column-level secret separation from `pos_connections` | Same shape as the ciphertext columns above, split out | — | Service-role only, no exceptions | Later, not Phase 1 — only build if actually required |

**Explicitly not required for Phase 1**: `pos_webhook_events`, `pos_order_exports`, `pos_payment_attempts` — these land with the phases that need them (§12). Building them early adds surface area with nothing to exercise it.

---

## 8. Order Pipeline Recommendation

**Question:** should SpinBite create the order locally first and export to POS, or should POS order creation be the source of truth before confirming to the customer?

**Recommendation: SpinBite creates the order locally first (as it already does), then exports asynchronously.** POS export status is tracked separately (`pos_order_exports.export_status`) and never blocks the customer-facing confirmation.

**Why**: the existing order pipeline's biggest strength (§1.3) is a proven, race-safe, DB-enforced idempotency model built entirely around "SpinBite's own insert is the durable event." Making customer confirmation wait on a synchronous POS API round-trip:

- Introduces the customer-facing critical path's latency and failure mode to an external, un-owned system SpinBite has no control over — a POS outage would directly block ordering, not just delay a background sync.
- Breaks the existing idempotency guarantee's simplicity — "was this order already created" currently has one authoritative answer (`orders.idempotency_key`); making it depend on a POS round-trip completing successfully adds a second, slower failure mode to the same question.
- Doesn't match how any of the target providers actually expect integration to work — Clover, Square, and Toast Order APIs are all designed for "create in your system, push to us," not "wait for us before you confirm anything."

**The tradeoff this creates, and how to handle it**: an order can be accepted by SpinBite and then fail to export (item discontinued on the POS side, price mismatch, POS till closed, network failure). This must be handled explicitly, not silently:

- `pos_order_exports` starts `pending`, moves through `exporting → exported → acknowledged` on success, or `failed` after exhausting retries (via `pos_sync_jobs`).
- A `failed` export must surface prominently in the admin order view — "this order was accepted by the customer but never reached your kitchen system" — with a one-click manual retry and a clear fallback instruction (re-key manually), not just a background log line.
- `orders.status` (the existing CHECK-enforced 5-state enum) stays customer-facing and SpinBite-owned; it is **not** widened to include POS-side states — `pos_order_exports.external_status` is where raw POS status strings live, kept separate and unnormalized. This avoids polluting the one enum every other part of the app (session intelligence, decision runtime, order tracker) already depends on.
- Cancellation must propagate both directions: a SpinBite-initiated cancel (`orders.status → cancelled`) attempts `OrderProvider.cancelOrder` if already exported; a POS-side cancel/void (via webhook or poll) must be reflected back — this is exactly why `orders.status` needs a **persisted audit trail** (`order_events`, already recommended independently by the prior Order Operations audit) rather than the current console.log-only trail, since a POS-driven status change needs the same accountability as a staff-driven one.
- Server-side price recalculation (already exists for coupons/tax/tip in `payment-orchestrator.ts`) must additionally validate against the POS-synced price at order time once `menu_import`/price-sync is active for that connection — reject or flag an order whose SpinBite-side price has drifted from the last-synced POS price, rather than silently charging the stale figure.

---

## 9. Payment Architecture Recommendation

### 9.1 Three models

**POS-managed payment**: SpinBite creates the order/ticket; the POS (its own terminal, its own hosted checkout, or its own capture API) handles the actual charge. *Customer flow*: either pays at a physical terminal, or is redirected to a POS-hosted checkout. *Settlement*: happens entirely within the restaurant's existing POS/processor relationship — money never touches a SpinBite-controlled account. *Refunds*: issued through the POS, `refund_create` capability-gated (§5); if unsupported, manual. *PCI*: zero exposure for SpinBite — the strongest possible position. *Compatibility*: works well with Clover (terminal-present flows are Clover's core strength) but is the weakest fit for the SpinBite-native "order and pay before the food arrives" QR flow that already shipped 2026-07-01, since most POS hosted-checkout APIs weren't built for that UX. *Adoption impact*: restaurants trust their existing statement/rates — lowest friction to "yes."

**SpinBite-managed payment** (via Stripe or another PSP): SpinBite's existing orchestrator (§1.3) already models this shape exactly — `createCheckout → authorizePayment → capturePayment`, currently mocked. *Customer flow*: stays entirely within the SpinBite QR/direct-link experience already built, no redirect. *Settlement*: to a SpinBite-controlled (Stripe Connect or equivalent) account, requiring a separate payout arrangement to the restaurant — a real new piece of financial-operations surface, not just an API integration. *Refunds*: through the PSP, fully controllable by SpinBite. *PCI*: SAQ-A scope achievable via Stripe Elements/hosted fields (SpinBite never touches raw card data) — manageable, not zero. *Compatibility*: works with any POS in principle, but the POS-side ticket needs to be marked "paid externally," which not every provider's Order API supports cleanly (`external_tender_reconciliation`, effectively a capability of its own). *Adoption impact*: SpinBite controls the full UX (already proven in the mock), but restaurants must trust a second money-moving relationship alongside their POS.

**Hybrid**: SpinBite captures payment via its own PSP for the direct-ordering/QR flow (preserving the UX already built and shipped), then exports a **closed, externally-paid** ticket to the POS purely for kitchen visibility and accounting/reporting parity, using whichever "other tender"/"external payment" mechanism the connected provider's Order API exposes. *Settlement*: split — SpinBite/PSP for the online leg, nothing for the POS leg (it's informational only). *Refunds*: must originate from the SpinBite/PSP side (the side that actually captured), and the POS ticket's refund reflection is best-effort, capability-gated. *PCI*: same as SpinBite-managed. *Compatibility*: the most POS-agnostic of the three, since it only requires the target provider to support recording an externally-tendered order — a lower bar than full payment-capture API access, and one Clover, Square, and Toast all clear to varying degrees. *Adoption impact*: best of both — restaurant sees the order and revenue in their own POS reporting (no perceived "shadow system"), while SpinBite keeps the checkout UX it already built.

### 9.2 Recommended Phase 1 approach

**Hybrid, defaulting to SpinBite-managed capture, with POS-managed offered as a capability-gated alternative per connection — never assumed to be the only path.**

Reasoning: the platform has already built and shipped (as of 2026-07-01) a direct-ordering-and-payment experience on top of the mock provider, with a proven orchestration shape. Replacing that shape with `StripeProvider` (same interface, §4.2) is materially less engineering risk than building a POS-hosted-checkout redirect flow as the *default* path, and it preserves the UX investment already made. The `external_tender_reconciliation` capability (§5, folded into `pos_order_exports`) is what keeps this from becoming "SpinBite as a shadow payment system the restaurant doesn't trust" — the ticket still shows up, paid, in their POS. Restaurants on a connected provider that genuinely cannot record external tenders should fall back to full POS-managed capture rather than forcing a broken reconciliation experience — this is exactly what the capability registry (§4, §5) exists to make an explicit, visible choice rather than a hardcoded assumption.

---

## 10. AI Compatibility

The platform's stated mission (`spinbite-platform-architecture-v4.md`: "AI-first Restaurant Revenue Operating System... Build every subsystem so AI can control it later") means the POS layer must be judged on whether it produces AI-consumable signal, not just whether it moves orders.

**What POS data/events the AI layer needs, mapped to the example commands in the audit brief:**

- *"increase pasta sales by 20% today" / "optimize menu positioning"* — needs item-level sales velocity and price realization, which only exists once `order_export`/`payment_capture` are live and orders carry real POS-confirmed totals, not just SpinBite's pre-tax subtotal.
- *"push a beverage upsell at high-intent tables"* — this is **already served by the existing Session Intelligence / Decision Runtime layer** (`lib/session-intelligence.ts`, `engine/decision-runtime/runtime.ts`), which is purely SpinBite-native (session_events + orders) and requires **no POS data at all** to keep working. POS integration should not be a prerequisite for this class of command.
- *"pause promotions for sold-out items"* — needs `inventory_sync` (§5); without it, this command has no signal to act on and should be explicitly reported as unsupported for that connection, not silently ignored.
- *"detect high-wait-risk orders" / "recommend staff intervention"* — needs `order_status_webhook`/kitchen-routing timestamps from the POS (ticket fired → fired-to-kitchen → ready timing) to be meaningfully better than what SpinBite's own order timestamps already provide; genuinely additive once available, not a blocker before then.
- *"update campaigns based on POS sales data"* — needs settlement-confirmed payment data (§9), which is why payment integration (Phase 5) should land before any AI-revenue-automation phase (Phase 9), not in parallel.

**How this data should flow**: POS webhook/poll events land in `pos_webhook_events` / `pos_sync_events` (raw, provider-shaped) and must be **normalized into SpinBite's own event vocabulary before the AI layer ever sees them** — either as new `session_events.event_type` values or a parallel normalized stream, never as raw provider JSON passed into `lib/session-intelligence.ts` or `engine/decision-runtime/runtime.ts` directly. This is the same "orchestrator never sees provider-specific shapes" discipline as §4.1, applied to the AI boundary specifically — it's what keeps Clover-shaped payloads from leaking into decision-runtime logic that has to eventually work identically across Clover, Square, and Toast.

**Conclusion**: most of the ambitious AI commands in the brief are **not blocked** by the absence of a POS layer today — the intelligence/decision-runtime foundation is already decoupled and working. POS integration is what makes revenue-level commands (sales lift, campaign tuning against real settled sales) possible, but operational/behavioral commands (upsell timing, wait-risk) are already unblocked and should not be sequenced as if they depend on Phase 8/9.

---

## 11. Security and Compliance

| Area | Finding / Recommendation |
|---|---|
| OAuth token encryption | No precedent exists (§1.5). Must be app-layer AES-GCM with a KMS-managed key or Supabase Vault; ciphertext columns on `pos_connections`, zero client-readable RLS grant even on encrypted values. |
| Secret rotation | Not addressed by any existing pattern. Refresh-token rotation must be handled in the connection-lifecycle job (§6.1), with `token_expires_at` monitored and refreshed proactively, not reactively on 401. |
| Least-privilege scopes | Request the minimum OAuth scopes each capability actually needs (e.g., don't request payment-capture scope for a connection only used for menu import) — store granted `scopes text[]` on `pos_connections` and gate capability checks on what was actually granted, not just what the provider generally supports. |
| Tenant isolation | Follow the one convention that's actually solid today: deny all client RLS policies on POS tables, force every access through a service-role API route scoped by `restaurant_id`. Do **not** extend the pattern used by `restaurant_settings`/`restaurant_capabilities` (owner-readable raw value) to anything secret-bearing. |
| RLS policies | Every new `pos_*` table ships with RLS enabled and either zero client policies (service-role only) or narrow owner-scoped SELECT on non-secret columns only — no table should default to the "enabled but no policy written yet" state the advisor already flags on `campaigns`/`coupon_redemptions`/`rewards` today. |
| Webhook signature verification | Mandatory, no exceptions, built correctly from scratch since **no webhook route exists anywhere in the codebase today** (§1.3) — this is genuinely new infrastructure, not an extension. HMAC verify against the raw body before any parsing; reject unverified payloads outright rather than logging-and-continuing. |
| Replay protection | `pos_webhook_events` unique `(provider, external_event_id)` handles logical replay; also enforce a timestamp-skew window on the signature check itself (reject webhooks claiming to be older than N minutes) to limit stolen-signature replay value. |
| Audit trails | `pos_sync_events` (§7) covers sync-side; this should land **alongside** the `order_events` table already independently recommended by the prior Order Operations audit for status-transition auditing — both are instances of the same gap (console.log-only history), and should be designed together, not as two unrelated tables. |
| Employee/staff access | **Blocked on `restaurant_staff` shipping first** (per the prior Order Operations audit's finding, restated here because POS work makes it more urgent, not less — a POS connection is inherently a location-level credential, and "only the owner account can manage it" doesn't match how restaurants actually operate). This is a cross-cutting prerequisite, not POS-specific scope creep. |
| Super-admin access | `is_super_admin()` is already flagged by the Supabase advisor as an `anon`/`authenticated`-executable `SECURITY DEFINER` function — worth a look independent of POS work, but especially before a super-admin surface for cross-tenant POS connection support/debugging is ever built. |
| Data retention | Not addressed anywhere today. `pos_webhook_events.raw_payload` will contain provider-shaped order/customer data — needs an explicit retention/purge policy before Phase 6, not left indefinite by default. |
| PCI exposure | Zero for POS-managed capture (§9); SAQ-A achievable for SpinBite-managed via Stripe Elements-style hosted fields — **never** have SpinBite's own servers touch raw card data regardless of which model is active. |
| Logging redaction | No existing redaction convention in the codebase (confirmed by the provider-abstraction audit). OAuth tokens, refresh tokens, and full webhook payloads (which may carry PANs' adjacent data or full customer PII) must never hit `console.log` — this is a new discipline to establish given the codebase's current default of unredacted `console.log` debugging (e.g., the existing order-status route). |
| Failure alerting | `pos_sync_jobs` reaching `dead_letter` (§6.5) and `pos_order_exports.export_status='failed'` (§8) must both page/alert, not just sit in a table — this is a customer-facing failure mode (order silently never reaches the kitchen) and needs the same urgency as a payment failure, not routine background-job noise. |

**Immediate, POS-independent fixes this audit surfaced that should not wait for Phase 0 to be scheduled as "POS work"**: the two orphan public-read policies on `restaurants`, the unconditional anon-read on `orders`/`order_items`, and the zero-policy `coupon_redemptions` breaking the staff redemption screen. These are live risks today regardless of whether POS integration ever proceeds.

---

## 12. Implementation Roadmap

Each phase's acceptance criteria gate the next phase — do not start Phase *N+1* work with Phase *N* still failing its own criteria.

### Phase 0 — Audit findings and risk cleanup
- **Goals**: fix the blockers found in this audit that are independent of POS scope but that POS work would otherwise inherit or worsen.
- **DB work**: drop the two orphan `restaurants` public-SELECT policies; scope `orders_public_track`/`order_items_public_track` to something narrower than unconditional `true`; add an RLS policy (or confirm intentional service-role-only) for `coupon_redemptions`; clean up dead `guest_sessions` table/policies; add `orders.touchpoint_id` (direct FK where available) per the prior Order Operations audit's recommendation; stand up `restaurant_staff` (prerequisite, not optional) and a persisted `order_events` audit table.
- **Backend work**: fix the `special_instructions` data-loss bug (client captures it, server drops it); fix `promotion_rewards.reward_type='percent_discount'` silently producing $0 discount.
- **Frontend/admin work**: none required beyond what the above DB/backend fixes need to not break existing screens.
- **Tests**: RLS policy tests for every table touched (verify anon/authenticated access matches intent); regression test on `/admin/validate` staff redemption flow.
- **Risks**: touching live RLS on `restaurants`/`orders` requires careful staged rollout — verify no legitimate anon read path depends on the current unconditional policy before narrowing it (audit every public page's actual query pattern first).
- **Acceptance criteria**: `get_advisors` (security) shows no unintentional `rls_enabled_no_policy` or always-true findings on these tables; staff redemption flow works end-to-end; `orders.touchpoint_id` populated for all new orders.

### Phase 1 — POS integration kernel
- **Goals**: ship the capability registry and connection primitives with no live provider yet — the framework, provably provider-neutral, before Clover exists.
- **DB work**: `pos_connections`, `pos_locations`, `provider_capabilities`, `pos_connection_capabilities`.
- **Backend work**: `CapabilityRegistry` implementation; OAuth connect/callback/disconnect flow (generic, not Clover-specific) with encrypted token storage.
- **Frontend/admin work**: new "Integrations" tab on the restaurant workspace (currently doesn't exist) — connection status, connect/disconnect actions, capability display (even with zero real providers wired, this should render from `provider_capabilities` seed data).
- **Tests**: token encryption round-trip; RLS deny-by-default verification on `pos_connections`.
- **Risks**: building the abstraction before a real connector exists risks over-engineering to a guessed shape — mitigate by keeping interfaces narrow (§4.2) and deferring anything not needed until Phase 2 proves it against a real API.
- **Acceptance criteria**: a fake/test provider can complete the full connect → capability-probe → disconnect lifecycle with zero code outside `lib/pos/providers/test-provider.ts` touched.

### Phase 2 — Clover reference connector
- **Goals**: first real provider, proving the kernel against an actual API without yet touching menu/order/payment product surfaces.
- **DB work**: `pos_sync_jobs`, `pos_sync_events`.
- **Backend work**: `CloverProvider` implementing whichever of §4.2's interfaces Clover genuinely supports; real capability probe against Clover's API.
- **Frontend/admin work**: Clover selectable in the Integrations tab; real OAuth against Clover's sandbox.
- **Tests**: end-to-end connect against Clover sandbox; job-queue retry/dead-letter behavior under simulated failures.
- **Risks**: Clover sandbox/production API quirks not visible from docs alone — budget time for discovery, don't assume the capability matrix (§5) is complete until verified against Clover directly.
- **Acceptance criteria**: a real Clover sandbox merchant can connect and disconnect; capability probe results match what's documented for that account's plan tier.

### Phase 3 — Menu import and mapping
- **Goals**: first real synced product data.
- **DB work**: `pos_external_mappings`.
- **Backend work**: `importCatalog`/`importModifiers` against Clover; staging-area review flow (§6.1 step 4) before activating imported catalog live; modifier data model design (net-new, §3) built to match what's actually imported, not speculatively designed in Phase 1.
- **Frontend/admin work**: import review screen — accept/reject/re-map before an imported menu goes live; visible "managed by Clover" state on synced items per §5's design rule.
- **Tests**: mapping-table uniqueness/conflict tests; sync-hash change-detection correctness.
- **Risks**: this is where the ownership-flip rule (§2, §6.3) gets tested for real — a bad conflict-resolution bug here directly risks showing customers wrong prices.
- **Acceptance criteria**: a Clover catalog imports, maps correctly to `menu_items`/new modifier tables, and re-import correctly detects no-op vs. real changes via `sync_hash`.

### Phase 4 — Order export
- **Goals**: SpinBite orders reach the Clover kitchen/ticket system.
- **DB work**: `pos_order_exports`.
- **Backend work**: `exportOrder`/`getOrderStatus`/`cancelOrder` against Clover; the local-first pipeline from §8, including the failed-export admin-visible state.
- **Frontend/admin work**: order detail view shows export status; manual retry action.
- **Tests**: export failure/retry paths; cancellation propagation both directions.
- **Risks**: this is the first phase with direct customer-facing consequence if it fails silently — the alerting requirement in §11 is not optional for this phase.
- **Acceptance criteria**: an order placed through SpinBite reliably appears on a connected Clover kitchen ticket within a defined SLA; a forced export failure surfaces in the admin UI within one polling cycle.

### Phase 5 — Payment integration
- **Goals**: real money, per §9's hybrid recommendation.
- **DB work**: `pos_payment_attempts`.
- **Backend work**: `StripeProvider` implementing the existing `PaymentProvider` interface (replaces mock for SpinBite-managed capture); `external_tender_reconciliation` support against Clover for the hybrid ticket-closing leg; POS-managed capture path as the capability-gated alternative.
- **Frontend/admin work**: payment-model selection UI per connection (not global); refund initiation respecting "only the capturing side can refund" (§2).
- **Tests**: PCI-scope verification (no raw card data ever server-side); refund-authorization-side correctness; idempotency under concurrent webhook + poll reconciliation.
- **Risks**: highest-stakes phase in the roadmap — real money, real PCI exposure, real restaurant trust. Do not compress the testing budget here regardless of schedule pressure elsewhere.
- **Acceptance criteria**: a live (or sandboxed-real) charge completes, settles, and the Clover-side ticket reflects it as paid; a refund issued from the correct side succeeds and is reflected on both sides within a defined SLA.

### Phase 6 — Webhooks and reconciliation
- **Goals**: move off polling where Clover supports webhooks; close the loop on stale-data detection.
- **DB work**: `pos_webhook_events`.
- **Backend work**: signature-verified webhook ingestion route (net-new infrastructure, §11); reconciliation job comparing webhook-driven state against polling-driven state to catch missed events.
- **Frontend/admin work**: none new beyond what Sync Activity (Phase 2) already shows.
- **Tests**: replay-attack rejection; dedup correctness under duplicate delivery; signature-verification negative cases.
- **Risks**: webhook infrastructure is genuinely new to this codebase — treat it with the same care as Phase 5, not as routine plumbing.
- **Acceptance criteria**: a Clover-side status change reaches SpinBite via webhook faster than the polling interval would have, and a duplicate webhook delivery produces no duplicate side effects.

### Phase 7 — Capability-based UX
- **Goals**: make the capability gaps from §5 a first-class, polished admin/customer experience rather than an engineering afterthought.
- **DB work**: none new.
- **Backend work**: capability-aware API response shaping (never return a field the UI would render as if it were live when the capability is actually unsupported).
- **Frontend/admin work**: full pass on every screen touched by Phases 1-6 to ensure unsupported-capability states are explicit per §5's design rule, not just functionally correct.
- **Tests**: UI snapshot/visual tests across every capability-on/off permutation actually in use.
- **Risks**: easy to under-scope as "just some empty states" — treat it as real product work, since silent capability gaps are exactly the class of bug this codebase has already been burned by (realtime publication gap, `play_sessions` constraint drift) in unrelated domains.
- **Acceptance criteria**: no screen in the product ever presents an unsupported-capability outcome as if it were a working feature.

### Phase 8 — Additional POS providers
- **Goals**: prove the abstraction genuinely generalizes — Square, then Toast, then others per business priority.
- **DB work**: `provider_capabilities` seed data additions only (no schema change, per the design intent in §4.1/§6.4).
- **Backend work**: new provider implementations; **any change required outside `lib/pos/providers/<name>/` to add a provider is a signal the abstraction leaked and should be treated as a bug in Phases 1-7's design, not accepted as normal**.
- **Frontend/admin work**: provider selection in Integrations tab.
- **Tests**: the same acceptance-criteria suite from Phases 2-6, re-run per new provider.
- **Risks**: this phase is the real test of whether "Clover first, not Clover the architecture" was actually achieved — budget time to fix leaks found here rather than special-casing around them.
- **Acceptance criteria**: a second provider reaches Phase 6 parity without any change to `lib/payments/payment-orchestrator.ts`, `lib/orders/*`, or any admin screen's core logic — only new provider implementation files and capability data.

### Phase 9 — AI revenue automation on POS data
- **Goals**: the actual north-star use cases from §10 that depend on settled POS data (sales-lift commands, campaign tuning against real revenue).
- **DB work**: normalized POS-event stream design (§10), likely new `session_events.event_type` values or a parallel table — deferred to this phase since it depends on which events Phases 4-6 actually deliver in practice.
- **Backend work**: extends `engine/decision-runtime/runtime.ts` with new opportunity types fed by normalized POS events; explicitly does not require rewriting the existing session-intelligence foundation (§10).
- **Frontend/admin work**: AI-surfaced recommendations referencing real sales data, building on the existing `live_interventions`/admin intervention feed pattern.
- **Tests**: decision-runtime correctness under real (not mocked) POS-derived signals.
- **Risks**: this is the phase most likely to be requested early by stakeholders excited about the AI vision — resist starting it before Phase 5 (real settled payment data) actually exists, per the platform's own locked principle: "do not build AI automation before operational primitives are stable."
- **Acceptance criteria**: at least one of the example commands from the audit brief (§10) is demonstrably actionable end-to-end against real connected-POS data, not a simulation.

---

## 13. Open Questions

1. **Which provider's OAuth/API access tier is being targeted for Clover first** — Clover has multiple app-market tiers with different capability access; the capability matrix (§5) can't be fully verified until this is settled.
2. **Who owns the payout/settlement relationship for SpinBite-managed payment** (§9) — this is a business/legal question (Stripe Connect account structure, payout timing to restaurants) that sits upstream of the technical design and should be resolved before Phase 5 begins, not during it.
3. **Does `restaurant_staff` (Phase 0 prerequisite) get scoped platform-wide or built specifically for this project** — the prior Order Operations audit already flagged it as a KDS prerequisite; POS work is a second independent reason it's needed. Recommend building it once, informed by both audits together, rather than twice.
4. **What is the actual data-retention requirement for `pos_webhook_events.raw_payload`** (§11) — needs a policy decision, not an engineering default.
5. **Should `menus.version` (currently inert, §1.2) be built into a real optimistic-concurrency mechanism as part of Phase 3**, since POS-driven catalog imports are exactly the scenario that would benefit from it, or is a simpler "POS always wins" rule (§6.3) sufficient without it?
6. **Is a formal PCI compliance review required before Phase 5**, or is Stripe Elements' SAQ-A eligibility sufficient self-certification for this stage of the business?

---

## Do-Not-Build-Yet Warnings

- **No code, schema, or branch work should begin from this document alone.** It is an audit and proposal; product/engineering review of §4-§9's design choices (especially the ownership rules in §2 and the payment model in §9) should happen before Phase 1 starts.
- **Phase 0 is not "POS work" and should not wait for a POS project to be greenlit** — the RLS and staff-model gaps it addresses are live risks today, independent of whether POS integration ever proceeds.
- **Do not build a modifier/option data model speculatively before Phase 3** — design it against what Clover's actual modifier API returns, not a guessed generic shape, to avoid a second migration once real data reveals the guess was wrong.
- **Do not widen `orders.status` to include POS-side states** (§8) — this was tempting to include in the initial design pass and is explicitly rejected; keep `pos_order_exports.external_status` separate.
- **Do not start Phase 9 (AI revenue automation) before Phase 5 (real payment data) is live and stable**, per the platform's own locked "operational primitives before AI automation" principle — restated here because it is the single most likely phase to face pressure to start early.

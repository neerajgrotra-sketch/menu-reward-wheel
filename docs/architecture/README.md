# SpinBite Architecture — Documentation Index

**Last updated:** 2026-07-07

SpinBite has two living architecture documentation trees. This page is the index that ties them together — read this first.

## Documentation map

| Doc | Location | Covers |
|---|---|---|
| **Platform Architecture v4** | [`spinbite-platform-architecture-v4.md`](./spinbite-platform-architecture-v4.md) | **Canonical source of truth.** Product decisions, invariants, auth, multi-tenancy, menu, touchpoints, promotions, ordering, security. Mandatory pre-read before any implementation (Rule 26). |
| Promotions in the Menu Experience | [`promotions-in-menu.md`](./promotions-in-menu.md) | **Use-case/rules reference**, not architecture narrative — every `RewardWidget` UI state, the coupon status lifecycle, the capability-gating matrix (ordering × payment_simulation), the Redeem Now cart bridge, and known gaps (unenforced daily limits, checkout TOCTOU race). Defers to v4 §6/§7 for schema and chronology. |
| System Architecture v1 | [`/architecture/spinbite_system_architecture_v1.md`](/architecture/spinbite_system_architecture_v1.md) | Runtime layer map, critical vs. non-critical path, production deployment rules |
| Session Lifecycle v1 | [`/architecture/session_lifecycle_v1.md`](/architecture/session_lifecycle_v1.md) | `SessionPhase` state machine, `visit_sessions`, terminal-state rules |
| Realtime & Presence v1 | [`/architecture/realtime_presence_v1.md`](/architecture/realtime_presence_v1.md) | `session_guests` presence engine, channel contracts, fallback chain |
| Intelligence Engine v3 | [`/architecture/intelligence_engine_v3.md`](/architecture/intelligence_engine_v3.md) | `session_events` behavioral log, per-guest profiling, Session Intelligence V3.1 |
| Decision Engine / Runtime v1 | [`/architecture/decision_engine_v1.md`](/architecture/decision_engine_v1.md), [`decision_runtime_v1.md`](/architecture/decision_runtime_v1.md) | Opportunity detection, intervention types, waiter notification dispatcher |
| Guest Identity v1 | [`/architecture/guest_identity_v1.md`](/architecture/guest_identity_v1.md) | Server-assigned `guest_id`, per-guest event/order attribution |
| Database Schema Map v1 | [`/architecture/database_schema_map_v1.md`](/architecture/database_schema_map_v1.md) | Full current schema reference — session/presence/intelligence tables |
| Production Release Checklist v1 | [`/architecture/production_release_checklist_v1.md`](/architecture/production_release_checklist_v1.md) | Release gates |
| Menu Library Hardening Audit | [`menu-library-hardening-audit-2026-07-03.md`](./menu-library-hardening-audit-2026-07-03.md) | Pre-merge audit for the Menu Library redesign — RLS sweep findings, deterministic resolution verification, owner-scoping decision, builder refactor boundaries. Post-merge follow-ups (RLS recursion fix, category reordering, name uniqueness, Clone Menu/soft-delete) are covered in `spinbite-platform-architecture-v4.md` §4.3, not in this doc. |
| **Order Operations Engine v1** | [`spinbite-order-operations-engine-v1.md`](./spinbite-order-operations-engine-v1.md) | **Design audit, not yet implemented.** Order/item state machines, kitchen stations + KDS, staff roles (new `restaurant_staff` prerequisite), order timeline/analytics, realtime, AI hooks, roadmap. Grounded against competitor research (Toast/Square/Clover/SpotOn/Lightspeed/Revel/Oracle MICROS/Shake Shack) and live schema — flags that `orders.touchpoint_id` doesn't actually exist despite v4 §5.4 claiming it does. |
| Engineering Rules | [`/docs/engineering/claude-engineering-rules.md`](../engineering/claude-engineering-rules.md) | Mandatory engineering rules, numbered up to 66 (non-sequential). Rules 18–25 were found missing 2026-07-07 and restored the same day from a verified memory record; Rules 17, 30, 47–51 remain genuinely missing (flagged, not fabricated). Includes Rule 42 (docs must update with infra changes), Rule 56/57 (verify schema/realtime-publication state live, not just from tracked migrations/RLS), Rule 64/65/66 (session-consistency invariants for randomized/claimed/stale-fetched state) |

**Rule (Rule 42):** any migration, new API route, new engine function, new realtime channel, or RLS policy change touching sessions/presence/intelligence must update the relevant `/architecture/` (root) doc in the same PR. Any change to product decisions, invariants, or the multi-tenant/security model must update `spinbite-platform-architecture-v4.md`.

**Historical / superseded** (kept for reference, not authoritative): `spinbite-platform-architecture-v3.md` (superseded by v4), `spinbite-target-architecture-v2.md` (superseded by v3), `database-map-v1.md` (superseded by `/architecture/database_schema_map_v1.md`), `intelligence-layer-v1.md` (superseded by `/architecture/intelligence_engine_v3.md`).

---

## Quick orientation

SpinBite is a multi-tenant restaurant revenue platform: QR-driven public menu + ordering, a promotion/game engine, session-level behavioral intelligence, and AI content generation. Full product framing lives in `spinbite-platform-architecture-v4.md` §1; this section is just a map of where things live in the repo.

### Repository map

```
app/
├── r/[restaurantSlug]/page.tsx            ← mode-aware public entry point
├── r/[restaurantSlug]/[touchpointCode]/   ← touchpoint-scoped entry point
├── play/[restaurantSlug]/[promotionSlug]/ ← game play
├── admin/
│   ├── menus/                 ← Menu Library (grid + [menuId] builder + [menuId]/assign)
│   ├── promotions/           ← promotion list, create, builder
│   ├── restaurants/          ← Restaurant Directory (grid) + [restaurantId] Workspace (8 tabs, since 2026-07-03)
│   ├── orders/                ← orders inbox
│   ├── sessions/              ← Dining Intelligence: landing (restaurant tiles) + [restaurantId] detail (since 2026-07-02)
│   └── intelligence/          ← AI generation UI
├── super-admin/
│   ├── content/               ← site_content CMS editor
│   └── intelligence-lab/      ← prompt template management
└── api/
    ├── public/{orders,promotion-play,customer-identity,sessions}/
    ├── coupons/issue/
    └── admin/{intelligence,generate-food-image,sessions,validate}/

components/
├── public/RestaurantPublicPage.tsx  ← public menu + promotion surface
├── promotion-builder/
├── layout/{AppShell,AdminSidebar,MobileBurgerMenu,AdminHeader}.tsx
├── home/                      ← marketing homepage sections
└── games/

engine/
├── session-presence/          ← join-session, presence-heartbeat, guest-counter, realtime-channels (this last module is dead/stale code — see Known technical debt below)
└── decision-runtime/          ← runtime.ts (evaluateSession)

lib/
├── games/                     ← canonical game registry + contracts
├── game-pool/                 ← weighted game selection
├── builder/                   ← promotion builder context/reducer
├── rewards.ts                 ← weighted reward pick, coupon codes
├── session-intelligence.ts    ← pure-TS behavioral analysis (V2/V3/V3.1)
├── intelligence/               ← AI content-generation engine + providers
├── navigation.ts               ← admin/super-admin nav source of truth
├── ui-layers.ts                ← centralized z-index
└── supabase/                  ← client/server helpers, generated types

supabase/
├── schema.sql                  ← legacy base schema (some tables here are superseded — see note below)
├── promotion_builder_schema.sql ← defines the live promotion_rewards/coupon_redemptions tables
└── migrations/                 ← ordered incremental migrations (primary source of schema truth)

architecture/                   ← session/intelligence/decision-runtime docs (see map above)
docs/architecture/              ← this index + platform architecture doc + historical docs
docs/engineering/                ← engineering rules
```

> **Setup note:** `supabase/schema.sql` alone is not sufficient to reproduce the live schema — `promotion_rewards` and `coupon_redemptions` (the tables actually used by the promotion/coupon flow) are defined in `supabase/promotion_builder_schema.sql`, not `schema.sql`. Run both, then apply `supabase/migrations/` in order.

### Known technical debt (still open)

- `restaurants` schema also has unused legacy `rewards` and `coupons` tables (0 live rows / no code references) left over from an earlier reward-engine design — superseded by `promotion_rewards` / `coupon_redemptions` but not yet dropped. `guest_sessions` (legacy, superseded by `session_guests`, 14 rows, fully open RLS) is the same category of debt — see the hardening audit doc.
- `app/admin/menus/[menuId]/page.tsx` and `app/admin/promotions/[id]/builder/page.tsx` remain large client-side monoliths with direct Supabase calls rather than server actions — see the hardening audit doc §8 for a mapped-out refactor plan for the former.
- `intelligence_generation_logs` has an open (unused but exploitable) authenticated INSERT policy — see the hardening audit doc §3.
- `api.qrserver.com` external dependency for QR generation — no SLA, privacy consideration; candidate for internalization.
- **(Added 2026-07-07)** `play_sessions`' full DDL — including its `selected_game_type` check constraint — is not fully reconstructable from `supabase/migrations/`; it predates this repo's migration-tracking discipline. Already caused one real incident (see `spinbite-platform-architecture-v4.md` §6.4, Rule 56). Verify this table's constraints live before relying on them.
- **(Added 2026-07-07)** `games.slug = 'pick-a-card'` (`pick_a_card` game type) has a live DB row and a slug mapping but no entry in `lib/games/registry.ts` — flipping it to `active` in Super Admin today would silently mis-render (falls back to Spin Wheel) and fail every play with the same check-constraint class of bug as above. See `spinbite-platform-architecture-v4.md` §6.2.
- **(Added 2026-07-07)** `orders` is still not registered in the `supabase_realtime` publication — the Dining Intelligence landing page's `dining-intelligence-summary` channel has a silent no-op gap on its order-change half, the same failure mode `visit_sessions`/`session_guests` had until this date. See `/architecture/realtime_presence_v1.md` §1.1/§10, Rule 57.
- **(Added 2026-07-07)** `engine/session-presence/realtime-channels.ts` is dead/stale — its own comment claims no channels are wired through it, but this is no longer true anywhere in the app; the real channels are wired ad hoc inline in their consuming components. Either wire the real channels through it or delete it.

For anything not covered here, start at `spinbite-platform-architecture-v4.md`.

# SpinBite Architecture — Documentation Index

**Last updated:** 2026-07-01

SpinBite has two living architecture documentation trees. This page is the index that ties them together — read this first.

## Documentation map

| Doc | Location | Covers |
|---|---|---|
| **Platform Architecture v4** | [`spinbite-platform-architecture-v4.md`](./spinbite-platform-architecture-v4.md) | **Canonical source of truth.** Product decisions, invariants, auth, multi-tenancy, menu, touchpoints, promotions, ordering, security. Mandatory pre-read before any implementation (Rule 26). |
| System Architecture v1 | [`/architecture/spinbite_system_architecture_v1.md`](/architecture/spinbite_system_architecture_v1.md) | Runtime layer map, critical vs. non-critical path, production deployment rules |
| Session Lifecycle v1 | [`/architecture/session_lifecycle_v1.md`](/architecture/session_lifecycle_v1.md) | `SessionPhase` state machine, `visit_sessions`, terminal-state rules |
| Realtime & Presence v1 | [`/architecture/realtime_presence_v1.md`](/architecture/realtime_presence_v1.md) | `session_guests` presence engine, channel contracts, fallback chain |
| Intelligence Engine v3 | [`/architecture/intelligence_engine_v3.md`](/architecture/intelligence_engine_v3.md) | `session_events` behavioral log, per-guest profiling, Session Intelligence V3.1 |
| Decision Engine / Runtime v1 | [`/architecture/decision_engine_v1.md`](/architecture/decision_engine_v1.md), [`decision_runtime_v1.md`](/architecture/decision_runtime_v1.md) | Opportunity detection, intervention types, waiter notification dispatcher |
| Guest Identity v1 | [`/architecture/guest_identity_v1.md`](/architecture/guest_identity_v1.md) | Server-assigned `guest_id`, per-guest event/order attribution |
| Database Schema Map v1 | [`/architecture/database_schema_map_v1.md`](/architecture/database_schema_map_v1.md) | Full current schema reference — session/presence/intelligence tables |
| Production Release Checklist v1 | [`/architecture/production_release_checklist_v1.md`](/architecture/production_release_checklist_v1.md) | Release gates |
| Engineering Rules | [`/docs/engineering/claude-engineering-rules.md`](../engineering/claude-engineering-rules.md) | 46 mandatory engineering rules, including Rule 42 (docs must update with infra changes) |

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
│   ├── menu/                 ← menu builder
│   ├── promotions/           ← promotion list, create, builder
│   ├── restaurants/          ← restaurant profile tabs + touchpoints
│   ├── orders/                ← orders inbox
│   ├── sessions/              ← live session + intelligence panel
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
├── session-presence/          ← join-session, presence-heartbeat, guest-counter, realtime-channels
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

- `menu_sections` table exists (soft-deleted, RLS'd) but the admin menu builder does not yet write to it — the builder still treats flat `menus` rows as "sections." Highest-impact open item.
- `restaurants` schema also has unused legacy `rewards` and `coupons` tables (0 live rows / no code references) left over from an earlier reward-engine design — superseded by `promotion_rewards` / `coupon_redemptions` but not yet dropped.
- `app/admin/menu/page.tsx` and `app/admin/promotions/[id]/builder/page.tsx` remain large client-side monoliths with direct Supabase calls rather than server actions.
- `api.qrserver.com` external dependency for QR generation — no SLA, privacy consideration; candidate for internalization.

For anything not covered here, start at `spinbite-platform-architecture-v4.md`.

# SpinBite Engineering Handbook

_Last updated: 2026-06-15_

SpinBite is an AI-first Restaurant Revenue Operating System. This handbook is the permanent record of SpinBite's architecture, design system, component contracts, and engineering rules. Every engineer — human or AI — must read the relevant sections before modifying any system.

---

## Architecture

| Document | Description |
|----------|-------------|
| [System Map v1](architecture/system-map-v1.md) | Full system architecture — all 12 subsystems, data flows, dependency map |
| [Database Map v1](architecture/database-map-v1.md) | Every table, column, FK, RLS policy, and dangerous schema area |
| [Decision Log v1](architecture/decision-log-v1.md) | 15 permanent product and architecture decisions with full reasoning |
| [AI Engine Roadmap v1](architecture/ai-engine-roadmap-v1.md) | Future AI Revenue Engine concept — goal parser, strategy engine, execution |
| [Target Architecture v2](architecture/spinbite-target-architecture-v2.md) | Locked platform engine map, build sequence, non-goals |

---

## Engineering Rules

| Document | Description |
|----------|-------------|
| [Engineering Rules](engineering/claude-engineering-rules.md) | 16 mandatory rules — audit-before-modify, branch discipline, DB safety, mobile-first |
| [Component Registry](engineering/component-registry.md) | Every shared/canonical component — protected status, blast radius, consumers |
| [Animation Registry](engineering/animation-registry.md) | Every CSS animation — keyframe names, classes, files, dependencies, risk |
| [Technical Debt Audit v1](engineering/technical-debt-v1.md) | Critical/High/Medium/Low debt items with fix recommendations |
| [Entity Registry](engineering/entity-registry.md) | Canonical entity definitions |

---

## Design System

| Document | Description |
|----------|-------------|
| [Design System v1](design/design-system-v1.md) | Colors, gradients, typography, buttons, cards, badges, bottom sheets, spacing |

---

## Security

| Document | Description |
|----------|-------------|
| [Phase A Policy Backup](security/PHASE_A_POLICY_BACKUP.md) | Pre-hardening RLS policy backup |
| [Phase A Validation](security/PHASE_A_VALIDATION.md) | Security hardening Phase A results |
| [Phase B/C1 Risk Analysis](security/PHASE_B_C1_C6_RISK_ANALYSIS.md) | Risk analysis for phases B and C1 |
| [Phase B Customer Data Protection](security/PHASE_B_CUSTOMER_DATA_PROTECTION.md) | Customer data RLS policies |
| [Phase C1 Validation](security/PHASE_C1_VALIDATION.md) | Phase C1 hardening results |

---

## Other Architecture Docs

| Document | Description |
|----------|-------------|
| [Game Creation Framework](architecture/game-creation-framework.md) | How to add a new game type |
| [Game Registry Reconciliation](architecture/game-registry-reconciliation.md) | Registry unification history |
| [Open Door Postmortem](architecture/open-door-postmortem.md) | Lessons from Open The Door game implementation |
| [Architecture Review — Menu Experience](architecture-review-menu-experience.md) | Menu UX architecture review |
| [UX Architecture — Restaurant Experience](ux-architecture-restaurant-experience.md) | Public restaurant page UX architecture |

---

## Quick Reference

### Where is X?

| What | Where |
|------|-------|
| Game visual rendering | `components/game-visuals/GameVisual.tsx` |
| Game type registry | `lib/games/registry.ts` |
| Game contract types | `lib/games/types.ts` |
| Weighted game selection | `lib/game-pool/selectWeightedGame.ts` |
| Session + game resolution | `lib/game-pool/resolvePromotionGame.ts` |
| Public QR menu page | `app/r/[restaurantSlug]/page.tsx` |
| Public menu component | `components/public/RestaurantPublicPage.tsx` |
| Promotion play API | `app/api/public/promotion-play/route.ts` |
| Coupon issue API | `app/api/coupons/issue/route.ts` |
| Customer identity API | `app/api/public/customer-identity/route.ts` |
| All animations | `app/globals.css` |
| Supabase types | `lib/supabase/database.types.ts` |
| Auth middleware | `middleware.ts` |
| Builder context | `lib/builder/context.tsx` |

### Protected Components (Do Not Duplicate)

- `GameVisual.tsx` — game icon rendering
- `RestaurantPublicPage.tsx` — public QR menu
- `GameRuntimeRenderer.tsx` — game dispatch
- `PromotionBuilderShell.tsx` — admin builder
- `CustomerIdentityScreen.tsx` — phone capture
- `HeroImageUploader.tsx` / `MenuItemImageUploader.tsx` — storage path policy

### Key Engineering Rules (Summary)

1. **Audit before modify** — search all imports before touching any shared component
2. **Branch discipline** — every change on a dedicated branch; never commit to main directly
3. **Report first** — document all affected files before writing code
4. **No silent UI refactors** — no structural changes without explicit approval
5. **No DB changes without migration** — never alter schema outside of migrations
6. **Mobile first** — every customer UI is phone-first
7. **Single source of truth** — no duplicate game visuals, no duplicate entity definitions
8. **Brand ≠ Game identity** — `🎯` is SpinBite logo; `getGameVisual()` is for game tiles
9. **Verify production after every merge** — check git SHA + Vercel deployment + runtime

See [Engineering Rules](engineering/claude-engineering-rules.md) for the full 16-rule specification.

---

## Recommended Next Engineering Priorities

Based on the architecture audit (see [Technical Debt v1](engineering/technical-debt-v1.md)):

1. **Fix authentication** — Enable email verification (TD-C1)
2. **Analytics pipeline** — Build `analytics_events` table + tracking (TD-H7, AI-0)
3. **Session table cleanup** — Audit and deprecate `guest_sessions` (TD-H1)
4. **Schema cleanup** — Deprecate `rewards` table; resolve `menu_items.category` (TD-H2, TD-H6)
5. **Commerce Promotion Engine** — Per target architecture, this is the next major feature phase
6. **Communication Engine** — SMS/push/email for customer campaigns (AI-5 prerequisite)

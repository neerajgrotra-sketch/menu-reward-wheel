# SpinBite Engineering Rules

## Rule 1 — Audit Before Modify

Before modifying any component:

- Search entire codebase for all imports
- Identify all dependent screens
- Report all downstream dependencies before editing

Never modify shared components blindly.

---

## Rule 2 — Branch Discipline

Every change requires a dedicated branch.

Examples:

feature/menu-builder-v3
fix/game-animation-regression
docs/architecture-update

Never work directly on main.

---

## Rule 3 — Report First

Before implementing:

Claude must first report:

- files affected
- dependencies affected
- possible regressions
- whether component is shared

No code before audit.

---

## Rule 4 — Shared Components Are Dangerous

Any file inside:

/components

must be treated as shared.

Before editing:

Search:

import ComponentName

across the repo.

---

## Rule 5 — No Silent UI Refactors

Claude must never refactor UI structure unless explicitly asked.

Forbidden:

- changing component hierarchy
- replacing animation systems
- changing shared CSS structure

without approval.

---

## Rule 6 — Database Safety

Before touching Supabase:

Claude must report:

- migrations needed
- affected tables
- RLS impact
- backwards compatibility

No direct schema modifications without approval.

---

## Rule 7 — Architecture Alignment

Before building features:

Claude must read:

/docs/architecture/spinbite-target-architecture-v2.md

All new work must align with target architecture.

No feature may violate architecture.

---

## Rule 8 — Validate Every Branch

Mandatory:

npm run lint
npx tsc --noEmit

Report results before merge.

---

## Rule 9 — Mobile First

Every UI change must be tested for:

- iPhone Safari
- bottom sheet behavior
- keyboard interactions
- viewport zoom
- swipe gestures

Desktop is secondary.

---

## Rule 10 — Preserve Existing UX

Never remove existing working UX unless requested.

If replacing behavior:

show before/after comparison first.

---

## Rule 11 — Minimize Blast Radius

Modify smallest number of files possible.

Avoid touching unrelated systems.

---

## Rule 12 — Audit For Side Effects

Before merge:

Check whether changes affect:

- admin menu builder
- public QR menu
- promotion builder
- game engine
- coupon engine
- authentication
- analytics

Always report possible side effects.

---

## Rule 13 — Single Source of Truth

Core product entities must never have duplicate implementations.

Examples:

- game definitions
- promotion definitions
- menu item state
- coupon state
- customer identity state

If multiple files independently define the same business entity, refactor immediately.

Shared business entities must be centralized.

Forbidden:

- duplicated enum definitions
- duplicated icon maps
- duplicated UI implementations for same entity
- duplicated hardcoded labels

Every core entity must have one canonical source of truth.

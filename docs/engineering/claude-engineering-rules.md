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

---

## Rule 14 — Brand Identity ≠ Game Identity

The SpinBite brand mark (🎯 target emoji) is platform branding only.

Game visuals represent gameplay mechanics.

These are two distinct identity systems and must never be mixed.

**Canonical Spin Wheel visual:**
- 8-segment conic-gradient wheel (45° segments)
- Segments: #FF6B00, #FFD166, #00C853, #E63939, #FF8A00, #FFF0C2, #2DD4BF, #F97316
- Black center hub with SPIN text
- Left-facing pointer (◀)
- Defined in: `components/game-visuals/GameVisual.tsx` → `MiniPrizeWheel`

**Canonical Lucky Reels visual:**
- CSS-only slot machine reel columns
- Gold gradient background
- Three coloured vertical reel panels
- Defined in: `components/game-visuals/GameVisual.tsx` → `MiniRewardReels`

**Forbidden:**
- Using 🎯 as the Spin Wheel game visual in any game card, selector, or marketing tile
- Using 🎰 as the Lucky Reels visual in any game card, selector, or marketing tile
- Using any emoji as a game visual in a game selection or marketing context
- Rendering `spinWheelContract.icon` as a game card visual (contract icons are for compact inline badges and heading text only, not for visual game tiles)

**Permitted uses of 🎯:**
- SpinBite nav logo
- Page headers (`🎯 SpinBite`)
- Inline text badges next to promotion names where no visual canvas exists

**Permitted uses of game contract `.icon` field:**
- Compact promotion badges (e.g. `🎯 Spin Wheel` text label beside promotion name in list views)
- Heading-level text decoration inside builder panels (`{game.icon} {game.name}`)
- These are inline text contexts, not visual game tile contexts

**Always use `getGameVisual()` from `GameVisual.tsx` for:**
- Game selection cards (any surface where customer or operator chooses a game)
- Marketing tiles that represent a specific game
- Any visual icon slot with width/height dimensions allocated for a game image

---

## Rule 16 — Audit ≠ Implementation

A branch containing documentation, audits, analysis, reports, or architectural
recommendations must NEVER be merged assuming functionality changed.

Before any merge, mandatory checklist:

1. Which files changed?
2. Which runtime components changed?
3. Which user-facing behavior changed?
4. What exact bug is fixed?

No code changes = no merge.

A branch that only touches `.md` files fixes nothing in production.
Audit work and fix work are separate branches with separate commits.

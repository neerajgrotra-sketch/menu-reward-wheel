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

/docs/architecture/spinbite-platform-architecture-v3.md

All new work must align with target architecture.

No feature may violate architecture.

---

## Rule 26 — Mandatory Architecture Pre-Audit (Platform Invariant #11)

No AI session, Claude session, engineer, or developer may implement:

- Architecture changes
- New features
- Schema modifications
- New API routes
- Security decisions
- Capability flags
- Restaurant configuration changes

Without first reading in full:

```
docs/architecture/spinbite-platform-architecture-v3.md
```

All implementation decisions must remain consistent with:

- Multi-tenant ownership model (`owner_id` is always explicit at insert time)
- Security boundaries (service role stays server-side; no open RLS on platform tables)
- Provider abstraction rules (prompts in DB; provider is data not code)
- Capability model (all capabilities are per restaurant, never global)
- All 11 platform invariants in the Appendix of the architecture document

This document is the single source of truth.

If a proposed change conflicts with the architecture document:

1. Stop.
2. Report the conflict explicitly.
3. Do not proceed until the conflict is resolved via an explicit architecture decision.
4. Update the architecture document before implementing.

No exception for urgency. No exception for "small" changes.

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

## Rule 15 — Verify Production After Every Merge

After merging to main, confirm the change is live across three layers before closing the task.

**Layer 1 — Git**
Confirm commit exists on origin/main:

```
git log origin/main --oneline -3
```

**Layer 2 — Vercel**
Confirm latest production deployment SHA matches the merged commit.
A READY state alone is not enough — the SHA must match.

**Layer 3 — Runtime**
Visit the production URL and verify the changed UI is visible.

Never report a task as complete until all three layers confirm.

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

---

## Rule 27 — Never Expose Developer Artifacts to Restaurant Users

Developer identifiers must never appear in the restaurant admin or customer-facing UI.

Prohibited:
- `#{index + 1}` position badges
- URL slug display (e.g. `/my-restaurant`)
- "Copy Link" developer utilities in the main action bar
- Internal IDs, UUIDs, or database row identifiers
- Technical column names used as labels

Permitted:
- Human-readable location info (name, address, city)
- Business-relevant identifiers (phone, website)
- Status information meaningful to the restaurant owner

If a restaurant owner would not naturally use a term in conversation, it must not exist in the UI.

---

## Rule 28 — Disabled Configurations Must Be Visibly Disabled

Any configuration option that does not fully alter system behavior must be clearly marked as unavailable.

Requirements:
- `opacity-60` on the disabled card/control
- `cursor-not-allowed` on click areas (never `pointer-events-none` — keeps them interactive)
- A visible "Coming Soon" badge on the card
- A toast on click: `"Coming soon — this mode will be available in a future update."`
- An explanatory note if the user currently has that configuration saved

Never silently accept a setting that won't be enforced. Disabled without interaction feedback feels broken.

---

## Rule 29 — Admin Editing Screens Must Mirror the Customer-Facing Storefront

The restaurant management page must visually match the geometry and layout of the public customer menu page.

Requirements:
- Hero image: same height (`h-64`), same gradient, full-width
- Info card: same `-mt-8 rounded-t-3xl bg-white shadow-xl` overlap
- Logo: same position (`absolute -top-10 left-5 h-20 w-20 rounded-2xl`)
- Restaurant name: same typography (`text-2xl font-black` or `text-3xl font-black`)
- Address: same `📍` prefix and `text-sm text-stone-500` treatment

When the public page layout changes, the admin card header must be updated to match.
The admin card is a live editable preview — not a separate design.

---

## Rule 58 — Menu Item Visual Metadata Must Obey Explicit Badge Hierarchy Priority

Menu item cards have a fixed badge slot system. Each slot holds exactly one badge. Priority order:

**Image overlay — left slot:** Sold Out (suppressed entirely) > On Special > Chef Special > Popular > none

**Image overlay — right slot:** Featured (suppressed when On Special is active)

**Metadata row below title:** Renders Featured / Chef / Popular as lightweight text when On Special occupies the left slot. Suppressed entirely when Sold Out.

Do not add new badges outside this hierarchy without first updating this rule and the `leftBadge` priority enum in `MenuItemCard`.

---

## Rule 59 — Only One Commercial Badge May Occupy Each Image Overlay Position

Each image overlay position (top-left, top-right) holds exactly one badge at a time.

Never stack two badges in the same position. Never introduce a third overlay position without an explicit architecture decision and update to Rule 58.

If a future dietary or promotional badge needs to appear, assign it to the metadata row below the title — not the image overlay.

---

## Rule 60 — Hard Item State Changes Override All Metadata Rendering

Hard state changes (Sold Out, Deleted, Unavailable) must suppress all commercial and promotional metadata.

When `available = false`:
- All image overlay badges are suppressed at the DOM level (not just visually covered)
- The metadata row below the title is suppressed
- The Sold Out overlay renders over the image
- The card is `opacity-60` and `cursor-default`

Sold Out is not a promotional state. It must dominate all promotional rendering.
Any future hard state (e.g. "Coming Soon", "Temporarily Unavailable") must follow the same suppression pattern.

---

## Rule 61 — Menu Cards Must Maintain Deterministic Height Regardless of Metadata Quantity

Every menu item card uses five fixed vertical zones:

- Zone 1: Image — `h-28` (fixed)
- Zone 2: Item Name — `line-clamp-2 min-h-[48px]`
- Zone 3: Metadata Pills — `min-h-[40px] max-h-[40px] overflow-hidden`
- Zone 4: Description — `min-h-[42px]` container with inner `line-clamp-2`
- Zone 5: Price Row — single line

No zone may resize based on content. All height is reserved even when content is absent.

---

## Rule 62 — Metadata Rendering May Never Alter Card Grid Alignment

Zone 3 (metadata pills) is always rendered in the DOM with fixed `min-h` and `max-h`.

It must never be conditionally mounted or unmounted based on whether tags exist.

`overflow-hidden` on Zone 3 is mandatory — it prevents future dietary tags from expanding the zone.

Any new tag type must be added to Zone 3 as a pill. No new zones may be introduced without updating Rule 61.

---

## Rule 63 — Promotional Badges Must Obey Strict Tier Hierarchy

Three tiers. Each tier has explicit constraints:

**Tier 1 — Image Overlay Left:** Discount only. One badge maximum. Suppressed when Sold Out.

**Tier 2 — Image Overlay Right:** Featured only. One badge maximum. Suppressed when Sold Out or when Discount is active (Featured moves to Zone 3).

**Tier 3 — Zone 3 Pills Row:** Chef Special, Popular, and all dietary tags (Vegetarian, Vegan, Halal, Kosher, Gluten Free, Spicy, Kids Friendly). Also receives Featured when Discount is in Tier 1. Unlimited count, capped by Zone 3 max-height.

Discount badges use `bg-emerald-500` (green = savings signal). Brand orange (`#FF6B00`) is reserved for SpinBite platform identity only and must never be used for promotional discount UI.

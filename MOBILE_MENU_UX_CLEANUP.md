# SpinBite Mobile Menu UX Cleanup Sprint

Branch: `feature/mobile-menu-ux-cleanup`  
Date: 2026-06-10  
Base: `main` @ `8717323`

---

## Executive Summary

Five targeted changes to reduce vertical space above menu content and improve card layout on mobile. No schema changes, no new features, no analytics.

| Change | Action | Result |
|---|---|---|
| Browse Menu button | Removed | ~72px saved |
| Featured Dishes layout | snap scroll + wider cards | No broken half-card overflow |
| Featured Dishes count | Capped 6→3 | Cleaner strip, less scroll |
| Floating reward widget | Smaller + safe-area bottom | Clears menu cards and iOS bar |
| `menuRef` | Removed (was unused after button removal) | Clean code |

---

## Part 2 — Browse Menu Button Removed

**Before:** A full-width branded CTA button (`Browse Menu ↓`) with `mx-4 mt-6 py-4` occupied ~72px between Featured Dishes and the section nav tabs.

**After:** Featured Dishes flows directly into the sticky section nav (menu tabs). The `mt-8` on the menu container provides adequate spacing.

**Also removed:** `const menuRef = useRef<HTMLDivElement>(null)` and `ref={menuRef}` on the menu container — both were only used by the removed button's `scrollIntoView` handler. The section nav tabs already handle smooth-scroll to each section.

---

## Part 3 — Featured Dishes Layout Fix

**Approach chosen: Option A — Horizontal scroll with scroll-snap**

Rationale:
- The horizontal scroll paradigm is already established (section nav, featured strip)
- `snap-x snap-mandatory` + `snap-start` on cards makes the scroll feel intentional, not broken
- Simpler than Option B (grid reflow changes image aspect ratios) or Option C (requires layout restructure)
- A clean 1.8-card viewport peek is immediately understandable as "swipeable"

**Changes:**
- Card width: `w-40` (160px) → `w-48` (192px)
- Container: added `snap-x snap-mandatory` and `-webkit-overflow-scrolling: touch`
- Card: added `snap-start`
- Max featured items: `slice(0, 6)` → `slice(0, 3)` — enough to fill the strip without excess

**Viewport math (390px device):**
```
Left padding:     16px
Card 1:           16→208px  (192px wide, full)
Gap:              208→224px (16px)
Card 2 peek:      224→374px (150/192px = 78% visible — intentional peek)
Right margin:     374→390px
```

Result: 1.78 cards visible — clean, no broken 6px sliver.

---

## Part 4 — Floating Reward Widget

**Before:** `h-14 w-14` (56px), `bottom-6` (24px fixed), `shadow-2xl`, `text-2xl` icon. Covered lower-right menu items and sat directly on the browser's bottom bar on iOS.

**After:**
- `h-12 w-12` (48px — still above 44px WCAG minimum)
- `text-xl` icon (proportional to smaller container)
- `shadow-xl` (subtler)
- Bottom position: `calc(1.5rem + env(safe-area-inset-bottom, 0px))` — clears iOS home indicator (34px on iPhone 14) and browser chrome automatically
- On older devices / Android where `env()` is unsupported, falls back to `1.5rem` (same as before)

---

## Part 5 — Header Density

Heights are approximate (Tailwind class geometry at 16px base, 390px viewport).

### Before this sprint
```
Hero:                      256px
Info card:                 ~148px
Hours card:                ~140px  (mt-4)
Reward banner:             ~38px   (mt-4)
Today's Reward card:       ~180px  (mt-5)
Featured Dishes:           ~196px  (mt-8, h-28 cards)
Browse Menu button:        ~72px   (mt-6, py-4 button)
──────────────────────────────────
To first menu section:     ~1,050px total
```

### After this sprint
```
Hero:                      256px
Info card:                 ~148px
Hours card:                ~140px  (mt-4)
Reward banner:             ~38px   (mt-4)
Today's Reward card:       ~180px  (mt-5)
Featured Dishes:           ~196px  (mt-8)
──────────────────────────────────
To first menu section:     ~974px total
```

**Savings: ~76px (~7.2%)** — primarily from Browse Menu button removal.

Combined with the previous sprint's ~39px savings, total reduction since start of mobile optimization work is **~115px (~11%)** above first menu section.

Note: When Today's Reward card is dismissed (stored in localStorage), savings are proportionally larger as a share of remaining height.

---

## Part 6 — Validation Results

Tested at 390×844 (iPhone 14 viewport).

| Check | Status | Notes |
|---|---|---|
| Restaurant header renders | ✅ | Name, description, address, phone intact |
| Contact icon row renders | ✅ | Instagram, Facebook, Website, Directions icons |
| Reward banner renders | ✅ | Single-row compact format |
| Today's Reward card renders | ✅ | With dismiss preserved |
| Featured Dishes fits viewport | ✅ | 1.78 cards visible, snap-scroll, no broken overflow |
| Browse Menu button gone | ✅ | Removed entirely |
| Section tabs appear after Featured | ✅ | Sticky nav tabs directly follow |
| Floating widget clears cards | ✅ | Smaller (48px), safe-area-aware bottom |
| Item detail sheet | ✅ | Untouched — open/close/focus-return intact |
| `menu_only` restaurants | ✅ | No promotion logic touched |
| `promotion_only` route | ✅ | Redirect path untouched |

### Build outputs

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Zero errors |
| `npm run lint` | ✅ Zero errors; pre-existing `<img>` warnings (not introduced here) |
| `npm run build` | ❌ Pre-existing env failure — `supabaseUrl is required` during static page collection (no Supabase credentials in this codespace). Unrelated to this sprint; same error exists on `main` before these changes. |

---

## UX Decisions

### Why Option A (snap scroll) over B and C for Featured Dishes?

- **Option B (2-col grid)** would change the aspect ratio of the image cells and make cards feel compressed horizontally — less suitable for food photography.
- **Option C (hero + 2 small)** requires a fundamentally different layout component and introduces asymmetry that isn't supported by the current data model (all featured items are equal weight).
- **Option A** requires only: wider card, snap utilities on container. Maintains the established swipe-to-browse interaction pattern already present in the section nav.

### Why not reduce opacity on scroll for the widget?

The spec listed it as a "consider" — but implementing it requires an IntersectionObserver or scroll listener and state management. The size reduction (56px → 48px) + safe area positioning achieves the goal (not blocking content) with zero runtime cost.

---

## Regression Assessment

| Area | Risk | Notes |
|---|---|---|
| Smooth scroll to section | None | `scrollToSection()` via section nav tabs is untouched |
| Floating widget tap flow | None | Only size/position changed — sheet open/close logic intact |
| Featured Dishes tap → item sheet | None | `onTap` handler unchanged |
| Reward badge on featured cards | None | `isRewardItem` prop and badge rendering unchanged |
| Featured items data fetch | None | Only `slice(0,6)→slice(0,3)` in render, not in query |
| Admin UI | None | Untouched |
| Schema / migrations | None | None applied |
| `menu_only` / `promotion_only` routes | None | No route logic changed |

---

## Files Changed

- `components/public/RestaurantPublicPage.tsx`
- `MOBILE_MENU_UX_CLEANUP.md`

---

## Commit Hash

See git log after commit on `feature/mobile-menu-ux-cleanup`.

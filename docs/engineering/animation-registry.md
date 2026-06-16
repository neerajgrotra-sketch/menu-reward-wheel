# SpinBite Animation Registry

_Audit date: 2026-06-15_

All animations are defined in `app/globals.css` and applied via CSS class names in component JSX. No inline `keyframes` exist inside component files. This registry is the canonical list of all animations in the SpinBite frontend.

---

## Game Selector Mini Icon Animations

These animate the game type selection icons shown in the promotion builder and game selection UI.

---

### spinbiteMiniWheelSpin

**Keyframe name:** `spinbiteMiniWheelSpin`  
**CSS class:** `.spinbite-mini-wheel` (normal) / `.spinbite-mini-wheel-fast` (boosted)  
**File:** `app/globals.css` lines 39–44  
**Used by:** `MiniPrizeWheel` in `components/game-visuals/GameVisual.tsx`

**Purpose:** Continuously rotates the mini spin wheel. Normal speed: 3.2s with cubic-bezier easing that mimics a spin-and-slow. Fast speed: 0.28s linear infinite (used when `boosted=true`).

**Animation curve:** 0° → 760° at 55% (overshoot), holds at 55%–70%, completes to 1080°. Gives the illusion of variable spin speed.

**Protected:** YES — canonical wheel animation. Changing easing will break the brand feel of all game selector UIs.

**Dependencies:** `MiniPrizeWheel` component; referenced by class name so globals.css must be loaded.

**Reduced motion:** Disabled via `@media (prefers-reduced-motion: reduce)` block. All four mini-icon animations are disabled together.

---

### spinbiteMysteryBoxBounce

**Keyframe name:** `spinbiteMysteryBoxBounce`  
**CSS class:** `.spinbite-mini-mystery-box`  
**File:** `app/globals.css` lines 47–50  
**Used by:** `MiniMysteryBox` in `components/game-visuals/GameVisual.tsx`

**Purpose:** Gently bounces and wiggles the mystery box icon with a subtle lift and orange glow shadow. 2.4s ease-in-out infinite.

**Key beats:** 0%/100% resting; 35% lifts up −5px, rotates −3°, scales 1.04, adds orange glow; 65% bounces down +1px, rotates +3°.

**Protected:** YES — part of the canonical game visual system.

**Risk if modified:** Visual personality of mystery box selection card in all game selection UIs.

---

### spinbiteScratchCardPulse + spinbiteScratchSweep

**Keyframe names:** `spinbiteScratchCardPulse`, `spinbiteScratchSweep`  
**CSS class:** `.spinbite-mini-scratch-card` (pulse) + `::after` pseudo-element (sweep)  
**File:** `app/globals.css` lines 52–62 (keyframes), 76–90 (classes)  
**Used by:** `MiniScratchCard` in `components/game-visuals/GameVisual.tsx`

**Purpose:**  
- `ScratchCardPulse` — card gently rocks and saturates (2.2s ease-in-out infinite)  
- `ScratchSweep` — white shimmer line sweeps across the card surface via `::after` pseudo-element (1.8s ease-in-out infinite)

**Protected:** YES — scratch card shimmer is a key part of the engagement visual identity.

**Risk if modified:** Shimmer relies on the component having `position: relative; overflow: hidden`. If the wrapper loses those, the shimmer breaks.

---

## Reward Banner Animations

Used in the promotion widget / reward banner on the public QR menu page.

---

### spinbiteBannerSpin

**Keyframe name:** `spinbiteBannerSpin`  
**CSS classes:** `.spinbite-banner-icon-spin` (slow) / `.spinbite-banner-icon-spin-fast` (fast)  
**File:** `app/globals.css` lines 105–118  
**Used by:** `RestaurantPublicPage.tsx` — reward widget floating button game icon

**Purpose:** Continuously rotates the game icon in the reward banner. Slow: 11s linear infinite. Fast: 0.75s linear infinite (used when promotion is "boosted").

**Protected:** YES — changes affect the public-facing promotion widget on every active QR menu.

---

### spinbiteBannerPulse

**Keyframe name:** `spinbiteBannerPulse`  
**CSS class:** `.spinbite-banner-icon-pulse`  
**File:** `app/globals.css` lines 109–113  
**Used by:** `RestaurantPublicPage.tsx` — reward widget game icons that don't spin (mystery box, scratch card, etc.)

**Purpose:** Subtle scale pulse with a white drop shadow glow. Beats at 93% of a 9s cycle — very subtle "breathing" effect so static icons aren't lifeless.

**Protected:** YES — modifying this changes the feel of the entire public reward widget.

---

## Reward Widget Button Animation

---

### spinbiteRewardPulse

**Keyframe name:** `spinbiteRewardPulse`  
**CSS class:** `.reward-pulse-btn`  
**File:** `app/globals.css` lines 26–32  
**Used by:** Reward widget floating CTA button in `RestaurantPublicPage.tsx`

**Purpose:** Expanding white ring pulse on the floating "Play Now" button. Ring expands from 0 → 10px radius then fades. Creates a "tap me" affordance.

**Protected:** YES — this is the primary engagement CTA on the public menu page.

**Reduced motion:** Disabled with `animation: none !important` on `.reward-pulse-btn`.

---

## CSS Structural Overrides (globals.css)

These are not animations but are critical global CSS rules in `app/globals.css`.

---

### Promotion Builder Hero Panel Hide

```css
section.bg-gradient-to-br.from-[#FF6B00].to-[#E63939] .bg-white\/15.p-3 {
  display: none;
}
```

**Purpose:** Hides the duplicated promotion URL panel inside the orange builder hero section. Keeps the copy link button visible at the top.

**Risk:** This selector is brittle — it relies on Tailwind class names in the DOM. If the builder hero markup changes, the rule silently stops working.

---

### Menu Builder Hero Panel Hide

```css
section.mx-auto.max-w-5xl > .bg-gradient-to-br.from-[#FF6B00].to-[#E63939] .bg-white\/15.p-4 {
  display: none;
}
```

**Purpose:** Hides the duplicated selected-location panel inside the menu builder hero. Step 1 (location selector) is the source of truth.

**Risk:** Same brittleness as above — Tailwind class selector is fragile.

---

## Base Styles

```css
:root { color-scheme: light; }
body { margin: 0; background: #fff7ed; }
* { box-sizing: border-box; }
```

**`background: #fff7ed`** — this is the global page background (warm off-white / cream). All pages inherit this unless overridden. Changing it changes the appearance of every page.

---

## Reduced Motion Policy

All animations respect `@media (prefers-reduced-motion: reduce)`. The following classes are disabled:

- `.spinbite-mini-wheel`
- `.spinbite-mini-wheel-fast`
- `.spinbite-mini-mystery-box`
- `.spinbite-mini-scratch-card` and its `::after`
- `.spinbite-banner-icon-spin`
- `.spinbite-banner-icon-spin-fast`
- `.spinbite-banner-icon-pulse`
- `.reward-pulse-btn`

**Rule:** Every new animation added to globals.css MUST have a corresponding reduced-motion override.

---

## Tailwind Animations

No custom Tailwind animation utilities are registered in `tailwind.config.ts`. The only Tailwind extension is:

```ts
boxShadow: { glow: '0 20px 60px rgba(251, 146, 60, 0.25)' }
```

This provides a warm orange glow shadow utility class (`shadow-glow`) used on hero cards and feature tiles.

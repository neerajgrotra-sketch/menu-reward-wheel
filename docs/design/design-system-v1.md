# SpinBite Design System v1

_Audit date: 2026-06-15_  
_Source of truth: `tailwind.config.ts`, `app/globals.css`, `components/public/RestaurantPublicPage.tsx`, `components/game-visuals/GameVisual.tsx`_

---

## Color System

### Platform Colors (SpinBite Brand)

These are SpinBite's own product identity colors. They appear in admin UI, the builder, the homepage, and all platform chrome.

| Token | Hex | Usage |
|-------|-----|-------|
| **Primary Orange** | `#FF6B00` | Primary CTA, hero gradients, builder header, navigation |
| **Deep Orange** | `#E63939` | Gradient endpoint, danger states |
| **Warm Orange** | `#FF8A00` | Hover states, intermediate gradient stops |
| **Gold** | `#FFD166` | Wheel segment, reward highlight |
| **Cream** | `#FFF0C2` | Wheel segment, light reward |
| **SpinBite Green** | `#00C853` | Win/success states, wheel segment |
| **Teal** | `#2DD4BF` | Wheel segment accent |
| **Tangerine** | `#F97316` | Wheel segment, Tailwind orange-500 |

### Page Background

| Token | Hex | Applied to |
|-------|-----|-----------|
| **Warm White** | `#fff7ed` | `body` in `globals.css` — universal page background |

### Restaurant Brand Colors (Per-Restaurant)

Each restaurant can configure three brand colors stored in the `restaurants` table:

| Field | Purpose |
|-------|---------|
| `brand_color` | Primary brand color — drives hero gradient, CTA buttons, filter chip active state |
| `accent_color` | Tag pills, badge backgrounds |
| `secondary_color` | Secondary surface — currently used for gradient endpoint tints |

**Default fallback:** `brand_color` defaults to `#FF6B00` (SpinBite orange) if null.

**Color computation in RestaurantPublicPage:** The `darken()` utility (defined inline in the component) adjusts brand color by subtracting from RGB channels — used for hover and gradient endpoint states.

---

## Gradient System

### Primary Hero Gradient

```
linear-gradient(135deg, {brand_color}, darken({brand_color}, 30))
```

Used on: QR menu hero banners, promotion builder headers, admin hero sections.

### SpinBite Platform Gradient

```
from-[#FF6B00] to-[#E63939]
```

Tailwind utility pair. Used on: admin hero sections, builder orange header, CTA sections on marketing pages.

### Mystery Box Gradient

```
linear-gradient(135deg, #FF6B00, #E63939)  /* body */
linear-gradient(135deg, #FF8A00, #E63939)  /* lid */
```

### Scratch Card Gradient

```
linear-gradient(135deg, #fb923c 0%, #fbbf24 50%, #ef4444 100%)
```

### Open The Door Gradient

```
linear-gradient(168deg, #8a5c2e, #4a2c10)
```

---

## Typography Hierarchy

SpinBite uses Tailwind's default font stack (system sans-serif). No custom typeface is loaded.

| Level | Tailwind Class | Usage |
|-------|---------------|-------|
| Hero headline | `text-3xl font-black` | Restaurant name in QR menu hero |
| Section heading | `text-xl font-bold` | Section names in admin and menu |
| Card title | `text-base font-semibold` | Menu item names, promo names |
| Body | `text-sm` | Descriptions, body copy |
| Caption | `text-xs` | Tags, badges, meta info |
| Micro | `text-[10px]` / `text-[11px]` | Game icon labels (SPIN hub label) |

**Font weights used:** 400 (normal), 600 (semibold), 700 (bold), 800 (extrabold), 900 (black)

---

## Button Styling System

### Primary CTA Button (Orange)

Used for: Play Now, Create Promotion, Save, Publish.

```
bg-[{brand_color}] text-white font-bold rounded-xl px-6 py-3
hover: darken brand color
active: scale-95
```

Platform buttons use Tailwind classes directly inline — no shared `Button` component exists.

### Secondary Button (White/Outline)

```
bg-white/20 text-white font-semibold rounded-xl px-4 py-2
border border-white/30
```

Used on hero sections with colored backgrounds.

### Destructive Button (Red)

```
bg-red-600 text-white font-semibold rounded-xl
```

Used for: End Promotion, Delete.

### Ghost Button

```
text-{brand_color} font-semibold underline
```

Used for: secondary actions, "Not Now" on identity screen.

---

## Card Styling System

### Menu Item Card

Rounded corners (`rounded-xl`), white background (`bg-white`), soft shadow (`shadow-sm`). Image on top, name + price body.

### Admin Card / Panel

White background, border (`border border-stone-200`), rounded corners (`rounded-xl`), padding (`p-4` or `p-6`).

### Game Selection Card

Orange border on hover/selected state. Contains game visual, game name, and description. Large touch target for mobile.

### Promotion Card

Status badge (Active green / Draft gray / Ended red). Displays promotion name, game type, date range.

---

## Badge System

### Status Badges

| Status | Color |
|--------|-------|
| Active | Green (`bg-green-100 text-green-800`) |
| Draft | Gray (`bg-stone-100 text-stone-600`) |
| Ended | Red (`bg-red-100 text-red-700`) |
| Beta | Orange (`bg-orange-100 text-orange-700`) |

### Merchandising Tag Pills (Public Menu)

Displayed on menu items. Styled with restaurant `accent_color`:

```
bg-[{accentColor}1a] color: {accentColor}
rounded-full px-3 py-1 text-xs font-bold
```

The `1a` hex suffix = 10% opacity tint of accent color.

### Chef Special / Popular / Featured Tags

Stored in `menu_items.tags` as string array. Rendered as tag pills using the accent color tint system above.

---

## Border Radius Conventions

| Context | Radius |
|---------|--------|
| Cards, panels | `rounded-xl` (12px) |
| Buttons | `rounded-xl` (12px) |
| Small badges | `rounded-full` |
| Input fields | `rounded-lg` (8px) |
| Game icons | `rounded` (4px) or `rounded-full` |
| Bottom sheet | `rounded-t-3xl` on top edge only |

---

## Bottom Sheet Design Rules

Used for: item detail overlay on the public menu; admin confirmation dialogs; mobile-first action sheets.

1. `rounded-t-3xl` — only the top two corners are rounded
2. White background (`bg-white`)
3. Handle indicator bar at top (`w-12 h-1 bg-stone-200 rounded-full mx-auto mb-4`)
4. Fixed positioned, slides up from bottom on mobile
5. Max height: `max-h-[85vh]` with internal scroll
6. Backdrop: semi-transparent dark overlay (`bg-black/40`)
7. Animation: `translateY(100%) → translateY(0)` slide-up

---

## Mobile-First Spacing System

SpinBite is designed primarily for phone screens (the QR scan use case).

| Breakpoint | Usage |
|-----------|-------|
| Default (mobile) | Base styles — single column, comfortable touch targets |
| `sm:` (640px+) | Rare; tablet adjustments |
| `lg:` (1024px+) | Admin builder two-column grid |

**Touch targets:** Minimum 44×44px for all interactive elements per mobile-first rule.

**Safe areas:** Bottom content should account for iOS home bar (`pb-safe` or `pb-8`).

**Viewport:** Zoom is allowed (no `user-scalable=no`). Respect font size accessibility.

---

## Icon System

SpinBite uses **Lucide React** for admin UI icons. No custom icon system.

Game visuals are **CSS-only custom components** — never emoji in visual tile contexts. See `components/game-visuals/GameVisual.tsx` and Engineering Rule 14.

**Emoji permitted in:**
- SpinBite nav logo (`🎯 SpinBite`)
- Page titles where no visual canvas
- Inline text labels in compact badge contexts

**Emoji forbidden in:**
- Game selection cards
- Marketing tiles showing game type
- Any element with allocated width/height for a game image

---

## Shadow System

| Tailwind | Value | Usage |
|----------|-------|-------|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Card surfaces |
| `shadow-md` | Standard medium | Game icon wheels |
| `shadow-glow` | `0 20px 60px rgba(251, 146, 60, 0.25)` | Feature hero sections, marketing |

The custom `shadow-glow` is defined in `tailwind.config.ts`.

---

## Spin Wheel Visual Specification

The canonical 8-segment wheel (see Engineering Rule 14):

| Segment | Degrees | Color | Hex |
|---------|---------|-------|-----|
| 1 | 0–45° | SpinBite Orange | `#FF6B00` |
| 2 | 45–90° | Gold | `#FFD166` |
| 3 | 90–135° | Green | `#00C853` |
| 4 | 135–180° | Red | `#E63939` |
| 5 | 180–225° | Warm Orange | `#FF8A00` |
| 6 | 225–270° | Cream | `#FFF0C2` |
| 7 | 270–315° | Teal | `#2DD4BF` |
| 8 | 315–360° | Tangerine | `#F97316` |

Center hub: `#1F1F1F` (near black), white `SPIN` label at 14% of wheel size.  
Pointer: `◀` in `text-stone-800`, positioned at right center, `z-20`.

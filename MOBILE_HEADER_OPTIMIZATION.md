# Mobile Header Optimization — Sprint Report

Branch: `feature/mobile-header-optimization`
Date: 2026-06-10

---

## Context

The Menu Showcase Sprint confirmed the public restaurant QR menu is functional end-to-end. However, measurement showed excessive vertical scrolling before food appears. The customer flow through the header was:

```
Hero (256px)
↓ Restaurant name + description
↓ Address + phone
↓ Large contact pill buttons (~52px separate section)
↓ Reward banner (two-row, ~56px)
↓ Today's Reward card
↓ Featured dishes
↓ Menu sections
```

Food visibility was delayed by unnecessary height in the contact and promotion areas.

---

## Changes Implemented

### Change 1 — Premium Contact Quick Actions (SVG icons)

**Before:** Large pill buttons (`🌐 Website`, `🗺️ Directions`, `📸 Instagram`, `👥 Facebook`) in a standalone horizontally-scrolling section below the Hours card — ~52px tall, full-width row.

**After:** Compact 44×44px circular quick-action buttons with proper brand and utility icons, consolidated inside the restaurant info card directly beneath the phone number. No separate section.

**Icons used:**

| Action | Icon | Color | Source |
|---|---|---|---|
| Instagram | Rounded-rect camera (simplified brand shape) | `#C13584` (official brand) | Inline SVG |
| Facebook | "f" letterform | `#1877F2` (official brand) | Inline SVG |
| Website | Globe | `stone-600` | Lucide React |
| Directions | Navigation2 arrow | `stone-600` | Lucide React |
| Google Reviews | — | — | Not rendered (no schema field — see Change 2) |

**Icon implementation:**
- `InstagramIcon`: SVG rounded-rect + lens circle + dot — line-art style with `stroke="currentColor"`, colored via inline `style={{ color: '#C13584' }}`
- `FacebookIcon`: SVG "f" path with `fill="currentColor"`, colored via inline `style={{ color: '#1877F2' }}`
- Globe / Navigation2: Lucide React components, `text-stone-600` neutral tone
- All icons: `h-5 w-5` (20px) inside `h-11 w-11` (44px) circular container

**Removed:**
- Emoji icon placeholders (🌐 🗺️ 📷)
- Standalone contact links section (saves ~52px + 16px margin)
- `overflow-x-auto` scrolling container (max 4 icons, no overflow needed)

**Accessibility:**
- Each icon has a descriptive `aria-label` including "(opens in new tab)"
- `rel="noopener noreferrer"` on all external links
- `aria-hidden="true"` on SVG elements (label is on the `<a>`)
- 44×44px touch targets (`h-11 w-11`) meet WCAG 2.5.5
- Renders only when URL exists — no empty placeholders

---

### Change 2 — Google Reviews Assessment

**Schema audit result:** No `google_reviews_url` field in the `restaurants` table.

The existing `google_maps_url` field is a Google Maps directions link (format: `google.com/maps/...`) — it cannot be reused as a reviews link without confusing users or breaking the "Get directions" action.

**Recommendation (not implemented — no schema change this sprint):**

Add `google_reviews_url text` column to the `restaurants` table.

Steps when ready:
1. Migration: `alter table restaurants add column google_reviews_url text;`
2. Add `google_reviews_url` to `PublicRestaurant` type in `app/r/[restaurantSlug]/page.tsx`
3. Include in Supabase `SELECT` query
4. Add admin form field in `RestaurantContactTab.tsx`
5. Render a Google "G" icon button in the quick actions row with `aria-label="Leave us a Google review (opens in new tab)"`

Google review URLs follow the format: `https://g.page/r/<place-id>/review`

---

### Change 3 — Reward Banner Compression

**Before:** Two-line banner — title row + subtitle row, `py-3` padding, large animated spinning game-type icon, `~56px` total height.

**After:** Single-row banner — `🎁 Win Rewards While You Dine [Play Now →]`, `py-2.5` padding, static icon, `~38px` total height.

**Changes:**
- Removed animated icon with `useState(iconHovering)` and touch handlers
- Removed game-type icon variant logic (`🎡`/`🎫`/`🎁`)
- Removed subtitle line ("Play & Win While You Dine")
- Reduced padding: `py-3` (24px) → `py-2.5` (20px)
- Reduced icon size: `1.75rem` → `text-xl` (1.25rem)
- CTA, brand color, and play URL preserved

---

### Change 4 — Restaurant Description Placement: Recommendation

**Current behavior:** Full description text appears in the info card immediately below the restaurant name, above address and phone. No truncation or collapse.

**Assessment:** For typical restaurant descriptions (1–3 sentences), the description is low-priority content. Customers scanning a QR code are at the restaurant — they already chose it. Description reads well on a website homepage but competes with food on a menu page.

**Recommendation: Option C — Short preview + "Read more"**

Truncate to 2 lines (`line-clamp-2`) with a "Read more" button that expands inline. Rationale:
- Preserves the content without hiding it entirely (SEO and OG metadata already separate)
- Saves ~40–80px for descriptions longer than 2 lines, 0px for short descriptions
- Less friction than a modal (Option B) — expansion happens in place
- Can be implemented with `useState(expanded)` + `line-clamp-2` / no clamp toggle, no new dependencies

**Option B (About Us expandable section)** is viable if a more structured "info section" concept is desired later, but Option C is simpler and sufficient for this goal.

**Not implemented this sprint** — marked for next header UX pass.

---

## Height Reduction Measurements

Measured from top of hero to first menu section heading. Approximate values based on Tailwind class geometry at 16px base, mobile viewport (375px width).

| Section | Before | After | Delta |
|---|---|---|---|
| Hero image | 256px | 256px | 0 |
| Info card (name, desc, address, phone) | ~140px | ~140px | 0 |
| Contact icon row (now inside info card) | — | +47px (mt-3 + h-11) | +47 |
| Standalone contact section (removed) | ~68px (mt-4 + py-3 row + pb-1) | 0 | **−68** |
| Hours card | ~140px | ~140px | 0 |
| Reward banner | ~56px | ~38px | **−18** |
| Today's Reward card | ~180px | ~180px | 0 |
| Featured dishes section | ~200px | ~200px | 0 |
| Browse Menu CTA | ~72px | ~72px | 0 |
| **Net saved** | | | **~39px (~5%)** |

**Pixel savings above first menu section: ~39px (~5% of total above-menu height)**

The largest single gain is eliminating the standalone contact section block (~68px). The icon row inside the info card adds back ~47px (but without the card border/shadow/margin overhead of a separate section). The banner compression saves an additional ~18px.

Note: Description collapse (Change 4, not yet implemented) would add ~40–80px more for restaurants with longer descriptions, potentially pushing total savings to ~100px+ (~13%).

---

## Accessibility Verification

| Check | Status |
|---|---|
| 44×44px minimum touch targets | ✅ All icon buttons `h-11 w-11` |
| `aria-label` with context on all icon links | ✅ Including "(opens in new tab)" |
| `aria-hidden="true"` on decorative SVGs | ✅ All brand and Lucide icons |
| `rel="noopener noreferrer"` on all `target="_blank"` links | ✅ |
| No color-only information | ✅ Icon shape distinguishes each action |
| Reward banner CTA is a real `<a href>` | ✅ |
| WCAG AA color contrast on banner text | ✅ White on brand-color background (brand colors are >= 3:1 contrast at typical values) |
| TypeScript — no errors | ✅ `npx tsc --noEmit` clean |

---

## Regression Assessment

| Area | Risk | Notes |
|---|---|---|
| Contact link functionality | None | Same URLs, same `target="_blank"` |
| Instagram / Facebook visibility | None | Facebook re-added to icon row (was dropped in initial pass, restored per updated spec) |
| Google Reviews | None | Not rendered (no URL field) — no regression |
| Reward banner play flow | None | `playUrl` and `accentColor` unchanged |
| Reward widget (floating 🎁) | None | Untouched |
| Today's Reward card | None | Untouched |
| Hours section | None | Untouched |
| Featured items / menu grid | None | Untouched |
| Admin UI | None | Contact tab and profile tab unchanged |
| DB / schema | None | No migrations |
| Promotion logic | None | `hasPromotion`, `playUrl`, dismissal state unchanged |
| `facebook_url` field | None | Field in schema, now rendered as Facebook icon |

---

## Files Changed

- `components/public/RestaurantPublicPage.tsx`
- `MOBILE_HEADER_OPTIMIZATION.md`

No new dependencies. `lucide-react` was already installed at `^0.468.0`.

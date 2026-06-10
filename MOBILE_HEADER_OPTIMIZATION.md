# Mobile Header Optimization — Sprint Report

Branch: `feature/mobile-header-optimization`
Date: 2026-06-10

---

## Changes Implemented

### Change 1 — Contact Button Replacement

**Before:** Four large pill buttons (`🌐 Website`, `🗺️ Directions`, `📸 Instagram`, `👥 Facebook`) in a horizontally-scrolling row below the Hours card.

**After:** Compact 44×44px circular icon buttons (`🌐`, `🗺️`, `📷`) consolidated inside the restaurant info card, directly beneath the phone number. No separate section.

**Details:**
- Removed standalone contact links section entirely (~60px saved: 16px margin + ~44px pill height)
- New icons are `h-11 w-11` (44px) circular `bg-stone-100` buttons — meets WCAG minimum touch target
- All icons have `aria-label` with "(opens in new tab)" description
- All links have `target="_blank" rel="noopener noreferrer"`
- Hidden when URL is missing (conditional render)
- Facebook icon removed per spec (no Facebook in new icon set)
- Row is left-aligned, `gap-3`, no overflow scroll needed (max 3 icons)

### Change 2 — Google Reviews Audit

**Schema audit result:** No `google_reviews_url` field exists in the `restaurants` table. The existing `google_maps_url` field links to a Google Maps directions page, which is not interchangeable with a Google Reviews URL.

**Recommendation (no schema change applied):**
Add a `google_reviews_url text` column to the `restaurants` table. Populate it with the restaurant's Google Maps review link (format: `https://g.page/r/<place-id>/review`). Once added:
- Include the field in the `PublicRestaurant` type
- Add `google_reviews_url` to the Supabase `SELECT` query in `app/r/[restaurantSlug]/page.tsx`
- Render a `⭐` icon button in the contact icon row with `aria-label="Leave a Google review (opens in new tab)"`
- Add the field to `RestaurantContactTab.tsx` admin form

### Change 3 — Reward Banner Compression

**Before:** Two-row banner with large animated icon, title "Rewards Available Today" + subtitle "Play & Win While You Dine", `py-3` padding.

**After:** Single-row banner — `🎁 Win Rewards While You Dine` with `[Play Now →]` CTA, `py-2.5` padding.

**Details:**
- Removed `useState(iconHovering)` and all hover/touch animation handlers
- Removed game-type icon selector (`🎡`/`🎫`/`🎁`)
- Removed subtitle line
- Reduced icon size from `1.75rem` to `text-xl` (1.25rem)
- Reduced padding from `py-3` (24px) to `py-2.5` (20px)
- Estimated height reduction: ~56px → ~38px (~18px / ~32% reduction)
- CTA and brand color preserved

---

## Height Reduction Estimates

All measurements are approximate (based on Tailwind class math at 16px base):

| Section | Before | After | Saved |
|---|---|---|---|
| Contact links (standalone section) | ~60px | 0px (moved into info card) | ~60px |
| Icon row added to info card | 0px | +47px (`mt-3`+`h-11`) | -47px |
| Reward banner | ~56px | ~38px | ~18px |
| **Net above first menu item** | — | — | **~31px** |

The standalone contact section removal eliminates one full visual block (~16px margin + section height), which is the primary contributor to the savings.

---

## Accessibility Verification

| Requirement | Status |
|---|---|
| 44×44px minimum touch targets | ✅ `h-11 w-11` = 44px |
| `aria-label` on all icon buttons | ✅ Descriptive labels with "(opens in new tab)" |
| `rel="noopener noreferrer"` on external links | ✅ All three icons |
| Hidden when URL missing | ✅ Conditional render per field |
| Reward banner CTA accessible | ✅ `<a href>` with visible text |
| No color-only information | ✅ Labels present |

---

## Regression Assessment

| Area | Risk | Notes |
|---|---|---|
| Contact links functionality | None | Same URLs, same `target="_blank"` behavior |
| Reward banner play flow | None | `playUrl` and `accentColor` unchanged |
| Hours / featured items / menu | None | Untouched |
| Admin UI | None | Contact tab and profile tab unchanged |
| Schema / DB | None | No migrations applied |
| Promotion logic | None | `hasPromotion`, `playUrl`, reward card unchanged |
| `facebook_url` field | None | Field remains in schema and type; icon just not rendered |
| TypeScript | ✅ Clean | `npx tsc --noEmit` passes with zero errors |

---

## Files Changed

- `components/public/RestaurantPublicPage.tsx` — all UI changes
- `MOBILE_HEADER_OPTIMIZATION.md` — this document

No new files, no migrations, no analytics, no AI.

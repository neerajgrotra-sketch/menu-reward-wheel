# SpinBite Canonical Component Registry

_Audit date: 2026-06-15_

This registry documents every shared or canonical component. Components marked **Protected: YES** must never be duplicated, replaced silently, or modified without a full blast-radius audit per Engineering Rules 1, 3, 4, and 13.

---

## COMPONENT: GameVisual.tsx

**File:** `components/game-visuals/GameVisual.tsx`

**Purpose:**  
Single source of truth for all game icon/visual rendering. Exports `MiniPrizeWheel`, `MiniMysteryBox`, `MiniScratchCard`, `MiniOpenDoor`, `MiniRewardReels`, and the `getGameVisual()` helper function.

**Exports:**
- `MiniPrizeWheel` — 8-segment conic-gradient spin wheel with pointer
- `MiniMysteryBox` — CSS gift box with gradient lid/body
- `MiniScratchCard` — CSS card with shimmer lines
- `MiniOpenDoor` — CSS door panel with knob and insets
- `MiniRewardReels` — CSS slot machine with 3 reel columns
- `getGameVisual(gameType, size, boosted)` — returns `{visual, headline, subline}` for any game type

**Used by:**
- `components/public/RestaurantPublicPage.tsx` — reward widget game icon
- `components/promotion-builder/GameSelectionSection.tsx` — game type selector cards
- `app/admin/promotions/[id]/builder/page.tsx` — builder preview
- Any future marketing surface showing game type visuals

**Blast radius if modified:** ALL game selection UIs, ALL public promotion widgets, ALL admin builder game selectors. Breaking this file breaks the entire game visual system.

**Protected:** YES

**Rule:** Never render a game visual from any other source. Never use emoji as game card visuals. Always call `getGameVisual()` for visual tile contexts. See Engineering Rule 14.

---

## COMPONENT: RestaurantPublicPage.tsx

**File:** `components/public/RestaurantPublicPage.tsx`

**Purpose:**  
Full public-facing QR menu page render. Receives all data as props from the server page (`app/r/[restaurantSlug]/page.tsx`) and handles hero, hours, filter chips, item grid, item detail sheet, and the promotion widget.

**Used by:**
- `app/r/[restaurantSlug]/page.tsx` (only consumer)

**Blast radius if modified:** Entire public QR menu experience for every customer of every restaurant.

**Protected:** YES

**Note:** This component contains several inline sub-components (hours parser, tag pill, item card, detail sheet). Extracting them requires careful audit — they share restaurant branding state.

---

## COMPONENT: GameRuntimeRenderer.tsx

**File:** `components/game/GameRuntimeRenderer.tsx`

**Purpose:**  
Dispatches to the correct game runtime component based on `gameType`. The single entry point for all customer-facing game play.

**Used by:**
- `app/play/[restaurantSlug]/[promotionSlug]/page.tsx`

**Blast radius if modified:** All game play sessions across all game types.

**Protected:** YES

---

## COMPONENT: PromotionBuilderShell.tsx

**File:** `components/promotion-builder/PromotionBuilderShell.tsx`

**Purpose:**  
Orchestration shell for the multi-section promotion builder. Composes `PromotionMetadataSection`, `GameSelectionSection`, `GameConfigHost`, `PromotionPreviewSection`, `PromotionPublishingSection`.

**Used by:**
- `app/admin/promotions/[id]/builder/page.tsx`
- `components/promotion-builder/CreatePromotionFlow.tsx`

**Blast radius if modified:** Entire admin promotion creation and edit flow.

**Protected:** YES

---

## COMPONENT: BottomSheet.tsx

**File:** `components/admin/BottomSheet.tsx`

**Purpose:**  
Shared mobile-first bottom sheet modal used across admin flows. Handles animation, backdrop, scroll lock.

**Used by:**
- Admin restaurant profile tabs
- Menu builder item editing
- Various admin confirmation flows

**Blast radius if modified:** All admin bottom sheet interactions on mobile.

**Protected:** YES

---

## COMPONENT: CustomerIdentityScreen.tsx

**File:** `components/CustomerIdentityScreen.tsx`

**Purpose:**  
Phone capture + marketing consent screen shown after a customer wins a reward, before revealing coupon code.

**Used by:**
- Game runtimes (called after win state)
- `app/play/[restaurantSlug]/[promotionSlug]/page.tsx`

**Blast radius if modified:** Customer identity capture for all promotions. Affects `customer_profiles` data quality and consent compliance.

**Protected:** YES

---

## COMPONENT: BrandedUnavailablePage.tsx

**File:** `components/BrandedUnavailablePage.tsx`

**Purpose:**  
Shown when a restaurant is not found, a promotion is ended, or a QR link is invalid. Branded fallback rather than a generic 404.

**Used by:**
- `app/r/[restaurantSlug]/page.tsx`
- `app/play/[restaurantSlug]/[promotionSlug]/page.tsx`

**Protected:** NO (low blast radius, single page)

---

## COMPONENT: CountdownTimer.tsx

**File:** `components/CountdownTimer.tsx`

**Purpose:**  
Displays countdown to coupon expiry. Used on the coupon reveal screen.

**Used by:**
- Post-game coupon display within game runtime components

**Protected:** NO

---

## COMPONENT: SpinWheelPreview.tsx

**File:** `components/admin/SpinWheelPreview.tsx`

**Purpose:**  
Admin-only preview of the spin wheel with configured rewards. Used in the promotion builder preview panel.

**Used by:**
- `components/promotion-builder/GamePreviewHost.tsx`

**Protected:** NO (admin only, limited blast radius)

---

## COMPONENT: BuilderGamePreviewCard.tsx

**File:** `components/admin/BuilderGamePreviewCard.tsx`

**Purpose:**  
Card wrapper for game preview inside the builder. Renders the game's `BuilderPreview` component.

**Used by:**
- `components/promotion-builder/PromotionPreviewSection.tsx`

**Protected:** NO

---

## COMPONENT: HeroImageUploader.tsx / MenuItemImageUploader.tsx

**Files:**  
`components/admin/restaurants/HeroImageUploader.tsx`  
`components/admin/restaurants/MenuItemImageUploader.tsx`

**Purpose:**  
Image upload to Supabase Storage with confirm modal, file type validation, size limits, and path-scoped upload policy enforcement.

**Used by:**
- `components/admin/restaurants/RestaurantProfileTab.tsx` (hero)
- `app/admin/menu/page.tsx` (menu item images)

**Blast radius if modified:** Image upload pipeline. Changes to path format would break storage RLS policies.

**Protected:** YES (storage path format is security-critical)

---

## COMPONENT: GameTypeRegistrySelector.tsx

**File:** `components/admin/GameTypeRegistrySelector.tsx`

**Purpose:**  
Renders the game type selection UI in the promotion builder by reading from the game contract registry. Must use `getGameVisual()` for all game visuals.

**Used by:**
- `components/promotion-builder/GameSelectionSection.tsx`

**Protected:** YES (single source of truth for game selection UI)

---

## COMPONENT: RewardWheel.tsx

**File:** `components/RewardWheel.tsx`

**Purpose:**  
Full customer-facing spin wheel game component. Contains the actual spinning wheel DOM, rotation physics, and win reveal logic. This is the runtime game component for the `spin_wheel` game type.

**Used by:**
- `lib/games/spin-wheel/runtime.tsx`
- `components/games/WheelGame.tsx`

**Protected:** YES

---

## COMPONENT: Home Section Components

**Files:**  
`components/home/HeroSection.tsx`  
`components/home/HowItWorksSection.tsx`  
`components/home/CTASection.tsx`  
`components/home/FooterSection.tsx`  
`components/home/PricingSection.tsx`

**Purpose:** Marketing homepage sections.

**Used by:** `app/LandingPageClient.tsx` only.

**Protected:** NO (marketing only)

---

## Game Runtime Components

| Component | Game | File |
|-----------|------|------|
| `WheelGame` | Spin Wheel | `components/games/WheelGame.tsx` |
| `ScratchCardGame` | Scratch Card | `components/games/ScratchCardGame.tsx` |
| `MysteryBoxGame` | Mystery Box | `components/games/MysteryBoxGame.tsx` |
| `MysteryBoxGameAdapter` | Mystery Box (adapter) | `components/games/MysteryBoxGameAdapter.tsx` |

**Protected:** YES — these are the customer-facing game runtimes. Modifying visual or behavioral aspects affects all customers playing those games.

---

## Promotion Builder Section Components

| Component | Purpose | File |
|-----------|---------|------|
| `PromotionMetadataSection` | Name, description | `components/promotion-builder/PromotionMetadataSection.tsx` |
| `GameSelectionSection` | Game type picker | `components/promotion-builder/GameSelectionSection.tsx` |
| `GameConfigHost` | Per-game config panel | `components/promotion-builder/GameConfigHost.tsx` |
| `GamePreviewHost` | Per-game builder preview | `components/promotion-builder/GamePreviewHost.tsx` |
| `PromotionRewardsSection` | Reward pool editor | `components/promotion-builder/PromotionRewardsSection.tsx` |
| `PromotionSchedulingSection` | Date/time scheduling | `components/promotion-builder/PromotionSchedulingSection.tsx` |
| `PromotionPublishingSection` | Status + publish | `components/promotion-builder/PromotionPublishingSection.tsx` |
| `PromotionPreviewSection` | Live preview | `components/promotion-builder/PromotionPreviewSection.tsx` |
| `CreatePromotionFlow` | New promotion wizard | `components/promotion-builder/CreatePromotionFlow.tsx` |
| `PromotionsAdminPageShell` | Promotions list shell | `components/promotion-builder/PromotionsAdminPageShell.tsx` |

**Protected:** YES as a group — modifying one section can break the builder flow state machine.

---

## Restaurant Admin Tab Components

| Component | Tab | File |
|-----------|-----|------|
| `RestaurantProfileTab` | Profile | `components/admin/restaurants/RestaurantProfileTab.tsx` |
| `RestaurantContactTab` | Contact | `components/admin/restaurants/RestaurantContactTab.tsx` |
| `RestaurantSettingsTab` | Settings | `components/admin/restaurants/RestaurantSettingsTab.tsx` |
| `RestaurantQrTab` | QR Code | `components/admin/restaurants/RestaurantQrTab.tsx` |
| `HoursEditor` | Hours | `components/admin/restaurants/HoursEditor.tsx` |
| `BrandColorFields` | Brand | `components/admin/restaurants/BrandColorFields.tsx` |
| `ConfirmModal` | Confirm dialogs | `components/admin/restaurants/ConfirmModal.tsx` |

**Protected:** NO individually, but `types.ts` in the same folder defines shared type contracts used by all — that file is protected.

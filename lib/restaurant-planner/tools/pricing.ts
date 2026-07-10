// Pricing Tools. Every function wraps an existing, already-tested
// implementation — lib/menu/special-offer.ts's calculateSpecialPrice /
// isSpecialOfferActive ("Rule 54: future AI can call these functions
// directly"), lib/intelligence/actions/menu-discount-schema.ts's
// isDiscountSpec, and lib/restaurant-planner/capabilities/menu-pricing.ts's
// estimateDiscountImpact. No new pricing math exists in this file.

import { calculateSpecialPrice, isSpecialOfferActive, type SpecialOfferItem } from '@/lib/menu/special-offer';
import { isDiscountSpec, type DiscountSpec } from '@/lib/intelligence/actions/menu-discount-schema';
import { estimateDiscountImpact, revalidateProposal, type DiscountImpactEstimate } from '../capabilities/menu-pricing';
import type { ResolvableAction, ResolvedDiscountItem } from '@/lib/menu-discount-actions/resolve';
import type { ToolDefinition } from './types';
import { ok, fail } from './types';

export const calculateDiscount: ToolDefinition<
  { originalPrice: number; discountType: string; percent: number | null; specialPrice: number | null },
  number
> = {
  name: 'calculateDiscount',
  description: 'The resulting price after a percentage or fixed-price discount is applied.',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input) =>
    ok(calculateSpecialPrice(input.originalPrice, input.discountType, input.percent, input.specialPrice)),
};

// Bounds-checks a raw DiscountSpec (0 < percentage < 100, fixed_price > 0,
// etc.) — the exact same check parsePlannerOutput already runs at parse
// time via isMenuDiscountAction/isDiscountSpec. Registered standalone for a
// future composer that wants validation without running the full
// parse-and-resolve pipeline; buildProposal() does NOT call this a second
// time redundantly, since a DiscountSpec that reaches it already passed
// this exact check once.
export const validateDiscount: ToolDefinition<{ discount: DiscountSpec; currentPrice?: number }, { valid: boolean; reason?: string }> = {
  name: 'validateDiscount',
  description: 'Checks a discount spec against the same bounds the parser enforces (0–100% exclusive, fixed price > 0), and — if a current price is given — that a fixed price is actually lower than it.',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input) => {
    if (!isDiscountSpec(input.discount)) return ok({ valid: false, reason: 'Discount is outside the allowed bounds.' });
    if (input.discount.discountType === 'fixed_price' && input.currentPrice !== undefined && input.discount.value >= input.currentPrice) {
      return ok({ valid: false, reason: 'The fixed price is not lower than the current price.' });
    }
    return ok({ valid: true });
  },
};

export const estimatePromotionImpact: ToolDefinition<{ action: ResolvableAction; items: ResolvedDiscountItem[] }, DiscountImpactEstimate> = {
  name: 'estimatePromotionImpact',
  description: 'Deterministic, clearly-labeled revenue-impact estimate for a resolved discount — never a real analytics figure. Also covers estimateRevenueImpact (same return shape).',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input) => ok(estimateDiscountImpact(input.action, input.items)),
};

// menu_items has no cost/COGS column anywhere in the schema — confirmed
// repeatedly across every audit of this feature. This tool always returns
// margin: null with an explicit reason rather than fabricating a number;
// registered so "estimate margin" is a discoverable, real entry in the
// library instead of silently absent.
export const estimateMargin: ToolDefinition<Record<string, never>, { margin: null; reason: string }> = {
  name: 'estimateMargin',
  description: 'Always returns margin: null — menu_items has no cost/COGS data to compute a real margin from. Never fabricates a number.',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async () => ok({ margin: null, reason: 'No cost data is configured for these items.' }),
};

// "Conflicting" promotions can't structurally occur today — menu_items.special_*
// is a single mutable set of columns, so setting a new special always
// overwrites rather than stacks. This tool reports the item's current
// active special (if any) so a caller can decide whether to warn the user,
// using the same isSpecialOfferActive() the public menu itself uses to
// decide whether to show a special.
export const detectConflictingPromotion: ToolDefinition<{ item: SpecialOfferItem }, { hasActiveSpecial: boolean }> = {
  name: 'detectConflictingPromotion',
  description: "Whether this item already has an active special. There is no promotion-stacking in this schema — a new special always replaces the old one, so this is informational, not a conflict-resolution engine.",
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input) => ok({ hasActiveSpecial: isSpecialOfferActive(input.item) }),
};

// Wraps revalidateProposal() (Objective 3, V2) — same "requested twice"
// naming as the original ask (validateProposal / revalidateProposal), one
// tool. The pre-execution write-time check in discount-action/apply/route.ts
// still calls revalidateProposal() directly (no ctx/Supabase client needed
// for a pure diff) — this registration exists so the same check is
// discoverable and directly callable by a future composer.
export const validateProposal: ToolDefinition<
  { snapshot: ResolvedDiscountItem[] | null; liveItems: ResolvedDiscountItem[] },
  { valid: boolean; reason?: string }
> = {
  name: 'validateProposal',
  description: "Diffs a proposal's persisted snapshot against freshly resolved live data — a changed price or a since-deleted item fails validation rather than being silently applied. Also registered as revalidateProposal.",
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input) => {
    const result = revalidateProposal(input.snapshot, input.liveItems);
    return ok(result.ok ? { valid: true } : { valid: false, reason: result.reason });
  },
};

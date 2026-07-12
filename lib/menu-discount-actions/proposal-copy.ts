// Composes the generic ProposalCopy/ProposalItemView shapes
// (lib/restaurant-planner/proposal-view.ts) ProposalCard.tsx renders, for
// the menu_pricing capability. This is a VERBATIM RELOCATION of label logic
// that used to live directly in ProposalCard.tsx (describeState,
// scheduleLabel, targetLabel, recommendationLabel, promotionLabel,
// shortPromotionLabel, objectiveLabel, effectiveAfterPrice) — zero logic
// change, only a change of where the computation happens (server-side, in
// discount-action/preview/route.ts, rather than client-side in the card).
// This is what makes the card's own header comment true ("every fact
// rendered here is composed server-side... never fabricated client-side")
// instead of only mostly true.

import type { ResolvableAction, ResolvedDiscountItem } from './resolve';
import type { ProposalCopy, ProposalItemView } from '@/lib/restaurant-planner/proposal-view';

function describeState(state: { specialEnabled: boolean; specialType: string | null; specialPercent: number | null; specialPrice: number | null }): string {
  if (!state.specialEnabled) return 'No discount';
  if (state.specialType === 'percentage') return `${state.specialPercent}% off`;
  if (state.specialType === 'fixed_price') return `$${Number(state.specialPrice).toFixed(2)}`;
  return 'Discount';
}

function scheduleLabel(action: ResolvableAction): string {
  if (action.type === 'clear_discount') return 'Immediately';
  const { specialStartAt, specialNoExpiry } = action.discount;
  const start = specialStartAt ? `Starts ${new Date(specialStartAt).toLocaleString()}` : 'Immediately';
  const end = specialNoExpiry ? 'No end date' : 'Ends automatically';
  return `${start} · ${end}`;
}

function targetLabel(action: ResolvableAction): string {
  const target = action.target;
  switch (target.scope) {
    case 'all':
      return 'all menu items';
    case 'category':
      return `the "${target.name}" category`;
    case 'item':
      return `"${target.name}"`;
    case 'items':
      return target.names.map((n) => `"${n}"`).join(', ');
    case 'name_contains':
      return `items matching "${target.query}"`;
  }
}

function recommendationLabel(action: ResolvableAction): string {
  if (action.type === 'clear_discount') return `Remove the discount from ${targetLabel(action)}`;
  const valueLabel =
    action.discount.discountType === 'percentage' ? `a ${action.discount.value}% discount` : `a fixed price of $${action.discount.value}`;
  return `Apply ${valueLabel} to ${targetLabel(action)}`;
}

// The card's header title — always ends in "Recommendation" per the
// executive-proposal framing.
function promotionLabel(action: ResolvableAction): string {
  if (action.type === 'clear_discount') return 'Discount Removal Recommendation';
  return action.discount.discountType === 'percentage'
    ? `${action.discount.value}% Discount Recommendation`
    : 'Fixed Price Recommendation';
}

function shortPromotionLabel(action: ResolvableAction): string {
  if (action.type === 'clear_discount') return 'remove the discount';
  return action.discount.discountType === 'percentage'
    ? `${action.discount.value}% discount`
    : `fixed price of $${action.discount.value}`;
}

// Not a stored goal field (menu_pricing has none, unlike Revenue
// Intelligence opportunities) — a templated, honest business framing of
// "why discount this," not a measured claim.
function objectiveLabel(action: ResolvableAction, items: ResolvedDiscountItem[]): string {
  if (action.type === 'clear_discount') return 'Restore standard pricing';
  const categoryNames = Array.from(new Set(items.map((i) => i.categoryName).filter(Boolean)));
  if (categoryNames.length === 1) return `Increase ${categoryNames[0]} sales`;
  return 'Increase overall menu sales';
}

// Shared by both before/after: the price a customer actually pays for a
// given special-state, not the static menu_items.price base — a currently-
// discounted item's "Current" label must show what's being charged right
// now (the discounted price), not the underlying base price, or a
// clear_discount proposal's Before/After looks like a no-op ($6.99 -> $6.99)
// even though a real change (the discount itself) is being removed.
function effectivePrice(
  price: number | null,
  state: { specialEnabled: boolean; specialType: string | null; specialPercent: number | null; specialPrice: number | null },
): number | null {
  if (!state.specialEnabled) return price;
  if (state.specialType === 'fixed_price') return state.specialPrice;
  if (state.specialType === 'percentage' && price !== null && state.specialPercent !== null) {
    return price * (1 - state.specialPercent / 100);
  }
  return null;
}

// Visibility is static in Phase 1 — every menu_pricing promotion surfaces in
// these two real places; there's no distinct "public menu" surface and no
// per-proposal channel control yet.
const VISIBILITY_CHANNELS = ['Public Menu', 'Promotion Banner'];

export function toItemView(item: ResolvedDiscountItem): ProposalItemView {
  const beforePrice = effectivePrice(item.price, item.before);
  const afterPrice = effectivePrice(item.price, item.after);
  const badge = item.after.specialEnabled && item.after.specialType === 'percentage' ? `${item.after.specialPercent}% OFF` : undefined;
  return {
    id: item.id,
    name: item.name,
    categoryName: item.categoryName,
    beforeLabel: beforePrice !== null ? `$${beforePrice.toFixed(2)}` : describeState(item.before),
    afterLabel: afterPrice !== null ? `$${afterPrice.toFixed(2)}` : describeState(item.after),
    badge,
  };
}

export function composeProposalCopy(action: ResolvableAction, items: ResolvedDiscountItem[]): ProposalCopy {
  const afterApprovalSteps =
    action.type === 'clear_discount'
      ? ['Menu pricing updates', 'Customers immediately see the new price']
      : ['Menu pricing updates', 'Customers immediately see the new price', 'Promotion becomes active'];

  return {
    title: promotionLabel(action),
    shortSummary: shortPromotionLabel(action),
    recommendationText: recommendationLabel(action),
    objectiveText: objectiveLabel(action, items),
    scheduleText: scheduleLabel(action),
    visibilityChannels: VISIBILITY_CHANNELS,
    afterApprovalSteps,
  };
}

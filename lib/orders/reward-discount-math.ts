import { roundCurrency } from '@/lib/payments/pricing-defaults';

export type RewardType = 'free' | 'discount' | 'custom';

// Pure reward → discount math, shared by the server (lib/orders/apply-coupon-discount.ts,
// authoritative at checkout) and the client (cart/checkout preview UI) so the previewed
// discount can never drift from what actually gets charged.
// Scoped to one unit's price — a coupon is one reward, matching how coupons are issued
// one-per-play — never the full line total regardless of quantity in cart.
export function computeRewardDiscount(rewardType: RewardType, rewardValue: number | null, unitPrice: number): number {
  if (rewardType === 'free') return roundCurrency(unitPrice);
  if (rewardType === 'discount') {
    const raw = unitPrice * ((rewardValue || 0) / 100);
    return roundCurrency(Math.min(Math.max(raw, 0), unitPrice));
  }
  return 0;
}

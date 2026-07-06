import type { SupabaseClient } from '@supabase/supabase-js';
import { roundCurrency } from '@/lib/payments/pricing-defaults';
import type { ResolvedItem } from './resolve-order-items';

export type CouponDiscountResult = {
  discountAmount: number;
  appliedRedemptionId: string | null;
};

const ZERO_RESULT: CouponDiscountResult = { discountAmount: 0, appliedRedemptionId: null };

// Re-derives and re-validates a coupon redemption entirely from the database —
// the caller's couponRedemptionId is the only thing trusted from the request.
// Every failure mode below is a silent skip to zero, never a thrown error:
// a coupon that can't be applied should never block checkout, only forfeit
// its own discount (per product decision — see the "Redeem Now" plan).
export async function resolveCouponDiscount(
  supabase: SupabaseClient,
  restaurantId: string,
  couponRedemptionId: string | null | undefined,
  resolvedItems: ResolvedItem[],
): Promise<CouponDiscountResult> {
  if (!couponRedemptionId) return ZERO_RESULT;

  const { data: redemption } = await supabase
    .from('coupon_redemptions')
    .select('id, status, issued_at, promotion_reward_id, promotion_id, restaurant_id')
    .eq('id', couponRedemptionId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (!redemption || redemption.status !== 'issued') return ZERO_RESULT;

  const { data: promotion } = await supabase
    .from('promotions')
    .select('coupon_expiry_minutes')
    .eq('id', redemption.promotion_id)
    .maybeSingle();

  const expiryMinutes = promotion?.coupon_expiry_minutes || 20;
  const expiresAtMs = new Date(redemption.issued_at).getTime() + expiryMinutes * 60 * 1000;
  if (Date.now() >= expiresAtMs) return ZERO_RESULT;

  const { data: reward } = await supabase
    .from('promotion_rewards')
    .select('reward_type, reward_value, menu_item_id')
    .eq('id', redemption.promotion_reward_id)
    .maybeSingle();

  if (!reward || !reward.menu_item_id) return ZERO_RESULT;
  if (reward.reward_type !== 'free' && reward.reward_type !== 'discount') return ZERO_RESULT;

  const matchedLine = resolvedItems.find((item) => item.menu_item_id === reward.menu_item_id);
  if (!matchedLine) return ZERO_RESULT;

  // Scoped to one unit of the matched line — one coupon is one reward,
  // matching how coupons are issued one-per-play.
  const rawDiscount =
    reward.reward_type === 'free'
      ? matchedLine.effective_price_snapshot
      : matchedLine.effective_price_snapshot * ((reward.reward_value || 0) / 100);

  // Clamped to one unit's price, not the line's full total — a misconfigured
  // reward_value (or any value > 100%) must never discount more than the one
  // unit this coupon represents, regardless of how many units are in the cart.
  const discountAmount = roundCurrency(Math.min(Math.max(rawDiscount, 0), matchedLine.effective_price_snapshot));

  return { discountAmount, appliedRedemptionId: redemption.id };
}

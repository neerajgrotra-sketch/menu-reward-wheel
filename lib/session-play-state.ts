/**
 * Pure function for determining whether a returning customer may still play.
 *
 * Source of truth: coupon issuance, not session creation.
 * A session is "complete" only when coupons issued >= max_spins.
 */

export interface SessionCouponSummary {
  status: string;
}

export interface SessionPlayState {
  /** True only when coupons issued >= max_spins. */
  alreadyPlayed: boolean;
  /** Number of coupons already issued in this session. */
  playsUsed: number;
  /** Plays remaining before the session is complete. */
  playsRemaining: number;
}

export function resolveSessionPlayState(
  coupons: SessionCouponSummary[],
  maxSpins: number,
): SessionPlayState {
  const maxPlays = Math.max(1, maxSpins);
  const playsUsed = coupons.length;
  const playsRemaining = Math.max(0, maxPlays - playsUsed);
  const alreadyPlayed = playsUsed >= maxPlays;

  return { alreadyPlayed, playsUsed, playsRemaining };
}

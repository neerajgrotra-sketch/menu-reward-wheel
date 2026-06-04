const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const TWO_DAYS_MS = 2 * ONE_DAY_MS;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

/**
 * Human-readable countdown string.
 * < 1 hour    → "18m"
 * 1h – 23h59m → "3h 42m"       (minutes always shown)
 * 24h – 47h59m → "24h" / "36h" (whole hours, no minutes — avoids "1d 0h" for 24h)
 * ≥ 48 hours  → "2d 0h" / "6d 14h"
 */
export function formatCouponTimeRemaining(msRemaining: number): string {
  if (msRemaining <= 0) return 'Expired';

  const totalMinutes = Math.floor(msRemaining / ONE_MINUTE_MS);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (msRemaining >= TWO_DAYS_MS) {
    const hours = totalHours % 24;
    return `${totalDays}d ${hours}h`;
  }

  if (totalHours >= 24) {
    // 24 h ≤ remaining < 48 h — display as whole hours, no minutes
    return `${totalHours}h`;
  }

  if (totalHours >= 1) {
    const minutes = totalMinutes % 60;
    return `${totalHours}h ${minutes.toString().padStart(2, '0')}m`;
  }

  return `${totalMinutes}m`;
}

/**
 * Returns a "Valid until" date string with local timezone abbreviation when
 * msRemaining ≥ 24 h, null otherwise.
 * ≥ 7 days → "Jun 15, 2026 at 8:00 PM EDT"
 * 1–6 days → "Jun 15, 2026 8:00 PM EDT"
 */
export function formatCouponValidUntil(expiresAtMs: number, msRemaining: number): string | null {
  if (msRemaining < ONE_DAY_MS) return null;

  const d = new Date(expiresAtMs);
  const month = MONTHS[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const time = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;

  const tzAbbr =
    new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
      .formatToParts(d)
      .find((p) => p.type === 'timeZoneName')?.value ?? '';

  const useAt = msRemaining >= SEVEN_DAYS_MS;
  return `${month} ${day}, ${year} ${useAt ? 'at ' : ''}${time}${tzAbbr ? ` ${tzAbbr}` : ''}`;
}

/**
 * True when the coupon has ≥ 7 days remaining.
 * Gate wallet-adjacent UI (buttons, passes) behind this — do not show the
 * hint text on its own without accompanying wallet action buttons.
 */
export function shouldShowWalletHint(msRemaining: number): boolean {
  return msRemaining >= SEVEN_DAYS_MS;
}

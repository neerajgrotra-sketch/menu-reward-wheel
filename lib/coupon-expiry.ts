const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ONE_HOUR_MS = 60 * 60_000;
const TWO_DAYS_MS = 48 * ONE_HOUR_MS;
const SEVEN_DAYS_MS = 7 * 24 * ONE_HOUR_MS;

/**
 * Urgency-aware countdown string, updated every second by the caller.
 *
 * < 1 hour   → "19:42"         live MM:SS — maximum urgency
 * 1h – 47h   → "7h 59m 42s"   live H M S — still urgent, no raw minutes
 * ≥ 48 hours → "6d 14h"       day/hour only — second-level updates unnecessary
 */
export function formatCouponTimeRemaining(msRemaining: number): string {
  if (msRemaining <= 0) return 'Expired';

  const totalSeconds = Math.floor(msRemaining / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  // ≥ 48 hours: days + hours, no seconds needed
  if (msRemaining >= TWO_DAYS_MS) {
    const hours = totalHours % 24;
    return `${totalDays}d ${hours}h`;
  }

  // 1 hour to < 48 hours: H mm ss
  if (totalHours >= 1) {
    const minutes = totalMinutes % 60;
    const seconds = totalSeconds % 60;
    return `${totalHours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }

  // < 1 hour: MM:SS — classic urgent countdown
  const mins = totalMinutes.toString().padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

/**
 * Returns a "Valid until" date string with local TZ abbreviation for ≥ 48 h rewards.
 * ≥ 7 days → "Jun 15, 2026 at 8:00 PM EDT"
 * 2–6 days → "Jun 15, 2026 8:00 PM EDT"
 * < 48 h   → null (urgency countdown is sufficient)
 */
export function formatCouponValidUntil(expiresAtMs: number, msRemaining: number): string | null {
  if (msRemaining < TWO_DAYS_MS) return null;

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

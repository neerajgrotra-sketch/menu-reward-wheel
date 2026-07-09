// Converts the AI's raw schedule hint ("19:00") into concrete timestamps.
// Deliberately NOT done server-side — "19:00" only means something relative
// to the restaurant's local time, and a Vercel serverless function's clock
// has no reliable relationship to where the restaurant actually is. The
// admin's browser, run from (or near) the restaurant, is a reasonable proxy.
//
// v1 simplification: only a start time is supported (no recurring daily
// windows — the DB schema itself only has one absolute start/end pair, not
// a repeating schedule). "20% off desserts after 7 PM" becomes "starts
// today at 7 PM local time, runs indefinitely" unless the request implies
// otherwise.

import type { DiscountSpec } from '@/lib/intelligence/actions/menu-discount-schema';
import type { ResolvedDiscountSpec } from './resolve';

export function resolveDiscountSchedule(spec: DiscountSpec): ResolvedDiscountSpec {
  let specialStartAt: string | null = null;

  if (spec.startTime) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(spec.startTime.trim());
    if (match) {
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        const start = new Date();
        start.setHours(hours, minutes, 0, 0);
        specialStartAt = start.toISOString();
      }
    }
  }

  return {
    discountType: spec.discountType,
    value: spec.value,
    specialStartAt,
    specialEndAt: null,
    specialNoExpiry: spec.noExpiry ?? true,
  };
}

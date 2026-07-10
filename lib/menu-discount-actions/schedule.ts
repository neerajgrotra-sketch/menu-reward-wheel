// Converts the AI's raw schedule hint ("19:00") into concrete timestamps.
// Deliberately NOT done server-side — "19:00" only means something relative
// to the restaurant's local time, and a Vercel serverless function's clock
// has no reliable relationship to where the restaurant actually is. The
// admin's browser, run from (or near) the restaurant, is a reasonable proxy.
//
// v1 simplification, still true in V2: only a start time is supported (no
// recurring daily windows — the DB schema itself only has one absolute
// start/end pair, not a repeating schedule). "20% off desserts after 7 PM"
// becomes "starts today at 7 PM local time, runs indefinitely" unless the
// request implies otherwise. Colloquial phrases ("lunch", "dinner", "happy
// hour", "tomorrow at 6") are normalized to strict HH:MM + dayOffset at the
// prompt layer, not here — an LLM is already good at that mapping; this
// function stays a small, deterministic enforcement backstop.
//
// V2: a non-empty startTime that fails to parse used to silently leave
// specialStartAt null (== "starts immediately") with no way to tell. It
// still does — the DB schema has nothing better to fall back to — but now
// sets startTimeParseFailed so the caller can surface a visible warning
// instead of a silent behavior change.

import type { DiscountSpec } from '@/lib/intelligence/actions/menu-discount-schema';
import type { ResolvedDiscountSpec } from './resolve';

export function resolveDiscountSchedule(spec: DiscountSpec): ResolvedDiscountSpec {
  let specialStartAt: string | null = null;
  let startTimeParseFailed = false;

  if (spec.startTime) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(spec.startTime.trim());
    const hours = match ? Number(match[1]) : NaN;
    const minutes = match ? Number(match[2]) : NaN;
    const valid = match !== null && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;

    if (valid) {
      const start = new Date();
      if (spec.dayOffset === 'tomorrow') start.setDate(start.getDate() + 1);
      start.setHours(hours, minutes, 0, 0);
      specialStartAt = start.toISOString();
    } else {
      startTimeParseFailed = true;
    }
  }

  return {
    discountType: spec.discountType,
    value: spec.value,
    specialStartAt,
    specialEndAt: null,
    specialNoExpiry: spec.noExpiry ?? true,
    ...(startTimeParseFailed ? { startTimeParseFailed: true } : {}),
  };
}

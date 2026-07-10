import { describe, it, expect } from 'vitest';
import { resolveDiscountSchedule } from './schedule';

describe('resolveDiscountSchedule', () => {
  it('leaves specialStartAt null and defaults to no-expiry when no start time is given', () => {
    const result = resolveDiscountSchedule({ discountType: 'percentage', value: 20 });
    expect(result).toEqual({
      discountType: 'percentage',
      value: 20,
      specialStartAt: null,
      specialEndAt: null,
      specialNoExpiry: true,
    });
  });

  it('resolves a valid "HH:MM" start time to today at that local time', () => {
    const result = resolveDiscountSchedule({ discountType: 'percentage', value: 20, startTime: '19:00' });
    expect(result.specialStartAt).not.toBeNull();
    const parsed = new Date(result.specialStartAt!);
    expect(parsed.getHours()).toBe(19);
    expect(parsed.getMinutes()).toBe(0);
    expect(result.specialNoExpiry).toBe(true);
  });

  it('respects an explicit noExpiry: false', () => {
    const result = resolveDiscountSchedule({ discountType: 'percentage', value: 20, startTime: '19:00', noExpiry: false });
    expect(result.specialNoExpiry).toBe(false);
  });

  it('ignores a malformed start time rather than throwing, and flags it as a visible warning (V2)', () => {
    const result = resolveDiscountSchedule({ discountType: 'percentage', value: 20, startTime: 'not a time' });
    expect(result.specialStartAt).toBeNull();
    expect(result.startTimeParseFailed).toBe(true);
  });

  it('rejects an out-of-range hour by leaving specialStartAt null and flagging it', () => {
    const result = resolveDiscountSchedule({ discountType: 'percentage', value: 20, startTime: '25:00' });
    expect(result.specialStartAt).toBeNull();
    expect(result.startTimeParseFailed).toBe(true);
  });

  it('does not set startTimeParseFailed when no startTime was given at all', () => {
    const result = resolveDiscountSchedule({ discountType: 'percentage', value: 20 });
    expect(result.startTimeParseFailed).toBeUndefined();
  });

  it('rejects a 12-hour-style time like "7:00 PM" — the format instruction exists precisely because this fails silently', () => {
    const result = resolveDiscountSchedule({ discountType: 'percentage', value: 20, startTime: '7:00 PM' });
    expect(result.specialStartAt).toBeNull();
    expect(result.startTimeParseFailed).toBe(true);
  });

  describe('dayOffset (V2 — "start tomorrow at 7 PM")', () => {
    it('defaults to today when dayOffset is omitted', () => {
      const today = new Date();
      const result = resolveDiscountSchedule({ discountType: 'percentage', value: 20, startTime: '19:00' });
      const parsed = new Date(result.specialStartAt!);
      expect(parsed.getDate()).toBe(today.getDate());
    });

    it('adds a day when dayOffset is "tomorrow"', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const result = resolveDiscountSchedule({ discountType: 'percentage', value: 20, startTime: '19:00', dayOffset: 'tomorrow' });
      const parsed = new Date(result.specialStartAt!);
      expect(parsed.getDate()).toBe(tomorrow.getDate());
      expect(parsed.getHours()).toBe(19);
    });

    it('ignores dayOffset when there is no startTime to anchor it to', () => {
      const result = resolveDiscountSchedule({ discountType: 'percentage', value: 20, dayOffset: 'tomorrow' });
      expect(result.specialStartAt).toBeNull();
    });
  });
});

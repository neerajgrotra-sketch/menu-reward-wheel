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

  it('ignores a malformed start time rather than throwing', () => {
    const result = resolveDiscountSchedule({ discountType: 'percentage', value: 20, startTime: 'not a time' });
    expect(result.specialStartAt).toBeNull();
  });

  it('rejects an out-of-range hour by leaving specialStartAt null', () => {
    const result = resolveDiscountSchedule({ discountType: 'percentage', value: 20, startTime: '25:00' });
    expect(result.specialStartAt).toBeNull();
  });
});

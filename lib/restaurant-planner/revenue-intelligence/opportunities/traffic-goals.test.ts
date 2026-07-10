import { describe, it, expect } from 'vitest';
import { buildTrafficOpportunity } from './traffic-goals';
import type { DaypartStats } from '../../tools/analytics';

function stats(overrides: Partial<DaypartStats>): DaypartStats {
  return {
    daypart: 'lunch',
    currentPeriodOrders: 10,
    priorPeriodOrders: 15,
    currentPeriodShare: 0.2,
    priorPeriodShare: 0.3,
    topCategories: [{ categoryId: 'c1', categoryName: 'Sandwiches', revenue: 200, quantity: 20 }],
    ...overrides,
  };
}

describe('buildTrafficOpportunity', () => {
  it('is suppressed when the daypart share is at or above the prior-period baseline', () => {
    const result = buildTrafficOpportunity({ goal: 'increase_lunch_traffic', stats: stats({ currentPeriodShare: 0.35, priorPeriodShare: 0.3 }), confidenceCap: null });
    expect(result).toBeNull();
  });

  it('returns null (no unmotivated guess) when there is no category evidence for the daypart', () => {
    const result = buildTrafficOpportunity({ goal: 'increase_lunch_traffic', stats: stats({ topCategories: [] }), confidenceCap: null });
    expect(result).toBeNull();
  });

  it('is high confidence for a decline of 10% or more', () => {
    // 0.2 vs 0.3 baseline = a 33% relative decline
    const result = buildTrafficOpportunity({ goal: 'increase_lunch_traffic', stats: stats({ currentPeriodShare: 0.2, priorPeriodShare: 0.3 }), confidenceCap: null });
    expect(result?.confidence).toBe('high');
  });

  it('is medium confidence for a smaller decline', () => {
    const result = buildTrafficOpportunity({ goal: 'increase_lunch_traffic', stats: stats({ currentPeriodShare: 0.29, priorPeriodShare: 0.3 }), confidenceCap: null });
    expect(result?.confidence).toBe('medium');
  });

  it('never sets startTime/dayOffset on the action — a recurring daypart-only schedule does not exist', () => {
    const result = buildTrafficOpportunity({ goal: 'increase_lunch_traffic', stats: stats({}), confidenceCap: null });
    expect(result?.action.type).toBe('set_discount');
    if (result?.action.type === 'set_discount') {
      expect(result.action.discount.startTime).toBeUndefined();
      expect(result.action.discount.dayOffset).toBeUndefined();
    }
  });

  it('says explicitly that the discount runs continuously, never claiming a time-scoped effect that cannot happen', () => {
    const result = buildTrafficOpportunity({ goal: 'increase_lunch_traffic', stats: stats({}), confidenceCap: null });
    expect(result?.reasoning).toContain('run continuously');
    expect(result?.assumptions.some((a) => a.includes('does not turn off'))).toBe(true);
  });

  it('surfaces the fixed UTC daypart window as an explicit assumption, not a silent guess', () => {
    const result = buildTrafficOpportunity({ goal: 'increase_dinner_traffic', stats: stats({ daypart: 'dinner' }), confidenceCap: null });
    expect(result?.assumptions.some((a) => a.includes('17:00–22:00 UTC'))).toBe(true);
  });

  it('caps confidence down for thin order history, never up', () => {
    const result = buildTrafficOpportunity({ goal: 'increase_lunch_traffic', stats: stats({ currentPeriodShare: 0.2, priorPeriodShare: 0.3 }), confidenceCap: 'low' });
    expect(result?.confidence).toBe('low');
  });
});

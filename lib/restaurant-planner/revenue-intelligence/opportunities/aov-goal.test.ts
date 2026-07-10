import { describe, it, expect } from 'vitest';
import { buildAovOpportunity } from './aov-goal';
import type { CoOrderedPair } from '../../tools/analytics';

function pair(overrides: Partial<CoOrderedPair>): CoOrderedPair {
  return { itemAId: 'a', itemAName: 'Masala Chai', itemBId: 'b', itemBName: 'Rasmalai', coOccurrenceCount: 5, ...overrides };
}

describe('buildAovOpportunity', () => {
  it('degrades to no opportunity (answer-only) when there are zero qualifying pairs', () => {
    expect(buildAovOpportunity({ pairs: [], confidenceCap: null })).toBeNull();
  });

  it('picks the top-ranked (first) pair', () => {
    const result = buildAovOpportunity({ pairs: [pair({ coOccurrenceCount: 8 })], confidenceCap: null });
    expect(result?.title).toContain('Masala Chai');
    expect(result?.title).toContain('Rasmalai');
  });

  it('is high confidence at or above the 5-order threshold', () => {
    const result = buildAovOpportunity({ pairs: [pair({ coOccurrenceCount: 5 })], confidenceCap: null });
    expect(result?.confidence).toBe('high');
  });

  it('is low confidence — with an explicit weak-evidence caveat — below the threshold, never silently treated as strong', () => {
    const result = buildAovOpportunity({ pairs: [pair({ coOccurrenceCount: 2 })], confidenceCap: null });
    expect(result?.confidence).toBe('low');
    expect(result?.reasoning).toContain('small number of shared orders');
  });

  it('produces a paired-item discount action, described as a pairing tactic — never claims to create a single bundled price', () => {
    const result = buildAovOpportunity({ pairs: [pair({})], confidenceCap: null });
    expect(result?.action).toEqual({
      type: 'set_discount',
      target: { scope: 'items', names: ['Masala Chai', 'Rasmalai'] },
      discount: { discountType: 'percentage', value: 10 },
    });
    expect(result?.reasoning).toContain('not a single bundled price');
  });

  it('caps confidence down for thin order history, never up', () => {
    const result = buildAovOpportunity({ pairs: [pair({ coOccurrenceCount: 8 })], confidenceCap: 'low' });
    expect(result?.confidence).toBe('low');
  });
});

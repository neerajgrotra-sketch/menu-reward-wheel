import { describe, it, expect } from 'vitest';
import { minConfidence, applyConfidenceCap, MIN_ORDERS_FOR_ANY_OPPORTUNITY, MIN_ORDERS_FOR_FULL_CONFIDENCE } from './facts';

describe('minConfidence', () => {
  it('returns the lower-ranked confidence, never the higher one', () => {
    expect(minConfidence('high', 'low')).toBe('low');
    expect(minConfidence('low', 'high')).toBe('low');
    expect(minConfidence('medium', 'high')).toBe('medium');
    expect(minConfidence('high', 'high')).toBe('high');
  });

  it('this is the fix for buildProposal() masking business-evidence confidence with a name-match "high"', () => {
    // A revenue opportunity's business evidence says 'low' (thin order
    // history), but its action always targets a real menu name, so
    // buildProposal()'s own match confidence is always 'high'. The override
    // must keep the weaker of the two, or the proposal an owner actually
    // reads would silently claim 'high' confidence.
    expect(minConfidence('low', 'high')).toBe('low');
  });
});

describe('applyConfidenceCap', () => {
  it('passes confidence through unchanged when there is no cap', () => {
    expect(applyConfidenceCap('high', null)).toBe('high');
  });

  it('pulls confidence down to the cap, never up', () => {
    expect(applyConfidenceCap('high', 'low')).toBe('low');
    expect(applyConfidenceCap('low', 'high')).toBe('low');
  });
});

describe('thin-data gate thresholds', () => {
  it('requires at least 5 completed orders before any opportunity is generated', () => {
    expect(MIN_ORDERS_FOR_ANY_OPPORTUNITY).toBe(5);
  });

  it('requires at least 20 completed orders before confidence is uncapped', () => {
    expect(MIN_ORDERS_FOR_FULL_CONFIDENCE).toBe(20);
  });
});

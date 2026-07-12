import { describe, it, expect } from 'vitest';
import { CAPABILITY_REGISTRY, isRegisteredCapability, isActiveCapability, explainCapabilityUnavailable, describeUnsupportedRequest } from './tool-registry';

describe('CAPABILITY_REGISTRY', () => {
  it('has exactly three active capabilities today — menu_pricing, revenue_intelligence, and menu_agent', () => {
    const active = Object.entries(CAPABILITY_REGISTRY).filter(([, entry]) => entry.status === 'active');
    expect(active.map(([key]) => key)).toEqual(['menu_pricing', 'revenue_intelligence', 'menu_agent']);
  });

  it('every planned capability has executionPermission "none" — none of them can write anything', () => {
    const planned = Object.values(CAPABILITY_REGISTRY).filter((entry) => entry.status === 'planned');
    expect(planned.length).toBeGreaterThan(0);
    for (const entry of planned) {
      expect('executionPermission' in entry && entry.executionPermission).toBe('none');
    }
  });
});

describe('isRegisteredCapability / isActiveCapability', () => {
  it('recognizes every registry key as registered', () => {
    for (const key of Object.keys(CAPABILITY_REGISTRY)) {
      expect(isRegisteredCapability(key)).toBe(true);
    }
  });

  it('rejects an unknown capability key', () => {
    expect(isRegisteredCapability('not_a_real_capability')).toBe(false);
  });

  it('menu_pricing and menu_agent are active, a still-planned capability is not', () => {
    expect(isActiveCapability('menu_pricing')).toBe(true);
    expect(isActiveCapability('menu_agent')).toBe(true);
    expect(isActiveCapability('analytics_agent')).toBe(false);
  });

  it('an unregistered key is never active', () => {
    expect(isActiveCapability('not_a_real_capability')).toBe(false);
  });
});

describe('explainCapabilityUnavailable', () => {
  it('uses the registry label for a known capability', () => {
    expect(explainCapabilityUnavailable('analytics_agent')).toContain('Sales Analytics');
  });

  it('degrades gracefully for a capability key not in the registry at all', () => {
    expect(explainCapabilityUnavailable('made_up_key')).toContain('made_up_key');
  });
});

describe('describeUnsupportedRequest', () => {
  it('names what is currently active alongside what was asked for', () => {
    const text = describeUnsupportedRequest('analytics_agent');
    expect(text).toContain('Menu Pricing');
    expect(text).toContain('Sales Analytics');
  });

  it('humanizes a free-text capability key not in the registry at all (e.g. the model naming "revenue_optimization")', () => {
    const text = describeUnsupportedRequest('revenue_optimization');
    expect(text).toContain('Revenue Optimization');
    expect(text).not.toContain('revenue_optimization');
  });

  it('never claims execution was attempted or blocked — purely an availability statement', () => {
    const text = describeUnsupportedRequest('campaign_agent');
    expect(text).not.toMatch(/applied|executed|failed|error/i);
  });
});

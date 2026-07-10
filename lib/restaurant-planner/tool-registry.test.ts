import { describe, it, expect } from 'vitest';
import { CAPABILITY_REGISTRY, isRegisteredCapability, isActiveCapability, explainCapabilityUnavailable } from './tool-registry';

describe('CAPABILITY_REGISTRY', () => {
  it('has exactly one active capability today — menu_pricing', () => {
    const active = Object.entries(CAPABILITY_REGISTRY).filter(([, entry]) => entry.status === 'active');
    expect(active.map(([key]) => key)).toEqual(['menu_pricing']);
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

  it('only menu_pricing is active', () => {
    expect(isActiveCapability('menu_pricing')).toBe(true);
    expect(isActiveCapability('analytics_agent')).toBe(false);
  });

  it('an unregistered key is never active', () => {
    expect(isActiveCapability('not_a_real_capability')).toBe(false);
  });
});

describe('explainCapabilityUnavailable', () => {
  it('uses the registry label for a known capability', () => {
    expect(explainCapabilityUnavailable('analytics_agent')).toContain('Analytics Agent');
  });

  it('degrades gracefully for a capability key not in the registry at all', () => {
    expect(explainCapabilityUnavailable('made_up_key')).toContain('made_up_key');
  });
});

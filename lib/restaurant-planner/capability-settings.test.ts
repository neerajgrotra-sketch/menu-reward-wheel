import { describe, it, expect } from 'vitest';
import { resolveCapabilityDecision, describeCapabilityUnavailable } from './capability-settings';

const base = {
  capabilityKey: 'menu_pricing',
  restaurantEnabled: null,
  ownerEnabled: null,
  environmentEnabled: null,
  legacyFlagEnabled: null,
};

describe('resolveCapabilityDecision — priority order', () => {
  it('restaurant-level wins over everything else, even when it disables what owner/environment enabled', () => {
    expect(
      resolveCapabilityDecision({ ...base, restaurantEnabled: false, ownerEnabled: true, environmentEnabled: true, legacyFlagEnabled: true }),
    ).toBe(false);
  });

  it('restaurant-level "on" wins even when environment default is off', () => {
    expect(resolveCapabilityDecision({ ...base, restaurantEnabled: true, environmentEnabled: false })).toBe(true);
  });

  it('owner-level wins over environment when no restaurant-level row exists', () => {
    expect(resolveCapabilityDecision({ ...base, ownerEnabled: true, environmentEnabled: false })).toBe(true);
    expect(resolveCapabilityDecision({ ...base, ownerEnabled: false, environmentEnabled: true })).toBe(false);
  });

  it('environment default applies when no restaurant or owner row exists', () => {
    expect(resolveCapabilityDecision({ ...base, environmentEnabled: true })).toBe(true);
    expect(resolveCapabilityDecision({ ...base, environmentEnabled: false })).toBe(false);
  });

  it('falls back to the legacy intelligence_features flag only for menu_pricing, only when nothing else is set', () => {
    expect(resolveCapabilityDecision({ ...base, legacyFlagEnabled: true })).toBe(true);
    expect(resolveCapabilityDecision({ ...base, legacyFlagEnabled: false })).toBe(false);
  });

  it('an environment-level row (even disabled) takes priority over the legacy flag — once set, the new system is authoritative', () => {
    expect(resolveCapabilityDecision({ ...base, environmentEnabled: false, legacyFlagEnabled: true })).toBe(false);
  });

  it('defaults to disabled for any non-menu_pricing capability with nothing configured anywhere', () => {
    expect(resolveCapabilityDecision({ ...base, capabilityKey: 'analytics_agent' })).toBe(false);
  });

  it('does not apply the legacy fallback to a capability other than menu_pricing, even if legacyFlagEnabled were somehow true', () => {
    expect(resolveCapabilityDecision({ ...base, capabilityKey: 'analytics_agent', legacyFlagEnabled: true })).toBe(false);
  });

  it('a restaurant-level row for a different capability does not leak into this decision (isolation is the caller\'s job via capabilityKey-scoped fetches, but the pure function itself trusts its inputs)', () => {
    // This test documents that resolveCapabilityDecision has no notion of
    // "which capability the restaurantEnabled value came from" — the caller
    // (isCapabilityEnabled) is responsible for fetching scoped strictly by
    // capability_key, which the live query does via .eq('capability_key', ...).
    expect(resolveCapabilityDecision({ ...base, restaurantEnabled: true })).toBe(true);
  });
});

describe('describeCapabilityUnavailable', () => {
  it('uses the provided label when given', () => {
    expect(describeCapabilityUnavailable('analytics_agent', 'Analytics Agent')).toBe(
      "Analytics Agent isn't turned on for this restaurant yet — ask your SpinBite platform admin to enable it.",
    );
  });

  it('falls back to the raw capability key when no label is given', () => {
    expect(describeCapabilityUnavailable('analytics_agent')).toContain('analytics_agent');
  });

  it('never claims execution was attempted or blocked — purely an availability statement', () => {
    const text = describeCapabilityUnavailable('menu_pricing', 'Menu Pricing');
    expect(text).not.toMatch(/applied|executed|failed|error/i);
  });
});

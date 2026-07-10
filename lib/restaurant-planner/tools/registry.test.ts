import { describe, it, expect } from 'vitest';
import { TOOL_REGISTRY, getTool, listToolsForCapability } from './registry';

describe('TOOL_REGISTRY', () => {
  it('gives every entry a well-formed ToolDefinition shape', () => {
    for (const [key, tool] of Object.entries(TOOL_REGISTRY)) {
      expect(tool.name, `registry key "${key}"`).toBeTruthy();
      expect(tool.description, `${key}.description`).toBeTruthy();
      expect(tool.capability, `${key}.capability`).toBeTruthy();
      expect(['read', 'propose', 'write']).toContain(tool.permission);
      expect(typeof tool.mutating).toBe('boolean');
      expect(tool.version).toBeGreaterThanOrEqual(1);
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('marks a tool mutating if and only if its permission is write', () => {
    for (const [key, tool] of Object.entries(TOOL_REGISTRY)) {
      expect(tool.mutating, key).toBe(tool.permission === 'write');
    }
  });

  it('aliases findItemsByName to the same tool object as searchMenuItems', () => {
    expect(TOOL_REGISTRY.findItemsByName).toBe(TOOL_REGISTRY.searchMenuItems);
  });

  it('aliases estimateRevenueImpact to the same tool object as estimatePromotionImpact', () => {
    expect(TOOL_REGISTRY.estimateRevenueImpact).toBe(TOOL_REGISTRY.estimatePromotionImpact);
  });

  it('aliases revalidateProposal to the same tool object as validateProposal', () => {
    expect(TOOL_REGISTRY.revalidateProposal).toBe(TOOL_REGISTRY.validateProposal);
  });

  it('has exactly one write tool: applyPromotion', () => {
    const writeTools = Object.entries(TOOL_REGISTRY).filter(([, tool]) => tool.permission === 'write');
    expect(writeTools.map(([key]) => key)).toEqual(['applyPromotion']);
  });
});

describe('getTool', () => {
  it('returns the named tool', () => {
    expect(getTool('getRestaurant')?.name).toBe('getRestaurant');
  });

  it('returns undefined for an unregistered name', () => {
    expect(getTool('doesNotExist')).toBeUndefined();
  });
});

describe('listToolsForCapability', () => {
  it('returns only tools registered under the given capability', () => {
    const tools = listToolsForCapability('menu_pricing');
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((t) => t.capability === 'menu_pricing')).toBe(true);
  });

  it('returns an empty array for a capability with no registered tools', () => {
    expect(listToolsForCapability('analytics_agent')).toEqual([]);
  });
});

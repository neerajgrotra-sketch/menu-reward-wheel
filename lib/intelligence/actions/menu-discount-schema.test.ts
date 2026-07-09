import { describe, it, expect } from 'vitest';
import { parseDashboardAssistantOutput, DashboardAssistantParseError } from './menu-discount-schema';

describe('parseDashboardAssistantOutput', () => {
  it('parses a plain-answer response', () => {
    const result = parseDashboardAssistantOutput('{"intent":"answer","answer":"Sales are down 12% vs. yesterday."}');
    expect(result).toEqual({ intent: 'answer', answer: 'Sales are down 12% vs. yesterday.' });
  });

  it('parses a clear_discount action targeting a category', () => {
    const raw = '{"intent":"menu_discount_action","action":{"type":"clear_discount","target":{"scope":"category","name":"Desserts"}}}';
    const result = parseDashboardAssistantOutput(raw);
    expect(result).toEqual({
      intent: 'menu_discount_action',
      action: { type: 'clear_discount', target: { scope: 'category', name: 'Desserts' } },
    });
  });

  it('parses a set_discount action with a schedule', () => {
    const raw = JSON.stringify({
      intent: 'menu_discount_action',
      action: {
        type: 'set_discount',
        target: { scope: 'category', name: 'Desserts' },
        discount: { discountType: 'percentage', value: 20, startTime: '19:00' },
      },
    });
    const result = parseDashboardAssistantOutput(raw);
    expect(result.intent).toBe('menu_discount_action');
  });

  it('parses a clear-all action', () => {
    const raw = '{"intent":"menu_discount_action","action":{"type":"clear_discount","target":{"scope":"all"}}}';
    expect(() => parseDashboardAssistantOutput(raw)).not.toThrow();
  });

  it('rejects invalid JSON', () => {
    expect(() => parseDashboardAssistantOutput('not json')).toThrow(DashboardAssistantParseError);
  });

  it('rejects an unrecognized intent', () => {
    expect(() => parseDashboardAssistantOutput('{"intent":"do_something_else"}')).toThrow(DashboardAssistantParseError);
  });

  it('rejects an answer intent with no answer text', () => {
    expect(() => parseDashboardAssistantOutput('{"intent":"answer"}')).toThrow(DashboardAssistantParseError);
  });

  it('rejects a percentage discount of 100 or more', () => {
    const raw = JSON.stringify({
      intent: 'menu_discount_action',
      action: {
        type: 'set_discount',
        target: { scope: 'item', name: 'Chai' },
        discount: { discountType: 'percentage', value: 100 },
      },
    });
    expect(() => parseDashboardAssistantOutput(raw)).toThrow(DashboardAssistantParseError);
  });

  it('rejects a discount target missing a name for scope=item', () => {
    const raw = JSON.stringify({
      intent: 'menu_discount_action',
      action: { type: 'clear_discount', target: { scope: 'item' } },
    });
    expect(() => parseDashboardAssistantOutput(raw)).toThrow(DashboardAssistantParseError);
  });
});

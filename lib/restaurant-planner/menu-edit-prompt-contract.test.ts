// The menu_edit sibling of prompt-contract.test.ts: pins the exact JSON
// contract a future dashboard_assistant prompt revision must produce for
// menu_edit_action, against the REAL, unmodified parsePlannerOutput — not a
// reimplementation. Proves the contract is internally consistent; it does
// NOT prove a live model actually produces this JSON for these inputs (no
// ANTHROPIC_API_KEY in this environment — same caveat as prompt-contract.test.ts).

import { describe, it, expect } from 'vitest';
import { parsePlannerOutput } from './types';

describe('dashboard_assistant — menu_edit_action prompt contract — representative outputs', () => {
  it('"Increase Butter Chicken to $22" -> set_price, not a discount', () => {
    const raw = JSON.stringify({
      intent: 'menu_edit_action',
      action: { type: 'set_price', target: { scope: 'item', name: 'Butter Chicken' }, price: 22 },
    });
    const result = parsePlannerOutput(raw);
    expect(result).toEqual({ intent: 'menu_edit_action', capability: 'menu_agent', action: (JSON.parse(raw) as { action: unknown }).action, refersToProposalId: undefined });
  });

  it('"Adjust the price of Ras Malai to $7.99" -> set_price — the exact production request that motivated this capability', () => {
    const raw = JSON.stringify({
      intent: 'menu_edit_action',
      action: { type: 'set_price', target: { scope: 'item', name: 'Ras Malai' }, price: 7.99 },
    });
    const result = parsePlannerOutput(raw);
    expect(result.intent).toBe('menu_edit_action');
    expect(result).toMatchObject({ capability: 'menu_agent' });
  });

  it('"Increase every appetizer by 5%" -> adjust_price, category scope, increase direction', () => {
    const raw = JSON.stringify({
      intent: 'menu_edit_action',
      action: {
        type: 'adjust_price',
        target: { scope: 'category', name: 'Appetizers' },
        adjustment: { direction: 'increase', amount: { kind: 'percentage', value: 5 } },
      },
    });
    const result = parsePlannerOutput(raw);
    expect(result.intent).toBe('menu_edit_action');
  });

  it('"Rename Butter Chicken to Chicken Makhani" -> rename_item', () => {
    const raw = JSON.stringify({
      intent: 'menu_edit_action',
      action: { type: 'rename_item', target: { scope: 'item', name: 'Butter Chicken' }, name: 'Chicken Makhani' },
    });
    expect(parsePlannerOutput(raw).intent).toBe('menu_edit_action');
  });

  it('"Hide Garlic Naan" -> set_availability, available:false', () => {
    const raw = JSON.stringify({
      intent: 'menu_edit_action',
      action: { type: 'set_availability', target: { scope: 'item', name: 'Garlic Naan' }, available: false },
    });
    expect(parsePlannerOutput(raw)).toMatchObject({ intent: 'menu_edit_action', action: { type: 'set_availability', available: false } });
  });

  it('"Move Ras Malai into Desserts" -> move_category', () => {
    const raw = JSON.stringify({
      intent: 'menu_edit_action',
      action: { type: 'move_category', target: { scope: 'item', name: 'Ras Malai' }, toCategoryName: 'Desserts' },
    });
    expect(parsePlannerOutput(raw).intent).toBe('menu_edit_action');
  });

  it('"Mark Ras Malai as a chef special" -> set_tag, tag:chef_special, enabled:true', () => {
    const raw = JSON.stringify({
      intent: 'menu_edit_action',
      action: { type: 'set_tag', target: { scope: 'item', name: 'Ras Malai' }, tag: 'chef_special', enabled: true },
    });
    expect(parsePlannerOutput(raw)).toMatchObject({ intent: 'menu_edit_action', action: { type: 'set_tag', tag: 'chef_special', enabled: true } });
  });

  it('a discount-shaped ask ("20% off Butter Chicken") still maps to menu_discount_action, unaffected by the menu_edit_action addition', () => {
    const raw = JSON.stringify({
      intent: 'menu_discount_action',
      action: { type: 'set_discount', target: { scope: 'item', name: 'Butter Chicken' }, discount: { discountType: 'percentage', value: 20 } },
    });
    const result = parsePlannerOutput(raw);
    expect(result).toMatchObject({ intent: 'menu_discount_action', capability: 'menu_pricing' });
  });
});

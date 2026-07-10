// Production-readiness checks for the dashboard_assistant prompt contract,
// written while auditing the live PlannerOutput shape before authoring the
// Intelligence Lab prompt template (2026-07-10). Distinct from the basic
// shape coverage in types.ts/types.test.ts and menu-discount-schema.test.ts —
// this file specifically documents/pins the malformed-output and boundary
// behaviors a production prompt template must be written to avoid, so a
// future change to parsePlannerOutput can't silently drift from what this
// audit verified. See docs/architecture/ask-spinbite-ai-agent-v1.md for the
// full contract audit and prompt template text (kept out of source per
// Rule 20 — prompts are database-owned IP, not committed here).

import { describe, it, expect } from 'vitest';
import { parsePlannerOutput, PlannerParseError } from './types';
import { resolveMenuDiscountAction, type ResolvableAction } from '@/lib/menu-discount-actions/resolve';
import type { MenuCategoryRow, MenuItemRow } from '@/lib/menu/queries';

describe('parsePlannerOutput — malformed model output', () => {
  it('rejects prose preceding JSON (the model must return JSON only, nothing else)', () => {
    const raw = 'Sure, here you go:\n{"intent":"answer","answer":"Sales are up."}';
    expect(() => parsePlannerOutput(raw)).toThrow(PlannerParseError);
  });

  // Reversed 2026-07-10: this used to assert the parser rejected fenced
  // JSON, on the theory that the prompt's "no markdown code fences"
  // instruction would be sufficient on its own. It wasn't — two real
  // dashboard_assistant calls in production failed this exact way within
  // a minute of the v2 prompt going live (Output validation failed: output
  // was not valid JSON). parsePlannerOutput now strips a wrapping fence
  // defensively (see stripCodeFence in types.ts) rather than trusting model
  // formatting discipline over the actual contract.
  it('tolerates markdown-fenced JSON — confirmed necessary by a real production failure, not just a defensive guess', () => {
    const raw = '```json\n{"intent":"answer","answer":"Sales are up."}\n```';
    expect(parsePlannerOutput(raw)).toEqual({ intent: 'answer', answer: 'Sales are up.' });
  });

  it('rejects an intent value outside the four supported ones (no "execute"/"applied" style intent exists)', () => {
    expect(() => parsePlannerOutput('{"intent":"applied","action":{}}')).toThrow(PlannerParseError);
  });

  it('rejects a menu_discount_action with a target missing a required name', () => {
    const raw = JSON.stringify({
      intent: 'menu_discount_action',
      action: { type: 'set_discount', target: { scope: 'item' }, discount: { discountType: 'percentage', value: 20 } },
    });
    expect(() => parsePlannerOutput(raw)).toThrow(PlannerParseError);
  });

  it('ignores an extra unrecognized field rather than erroring — the schema has no id field to hallucinate in the first place', () => {
    // There is no itemId/categoryId field anywhere in MenuDiscountAction — targets
    // are name-only by design (lib/intelligence/actions/menu-discount-schema.ts).
    // A model that invents one is harmless: it's silently ignored, never read.
    const raw = JSON.stringify({
      intent: 'menu_discount_action',
      action: {
        type: 'set_discount',
        target: { scope: 'item', name: 'Cardamom Chai', itemId: 'hallucinated-uuid' },
        discount: { discountType: 'percentage', value: 20 },
      },
    });
    const result = parsePlannerOutput(raw);
    expect(result.intent).toBe('menu_discount_action');
  });

  it('rejects a percentage discount of exactly 0', () => {
    const raw = JSON.stringify({
      intent: 'menu_discount_action',
      action: { type: 'set_discount', target: { scope: 'item', name: 'Chai' }, discount: { discountType: 'percentage', value: 0 } },
    });
    expect(() => parsePlannerOutput(raw)).toThrow(PlannerParseError);
  });

  it('rejects a percentage discount at or above 100', () => {
    const raw = JSON.stringify({
      intent: 'menu_discount_action',
      action: { type: 'set_discount', target: { scope: 'item', name: 'Chai' }, discount: { discountType: 'percentage', value: 100 } },
    });
    expect(() => parsePlannerOutput(raw)).toThrow(PlannerParseError);
  });

  it('rejects a negative discount value', () => {
    const raw = JSON.stringify({
      intent: 'menu_discount_action',
      action: { type: 'set_discount', target: { scope: 'item', name: 'Chai' }, discount: { discountType: 'percentage', value: -5 } },
    });
    expect(() => parsePlannerOutput(raw)).toThrow(PlannerParseError);
  });

  it('has no schema path for the model to assert a change is already applied — "applied" is not a valid intent and menu_discount_action never carries an outcome/status field', () => {
    // This is a shape-level guarantee only. A model can still write a false
    // claim inside a valid answer/clarification string (e.g. answer:
    // "Done, I've applied it!") — the parser cannot catch that; it's a
    // prompt-discipline requirement, not something automatable here.
    const raw = JSON.stringify({ intent: 'menu_discount_action', status: 'applied', action: { type: 'clear_discount', target: { scope: 'all' } } });
    const result = parsePlannerOutput(raw);
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('applied');
  });
});

describe('resolveMenuDiscountAction — hallucinated/absent item names never resolve (deterministic backstop)', () => {
  const categories: MenuCategoryRow[] = [
    { id: 'cat-breakfast', menu_id: 'menu-1', name: 'Breakfast', slug: 'breakfast', display_order: 10 },
  ];

  function item(overrides: Partial<MenuItemRow>): MenuItemRow {
    return {
      id: 'item-id', category_id: 'cat-breakfast', restaurant_id: 'r-1', name: 'Item', description: null,
      image_url: null, price: 3, is_featured: false, available: true, tags: [], display_order: 0,
      special_enabled: false, special_type: null, special_percent: null, special_price: null,
      special_start_at: null, special_end_at: null, special_no_expiry: false, ...overrides,
    };
  }

  const items: MenuItemRow[] = [
    item({ id: 'masala', name: 'Masala Chai' }),
    item({ id: 'cardamom', name: 'Cardamom Chai' }),
    item({ id: 'kashmiri', name: 'Kashmiri Chai' }),
  ];

  it('never resolves an item name that does not exist on the menu, even if the model invents one', () => {
    const action: ResolvableAction = {
      type: 'set_discount',
      target: { scope: 'item', name: 'Matcha Latte' },
      discount: { discountType: 'percentage', value: 20, specialStartAt: null, specialEndAt: null, specialNoExpiry: true },
    };
    const result = resolveMenuDiscountAction(action, categories, items);
    expect(result.resolved).toBe(false);
  });

  it('a single-name-fragment target with 3 real matches is always ambiguous — there is no "apply to all fragment matches" scope', () => {
    // Confirms a real Phase 1 contract gap surfaced during the dashboard_assistant
    // prompt audit: DiscountTarget only supports scope 'all' | 'category' | 'item'
    // (single name). "chai" matches 3 real items that don't share a category, so
    // it can NEVER resolve directly to a multi-item proposal — only to
    // clarification. The prompt must not promise otherwise.
    const action: ResolvableAction = {
      type: 'set_discount',
      target: { scope: 'item', name: 'chai' },
      discount: { discountType: 'percentage', value: 20, specialStartAt: null, specialEndAt: null, specialNoExpiry: true },
    };
    const result = resolveMenuDiscountAction(action, categories, items);
    expect(result.resolved).toBe(false);
    if (result.resolved) throw new Error('expected ambiguous');
    expect(result.candidates?.sort()).toEqual(['Cardamom Chai', 'Kashmiri Chai', 'Masala Chai'].sort());
  });
});

// V2 audit (Restaurant Planner V2 activation pass) — cases specifically
// requested for the production-readiness check: adversarial output the
// model must never be able to use to fake confidence/impact/execution, and
// the exact refersToProposalId contract (distinct from the `proposalId`
// request-body field used by the preview/apply/target-selection ROUTES,
// which the model never sees or sets).
describe('parsePlannerOutput — V2 additions', () => {
  it('ignores model-supplied confidence/revenueImpact/margin — these are computed server-side only and the schema has no field for them', () => {
    const raw = JSON.stringify({
      intent: 'menu_discount_action',
      action: { type: 'set_discount', target: { scope: 'item', name: 'Cardamom Chai' }, discount: { discountType: 'percentage', value: 20 } },
      confidence: 'high',
      revenueImpact: '+50%',
      margin: '90%',
    });
    const result = parsePlannerOutput(raw);
    expect(result).not.toHaveProperty('confidence');
    expect(result).not.toHaveProperty('revenueImpact');
    expect(result).not.toHaveProperty('margin');
  });

  it('rejects an unsupported target scope value rather than passing it through', () => {
    const raw = JSON.stringify({
      intent: 'menu_discount_action',
      action: { type: 'set_discount', target: { scope: 'everything_matching', query: 'chai' }, discount: { discountType: 'percentage', value: 20 } },
    });
    expect(() => parsePlannerOutput(raw)).toThrow(PlannerParseError);
  });

  it('rejects a blank/whitespace-only refersToProposalId rather than silently treating it as a fresh proposal', () => {
    const raw = JSON.stringify({
      intent: 'menu_discount_action',
      action: { type: 'clear_discount', target: { scope: 'all' } },
      refersToProposalId: '   ',
    });
    expect(() => parsePlannerOutput(raw)).toThrow(PlannerParseError);
  });

  it('accepts a well-formed refersToProposalId — verification that it points at a still-open proposal happens server-side (proposals.ts findOpenProposalGroup), not in the parser', () => {
    const raw = JSON.stringify({
      intent: 'menu_discount_action',
      action: { type: 'set_discount', target: { scope: 'item', name: 'Cardamom Chai' }, discount: { discountType: 'percentage', value: 15 } },
      refersToProposalId: 'c1c1c1c1-0000-0000-0000-000000000000',
    });
    const result = parsePlannerOutput(raw);
    expect(result).toMatchObject({ refersToProposalId: 'c1c1c1c1-0000-0000-0000-000000000000' });
  });
});

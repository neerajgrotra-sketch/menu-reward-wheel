import { describe, it, expect } from 'vitest';
import { parsePlannerOutput, PlannerParseError } from './types';

describe('parsePlannerOutput', () => {
  it('parses a plain-answer response', () => {
    const result = parsePlannerOutput('{"intent":"answer","answer":"Sales are down 12% vs. yesterday."}');
    expect(result).toEqual({ intent: 'answer', answer: 'Sales are down 12% vs. yesterday.' });
  });

  it('parses a clarification response', () => {
    const raw = '{"intent":"clarification","question":"I found 3 items matching chai — which one?"}';
    const result = parsePlannerOutput(raw);
    expect(result).toEqual({ intent: 'clarification', question: 'I found 3 items matching chai — which one?' });
  });

  it('parses an unsupported response with an optional note', () => {
    const raw = '{"intent":"unsupported","capability":"combo_builder","note":"Combos aren\'t supported yet."}';
    const result = parsePlannerOutput(raw);
    expect(result).toEqual({ intent: 'unsupported', capability: 'combo_builder', note: "Combos aren't supported yet." });
  });

  it('parses an unsupported response without a note', () => {
    const result = parsePlannerOutput('{"intent":"unsupported","capability":"analytics"}');
    expect(result).toEqual({ intent: 'unsupported', capability: 'analytics', note: undefined });
  });

  it('parses a menu_discount_action response and tags it with capability menu_pricing', () => {
    const raw = JSON.stringify({
      intent: 'menu_discount_action',
      action: {
        type: 'set_discount',
        target: { scope: 'item', name: 'Cardamom Chai' },
        discount: { discountType: 'percentage', value: 20 },
      },
    });
    const result = parsePlannerOutput(raw);
    expect(result.intent).toBe('menu_discount_action');
    expect(result).toMatchObject({ capability: 'menu_pricing' });
  });

  it('rejects invalid JSON', () => {
    expect(() => parsePlannerOutput('not json')).toThrow(PlannerParseError);
  });

  it('rejects an unrecognized intent', () => {
    expect(() => parsePlannerOutput('{"intent":"do_something_else"}')).toThrow(PlannerParseError);
  });

  it('rejects an answer intent with no answer text', () => {
    expect(() => parsePlannerOutput('{"intent":"answer"}')).toThrow(PlannerParseError);
  });

  it('rejects a clarification intent with no question text', () => {
    expect(() => parsePlannerOutput('{"intent":"clarification"}')).toThrow(PlannerParseError);
  });

  it('rejects an unsupported intent with no capability string', () => {
    expect(() => parsePlannerOutput('{"intent":"unsupported"}')).toThrow(PlannerParseError);
  });

  it('rejects a menu_discount_action intent with a malformed action', () => {
    expect(() => parsePlannerOutput('{"intent":"menu_discount_action","action":{"type":"nope"}}')).toThrow(PlannerParseError);
  });

  describe('V2 additions', () => {
    it('parses a clarification with structured candidates', () => {
      const raw = JSON.stringify({
        intent: 'clarification',
        question: 'Which chai?',
        candidates: [
          { name: 'Cardamom Chai', categoryName: 'Breakfast' },
          { name: 'Masala Chai', categoryName: 'Breakfast' },
        ],
      });
      const result = parsePlannerOutput(raw);
      expect(result).toMatchObject({ intent: 'clarification', candidates: [{ name: 'Cardamom Chai', categoryName: 'Breakfast' }, { name: 'Masala Chai', categoryName: 'Breakfast' }] });
    });

    it('rejects malformed candidates (missing categoryName)', () => {
      const raw = JSON.stringify({ intent: 'clarification', question: 'Which?', candidates: [{ name: 'Chai' }] });
      expect(() => parsePlannerOutput(raw)).toThrow(PlannerParseError);
    });

    it('parses a menu_discount_action with refersToProposalId (a modification of an open proposal)', () => {
      const raw = JSON.stringify({
        intent: 'menu_discount_action',
        action: { type: 'set_discount', target: { scope: 'item', name: 'Cardamom Chai' }, discount: { discountType: 'percentage', value: 15 } },
        refersToProposalId: 'a1b2c3',
      });
      const result = parsePlannerOutput(raw);
      expect(result).toMatchObject({ intent: 'menu_discount_action', refersToProposalId: 'a1b2c3' });
    });

    it('omits refersToProposalId for a fresh (non-modification) proposal', () => {
      const raw = JSON.stringify({
        intent: 'menu_discount_action',
        action: { type: 'clear_discount', target: { scope: 'all' } },
      });
      const result = parsePlannerOutput(raw);
      expect(result).toMatchObject({ intent: 'menu_discount_action', refersToProposalId: undefined });
    });

    it('rejects a blank refersToProposalId rather than silently accepting it', () => {
      const raw = JSON.stringify({
        intent: 'menu_discount_action',
        action: { type: 'clear_discount', target: { scope: 'all' } },
        refersToProposalId: '   ',
      });
      expect(() => parsePlannerOutput(raw)).toThrow(PlannerParseError);
    });
  });

  describe('Revenue Intelligence Agent V1 — revenue_goal intent', () => {
    it('parses a recognized goal', () => {
      const result = parsePlannerOutput('{"intent":"revenue_goal","goal":"increase_beverage_sales"}');
      expect(result).toEqual({ intent: 'revenue_goal', goal: 'increase_beverage_sales' });
    });

    it('rejects a goal outside the closed 8-value enum — never trusts free-text goal classification', () => {
      expect(() => parsePlannerOutput('{"intent":"revenue_goal","goal":"increase_catering_orders"}')).toThrow(PlannerParseError);
    });

    it('rejects a missing goal', () => {
      expect(() => parsePlannerOutput('{"intent":"revenue_goal"}')).toThrow(PlannerParseError);
    });
  });
});

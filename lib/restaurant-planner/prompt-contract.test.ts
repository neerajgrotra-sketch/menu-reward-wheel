// Validates the exact JSON contract the dashboard_assistant prompt template
// (v2, intelligence_prompt_templates) must produce, against the REAL,
// unmodified parsePlannerOutput — not a reimplementation. This is the
// closest verification possible in an environment with no ANTHROPIC_API_KEY
// configured (see the Revenue Intelligence V1 controlled-activation report
// for the full caveat): it proves the contract is internally consistent and
// that every representative output the v2 prompt's own worked examples
// promise will actually parse into the correct PlannerOutput shape. It does
// NOT prove the live Anthropic model actually produces this JSON for these
// inputs — that requires a real model call this environment cannot make.
//
// Each case here mirrors one of the controlled-activation test inputs
// verbatim, paired with the JSON a compliant v2-prompt response must return
// for that input per the prompt's own REVENUE GOALS / OUTPUT CONTRACT
// sections.

import { describe, it, expect } from 'vitest';
import { parsePlannerOutput } from './types';

describe('dashboard_assistant v2 prompt contract — representative outputs', () => {
  describe('goal-shaped requests classify as revenue_goal with the exact live enum value', () => {
    const cases: Array<[string, string]> = [
      ['Increase dessert sales', 'increase_dessert_sales'],
      ['Help me sell more chai', 'increase_beverage_sales'],
      ['Increase average order value', 'increase_average_order_value'],
      ['Improve lunch traffic', 'increase_lunch_traffic'],
      ['Improve dinner sales', 'increase_dinner_traffic'],
      ['Increase QR ordering', 'increase_qr_adoption'],
      ['Improve promotion engagement', 'increase_promotion_engagement'],
      ['Increase coupon redemption', 'increase_coupon_redemption'],
    ];

    it.each(cases)('%s -> {"intent":"revenue_goal","goal":"%s"}', (_input, goal) => {
      const raw = JSON.stringify({ intent: 'revenue_goal', goal });
      const result = parsePlannerOutput(raw);
      expect(result).toEqual({ intent: 'revenue_goal', goal });
    });

    it('rejects the enum value literally written in the activation brief (increase_qr_ordering_adoption) — the real live code value is increase_qr_adoption', () => {
      expect(() => parsePlannerOutput('{"intent":"revenue_goal","goal":"increase_qr_ordering_adoption"}')).toThrow();
    });
  });

  it('a specific, parameterized discount instruction still maps to menu_discount_action, unchanged by the v2 prompt addition', () => {
    const raw = JSON.stringify({
      intent: 'menu_discount_action',
      action: { type: 'set_discount', target: { scope: 'category', name: 'Desserts' }, discount: { discountType: 'percentage', value: 20 } },
    });
    const result = parsePlannerOutput(raw);
    expect(result.intent).toBe('menu_discount_action');
    expect(result).toMatchObject({ capability: 'menu_pricing' });
  });

  it('a request outside every registered capability still maps to unsupported, unchanged by the v2 prompt addition', () => {
    const raw = JSON.stringify({ intent: 'unsupported', capability: 'social_media_campaign' });
    const result = parsePlannerOutput(raw);
    expect(result).toEqual({ intent: 'unsupported', capability: 'social_media_campaign', note: undefined });
  });

  it('the revenue_goal shape carries no metric/confidence/impact/recommendation fields even if a non-compliant model tried to add them — parser only reads intent+goal', () => {
    // Simulates a model that ignored "return ONLY the goal key" and tried to
    // pad the response with fabricated analysis — the real parser must
    // still only extract {intent, goal}, proving extra fields can't leak
    // model-invented numbers into the app even if the prompt were violated.
    const raw = JSON.stringify({
      intent: 'revenue_goal',
      goal: 'increase_dessert_sales',
      confidence: 'high',
      expectedImpact: '+25%',
      recommendation: 'Discount all desserts by 30%',
    });
    const result = parsePlannerOutput(raw);
    expect(result).toEqual({ intent: 'revenue_goal', goal: 'increase_dessert_sales' });
    expect(result).not.toHaveProperty('confidence');
    expect(result).not.toHaveProperty('expectedImpact');
  });
});

// Regression test for the "generate() throws ValidationError, but
// messages/route.ts only catches PlannerParseError" bug found live in
// production 2026-07-12 (a malformed menu_edit_action from the model left
// the user's message with no assistant reply at all, instead of the
// intended graceful "couldn't be understood, try rephrasing" fallback).
// generate() and buildMenuSnapshot both do real network/DB work, so this is
// the one place in this codebase that reaches for vi.mock rather than a
// hand-rolled fake client — runPlannerTurn calls them directly, not via an
// injected dependency, and this test exists specifically to prove the
// catch/translate logic around that real call, not to re-test generate()
// or buildMenuSnapshot themselves (both already have their own coverage).

import { describe, it, expect, vi } from 'vitest';
import { runPlannerTurn } from './planner-engine';
import { PlannerParseError } from './types';
import { ValidationError } from '@/lib/intelligence/validators';

vi.mock('./context', () => ({ buildMenuSnapshot: vi.fn().mockResolvedValue('menu snapshot') }));
vi.mock('@/lib/intelligence/intelligence-engine', () => ({ generate: vi.fn() }));

import { generate } from '@/lib/intelligence/intelligence-engine';

const baseParams = {
  restaurantId: 'r1',
  userId: 'u1',
  message: 'remove the special first',
  conversationHistory: '',
  dashboardContext: {},
  supabase: {} as any,
};

describe('runPlannerTurn — ValidationError is translated into PlannerParseError', () => {
  it('translates a ValidationError from generate() into a PlannerParseError, unwrapping the double prefix', async () => {
    vi.mocked(generate).mockRejectedValueOnce(
      new ValidationError('dashboard_assistant', 'Could not parse restaurant planner output: menu_edit_action intent had a malformed "action"'),
    );
    try {
      await runPlannerTurn(baseParams);
      throw new Error('expected runPlannerTurn to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(PlannerParseError);
      expect((err as Error).message).toMatch(/menu_edit_action intent had a malformed "action"/);
    }
  });

  it('does NOT double-prefix "Could not parse restaurant planner output" — appears exactly once in the final message', async () => {
    vi.mocked(generate).mockRejectedValueOnce(
      new ValidationError('dashboard_assistant', 'Could not parse restaurant planner output: some reason'),
    );
    try {
      await runPlannerTurn(baseParams);
      throw new Error('expected runPlannerTurn to reject');
    } catch (err) {
      const message = (err as Error).message;
      const occurrences = message.match(/Could not parse restaurant planner output/g) ?? [];
      expect(occurrences).toHaveLength(1);
    }
  });

  it('propagates a non-ValidationError unchanged (e.g. a real network/provider failure) — no fallback swallowing', async () => {
    vi.mocked(generate).mockRejectedValueOnce(new Error('provider timeout'));
    await expect(runPlannerTurn(baseParams)).rejects.toThrow('provider timeout');
    await expect(runPlannerTurn(baseParams)).rejects.not.toBeInstanceOf(PlannerParseError);
  });

  it('parses successfully when generate() succeeds — unaffected by the try/catch addition', async () => {
    vi.mocked(generate).mockResolvedValueOnce({
      output: JSON.stringify({ intent: 'answer', answer: 'Ras Malai is $6.99.' }),
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 100,
      estimatedCostUsd: 0.001,
    });
    const result = await runPlannerTurn(baseParams);
    expect(result.output).toEqual({ intent: 'answer', answer: 'Ras Malai is $6.99.' });
  });
});

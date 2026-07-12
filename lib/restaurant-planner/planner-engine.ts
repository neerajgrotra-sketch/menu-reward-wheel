// The Restaurant Planner's entry point: turns a user message + conversation
// history into a classified, structured PlannerOutput. Phase 1 is a single
// generate() call (real menu data is given as context up front, see
// context.ts) rather than a live model-initiated tool-calling loop — the
// existing deterministic post-hoc resolver already guarantees "never
// hallucinate menu items" without one (see lib/menu-discount-actions/resolve.ts),
// and a single call is simpler and cheaper. This function is the seam: if a
// future capability genuinely needs iterative live search (e.g. an
// Analytics Agent querying order data multiple ways before answering),
// swapping this call for a real Anthropic tool-calling loop is a localized
// change here, not a redesign of the route, the persistence schema, or the
// capability registry.
//
// Found live in production 2026-07-12: messages/route.ts has always caught
// PlannerParseError specifically to show a graceful "couldn't be understood,
// try rephrasing" fallback instead of a hard failure. That catch could never
// actually fire — generate() already runs the model's raw output through
// validators.ts's dashboard_assistant validator, which itself calls
// parsePlannerOutput() and, on failure, throws ValidationError (a different
// class) rather than letting PlannerParseError escape. The result: any
// malformed model output has always produced a raw 500 ("Generation
// produced no usable output") with the user's message persisted and no
// assistant reply at all, never the intended friendly fallback. Translating
// ValidationError back into PlannerParseError here — the one place that
// already knows both the generate() call and the parse contract — is what
// makes messages/route.ts's existing catch reachable for real.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { generate } from '@/lib/intelligence/intelligence-engine';
import { ValidationError } from '@/lib/intelligence/validators';
import { buildMenuSnapshot } from './context';
import { parsePlannerOutput, PlannerParseError, type PlannerOutput } from './types';

export type PlannerTurnParams = {
  restaurantId: string;
  userId: string;
  message: string;
  conversationHistory: string;
  dashboardContext: Record<string, string>;
  supabase: SupabaseClient<Database>;
};

export type PlannerTurnResult = {
  output: PlannerOutput;
  inputTokens: number;
  outputTokens: number;
};

export async function runPlannerTurn(params: PlannerTurnParams): Promise<PlannerTurnResult> {
  const menuSnapshot = await buildMenuSnapshot(params.supabase, params.restaurantId);

  let result: Awaited<ReturnType<typeof generate>>;
  try {
    result = await generate({
      featureKey: 'dashboard_assistant',
      restaurantId: params.restaurantId,
      userId: params.userId,
      rawInput: {
        question: params.message,
        conversation_history: params.conversationHistory,
        menu_snapshot: menuSnapshot,
        ...params.dashboardContext,
      },
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      // ValidationError's own message is already "Output validation failed
      // for 'dashboard_assistant': Could not parse restaurant planner
      // output: <reason>" — validators.ts's dashboard_assistant validator
      // wraps the ORIGINAL PlannerParseError.message (which already carries
      // the "Could not parse..." prefix) without stripping it first. Strip
      // both known prefixes so PlannerParseError's constructor (which adds
      // its own single "Could not parse restaurant planner output:" prefix)
      // doesn't end up doubling it.
      const reason = err.message
        .replace(/^Output validation failed for '[^']+': /, '')
        .replace(/^Could not parse restaurant planner output: /, '');
      throw new PlannerParseError(reason);
    }
    throw err;
  }

  return {
    output: parsePlannerOutput(result.output),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

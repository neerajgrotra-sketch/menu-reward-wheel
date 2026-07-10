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

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { generate } from '@/lib/intelligence/intelligence-engine';
import { buildMenuSnapshot } from './context';
import { parsePlannerOutput, type PlannerOutput } from './types';

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

  const result = await generate({
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

  return {
    output: parsePlannerOutput(result.output),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

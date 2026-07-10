// The Restaurant Planner's structured output contract. This is what
// dashboard_assistant's prompt template must return as strict JSON (enforced
// by lib/intelligence/validators.ts) instead of prose — it supersedes the
// old two-member DashboardAssistantOutput union
// (lib/intelligence/actions/menu-discount-schema.ts, now just the
// menu_pricing capability's action shape).
//
// `capability` is a string, not a hardcoded enum of the one capability that
// exists today — a future Pricing/Promotion/Analytics/... agent is a new
// capability literal plus a new lib/restaurant-planner/capabilities/*.ts
// module registered in tool-registry.ts, not a change to this type or to
// any switch that dispatches on `intent`.

import { isMenuDiscountAction, type MenuDiscountAction } from '@/lib/intelligence/actions/menu-discount-schema';
import type { Confidence } from './proposal';

// V2 candidate shape for a clarification that needs a structured selector
// (components/admin/dashboard/TargetSelector.tsx) instead of a plain
// question bubble. Always sourced from the deterministic resolver via
// buildProposal() (lib/restaurant-planner/capabilities/menu-pricing.ts) —
// the model never supplies these itself, so they can never be hallucinated.
export type PlannerCandidate = { name: string; categoryName: string };

// Revenue Intelligence Agent V1 — the closed set of business goals the model
// is allowed to classify a message into. Deliberately a strict, server-
// validated enum (not free text) so the deterministic analysis pipeline in
// lib/restaurant-planner/revenue-intelligence/ never has to interpret
// arbitrary model prose — see docs/architecture (Revenue Intelligence
// Framework v1) for why only some of these 8 goals actually produce a
// proposal (increase_qr_adoption/increase_coupon_redemption never do; no
// honest MenuDiscountAction lever exists for either).
export const REVENUE_GOAL_KEYS = [
  'increase_dessert_sales',
  'increase_beverage_sales',
  'increase_average_order_value',
  'increase_lunch_traffic',
  'increase_dinner_traffic',
  'increase_promotion_engagement',
  'increase_qr_adoption',
  'increase_coupon_redemption',
] as const;

export type RevenueGoalKey = (typeof REVENUE_GOAL_KEYS)[number];

export function isRevenueGoalKey(value: unknown): value is RevenueGoalKey {
  return typeof value === 'string' && (REVENUE_GOAL_KEYS as readonly string[]).includes(value);
}

// Owner-facing goal phrasing — shared by the server (messages/route.ts's
// intro line) and the client (RevenueOpportunityList.tsx's goal badge) so
// the two never drift apart into two different labels for the same goal.
export const REVENUE_GOAL_LABEL: Record<RevenueGoalKey, string> = {
  increase_dessert_sales: 'dessert sales',
  increase_beverage_sales: 'beverage sales',
  increase_average_order_value: 'average order value',
  increase_lunch_traffic: 'lunch traffic',
  increase_dinner_traffic: 'dinner traffic',
  increase_promotion_engagement: 'promotion engagement',
  increase_qr_adoption: 'QR ordering adoption',
  increase_coupon_redemption: 'coupon redemption',
};

// One ranked recommendation from the Revenue Intelligence Agent. Every
// string field here is deterministically templated in
// lib/restaurant-planner/revenue-intelligence/ — never LLM-authored — so
// `observation`/`reasoning`/`assumptions` can never be fabricated the way
// free model prose could be. `action` is a real, existing MenuDiscountAction
// (never a new action shape) — see the architecture doc's "central design
// tension" section for why every opportunity is honestly reframed onto this
// one executable type rather than a literal "bundle" or "feature" action
// that doesn't exist yet.
export type RevenueOpportunity = {
  id: string;
  goal: RevenueGoalKey;
  title: string;
  action: MenuDiscountAction;
  requiredCapability: 'menu_pricing';
  expectedImpact: string | null;
  confidence: Confidence;
  observation: string;
  reasoning: string;
  assumptions: string[];
  toolsUsed: string[];
  affectedItems: string[];
};

export type PlannerOutput =
  | { intent: 'answer'; answer: string }
  // The planner's own clarifying question, grounded in the menu snapshot
  // it was shown (lib/restaurant-planner/context.ts) — distinct from the
  // deterministic 'action_outcome' ambiguity message the discount resolver
  // produces after a name fails to match; both can appear in one thread.
  // `candidates` (V2) is populated server-side, never by the model — see
  // PlannerCandidate above.
  | { intent: 'clarification'; question: string; candidates?: PlannerCandidate[] }
  // The planner recognized a real business intent (e.g. "create a lunch
  // combo") but no capability is registered for it yet — degrade
  // gracefully instead of hallucinating an action.
  | { intent: 'unsupported'; capability: string; note?: string }
  // Revenue Intelligence Agent V1: the model's ONLY job for a goal-shaped
  // ask ("increase beverage sales") is to classify which of the 8 closed
  // RevenueGoalKey values it maps to — never to invent a discount itself
  // (that's what a specific, parameterized ask like "20% off desserts"
  // still does, via menu_discount_action below, unchanged). Everything
  // downstream of this classification is deterministic code — see
  // lib/restaurant-planner/capabilities/revenue-intelligence.ts.
  | { intent: 'revenue_goal'; goal: RevenueGoalKey }
  // `refersToProposalId` (V2, optional): the model echoes back an id it was
  // shown verbatim in conversation_history (buildTranscript tags the
  // conversation's currently-open proposal) when a follow-up modifies it —
  // never invented, always re-verified server-side before being trusted
  // (lib/restaurant-planner/proposals.ts) — omitted means "start a new
  // proposal," never guessed.
  | { intent: 'menu_discount_action'; capability: 'menu_pricing'; action: MenuDiscountAction; refersToProposalId?: string };

export class PlannerParseError extends Error {
  constructor(reason: string) {
    super(`Could not parse restaurant planner output: ${reason}`);
    this.name = 'PlannerParseError';
  }
}

// Defensive: strips a markdown code fence around the JSON if the model
// added one despite the prompt explicitly saying not to — a common habit
// for shorter responses, and confirmed live in production (two real
// dashboard_assistant calls failed this exact way immediately after the
// v2 prompt went live: short, non-JSON output on an otherwise-working
// model call). A no-op for already-bare JSON, so this can never change
// behavior for a compliant response — only rescues a non-compliant one
// that would otherwise be silently dropped as a parse failure.
function stripCodeFence(raw: string): string {
  const fenced = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : raw;
}

export function parsePlannerOutput(raw: string): PlannerOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    throw new PlannerParseError('output was not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new PlannerParseError('output was not a JSON object');
  }
  const obj = parsed as Record<string, unknown>;

  if (obj.intent === 'answer') {
    if (typeof obj.answer !== 'string' || obj.answer.trim().length === 0) {
      throw new PlannerParseError('answer intent missing a non-empty "answer" string');
    }
    return { intent: 'answer', answer: obj.answer };
  }

  if (obj.intent === 'clarification') {
    if (typeof obj.question !== 'string' || obj.question.trim().length === 0) {
      throw new PlannerParseError('clarification intent missing a non-empty "question" string');
    }
    let candidates: PlannerCandidate[] | undefined;
    if (obj.candidates !== undefined) {
      if (!isPlannerCandidateArray(obj.candidates)) {
        throw new PlannerParseError('clarification intent had malformed "candidates"');
      }
      candidates = obj.candidates;
    }
    return { intent: 'clarification', question: obj.question, candidates };
  }

  if (obj.intent === 'unsupported') {
    if (typeof obj.capability !== 'string' || obj.capability.trim().length === 0) {
      throw new PlannerParseError('unsupported intent missing a non-empty "capability" string');
    }
    const note = typeof obj.note === 'string' ? obj.note : undefined;
    return { intent: 'unsupported', capability: obj.capability, note };
  }

  if (obj.intent === 'revenue_goal') {
    if (!isRevenueGoalKey(obj.goal)) {
      throw new PlannerParseError('revenue_goal intent had a malformed or unrecognized "goal"');
    }
    return { intent: 'revenue_goal', goal: obj.goal };
  }

  if (obj.intent === 'menu_discount_action') {
    if (!isMenuDiscountAction(obj.action)) {
      throw new PlannerParseError('menu_discount_action intent had a malformed "action"');
    }
    if (obj.refersToProposalId !== undefined && (typeof obj.refersToProposalId !== 'string' || obj.refersToProposalId.trim().length === 0)) {
      throw new PlannerParseError('menu_discount_action intent had a malformed "refersToProposalId"');
    }
    const refersToProposalId = typeof obj.refersToProposalId === 'string' ? obj.refersToProposalId : undefined;
    return { intent: 'menu_discount_action', capability: 'menu_pricing', action: obj.action, refersToProposalId };
  }

  throw new PlannerParseError(`unrecognized intent "${String(obj.intent)}"`);
}

function isPlannerCandidateArray(value: unknown): value is PlannerCandidate[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as Record<string, unknown>).name === 'string' &&
        typeof (v as Record<string, unknown>).categoryName === 'string',
    )
  );
}

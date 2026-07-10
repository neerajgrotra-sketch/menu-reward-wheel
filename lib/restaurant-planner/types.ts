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

// V2 candidate shape for a clarification that needs a structured selector
// (components/admin/dashboard/TargetSelector.tsx) instead of a plain
// question bubble. Always sourced from the deterministic resolver via
// buildProposal() (lib/restaurant-planner/capabilities/menu-pricing.ts) —
// the model never supplies these itself, so they can never be hallucinated.
export type PlannerCandidate = { name: string; categoryName: string };

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

export function parsePlannerOutput(raw: string): PlannerOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
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

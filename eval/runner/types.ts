// Ask SpinBite Evaluation Framework — shared types.
//
// Golden conversations never call the LLM (see eval/README.md for the
// two-tier design). A turn stores the exact raw JSON a model call produced
// (or, for `recordedSource: 'hand-authored'`, JSON hand-written to
// precisely match the documented output contract in the currently-active
// dashboard_assistant prompt — visibly flagged as unvalidated against a
// real model until a Tier 2 capture promotes it). The replay runner feeds
// that JSON straight into the REAL parsePlannerOutput, then drives the REAL
// downstream functions through a capability-specific adapter.

import type { CapabilityKey } from '@/lib/restaurant-planner/tool-registry';
import type { RevenueGoalKey, PlannerOutput } from '@/lib/restaurant-planner/types';
import type { Confidence } from '@/lib/restaurant-planner/proposal';
import type { MatchKind } from '@/lib/menu-discount-actions/resolve';
import type { MenuRow, MenuCategoryRow, MenuItemRow } from '@/lib/menu/queries';
import type { FakeSupabaseClient } from './fake-supabase';

// --- Fixtures ---------------------------------------------------------

// Narrow shape actually consumed by fetchAssignedMenus — not the full
// generated Row type, since the real query only ever selects these columns
// (see lib/menu/queries.ts).
export type MenuAssignmentFixture = {
  restaurant_id: string;
  menu_id: string;
  active: boolean;
  display_order: number;
  created_at: string;
};

export type RestaurantFixture = {
  id: string;
  ownerId: string;
  name: string;
};

// `active`/`deleted_at` aren't part of the narrow MenuRow/MenuCategoryRow/
// MenuItemRow types (those are SELECT-projections used by lib/menu/queries.ts,
// which never returns those columns) — but fetchAssignedMenus/fetchMenuContents
// DO filter on them (`.eq('active', true)`, `.is('deleted_at', null)`), so a
// fixture backing the fake Supabase client needs to carry them for those
// filters to match anything. Real DB rows always have these columns; this
// is just restoring them for the fixture's own filtering purposes.
export type MenuFixtureMenu = MenuRow & { active: boolean };
export type MenuFixtureCategory = MenuCategoryRow & { active: boolean };
export type MenuFixtureItem = MenuItemRow & { active: boolean; deleted_at: string | null };

export type MenuFixture = {
  menus: MenuFixtureMenu[];
  assignments: MenuAssignmentFixture[];
  categories: MenuFixtureCategory[];
  items: MenuFixtureItem[];
};

// --- Expected outcomes, discriminated by parsed intent -----------------

export type ExpectedAnswer = { intent: 'answer'; answerContains?: string[] };
export type ExpectedClarification = { intent: 'clarification'; questionContains?: string[]; candidateNames?: string[] };
export type ExpectedUnsupported = { intent: 'unsupported'; capability: string };

export type ExpectedOpportunityResult = {
  kind: 'opportunities';
  count: number;
  firstOpportunity?: {
    goal: RevenueGoalKey;
    confidence: Confidence;
    actionType: 'set_discount' | 'clear_discount';
    reasoningContains?: string[];
  };
};
export type ExpectedAnswerOnlyResult = { kind: 'answer'; textContains?: string[] };
export type ExpectedDeterministicResult = ExpectedOpportunityResult | ExpectedAnswerOnlyResult;

export type ExpectedRevenueGoal = { intent: 'revenue_goal'; goal: RevenueGoalKey; deterministicResult?: ExpectedDeterministicResult };

export type ExpectedMenuDiscountAction = {
  intent: 'menu_discount_action';
  matchKind?: MatchKind;
  confidence?: Confidence;
  reasoningContains?: string[];
  resolvedItemCount?: number;
  unresolved?: { reasonContains?: string[]; candidateNames?: string[] };
};

export type ExpectedForIntent =
  | ExpectedAnswer
  | ExpectedClarification
  | ExpectedUnsupported
  | ExpectedRevenueGoal
  | ExpectedMenuDiscountAction;

// --- Post-turn user actions (Approve / Modify / Cancel / select targets) ---

export type UserAction =
  | { type: 'approve' }
  | { type: 'modify'; draftText: string }
  | { type: 'cancel' }
  | { type: 'selectTargets'; names: string[] | 'all' }
  // revenue_intelligence-specific: "Create Proposal" on a RevenueOpportunity
  // card is its own, distinct first step (RevenueOpportunityList.tsx) — it
  // only ever drafts an ordinary menu_pricing proposal via
  // createProposalFromOpportunity, never applies anything itself. The
  // resulting proposal's own Approve/apply is then exactly the
  // menu_pricing adapter's 'approve' path — already covered there, not
  // re-tested here, since a created proposal is indistinguishable from any
  // other menu_pricing proposal once it exists.
  | { type: 'createProposal' };

// 'approved' is deliberately NOT a valid value here — it's declared in the
// real ProposalStatus type but is dead code (grepped the whole repo: zero
// writes). The framework asserts the real lifecycle (draft/modified →
// executed, or → cancelled), never the aspirational one.
export type ExpectedExecutionOutcome = {
  proposalStatus: 'draft' | 'modified' | 'cancelled' | 'executed';
  versionBehavior?: 'new_group' | 'incremented';
  applied?: number;
  total?: number;
  skippedNoOp?: string[];
  affectedItemAfterState?: Array<{ name: string; specialEnabled: boolean; specialPercent?: number | null; specialPrice?: number | null }>;
};

// --- Golden conversation shape -----------------------------------------

export type GoldenTurn = {
  userMessage: string;
  recordedPlannerOutputRaw: string;
  recordedSource: 'captured' | 'hand-authored';
  expected: ExpectedForIntent;
  userAction?: UserAction;
  expectedAfterAction?: ExpectedExecutionOutcome;
  // Capability-specific extra input, interpreted only by that capability's
  // adapter. Exists because not every capability's deterministic pipeline
  // can run purely from the restaurant/menu fixtures: revenue_intelligence's
  // Phase-1 (pure-function-only) adapter needs pre-computed facts (category
  // sales, promotion coverage, daypart stats, co-purchase pairs) that in
  // production come from DB-querying analytics tools — see
  // eval/runner/adapters/revenue-intelligence.ts for the exact shape it reads.
  turnInput?: unknown;
};

export type GoldenConversation = {
  id: string;
  capability: CapabilityKey;
  description: string;
  restaurantFixture: string;
  menuFixture: string;
  // Only needed by revenue_intelligence conversations — its analysis tools
  // read orders/order_items/promotions/promotion_rewards/coupon_redemptions,
  // none of which menu_pricing's pipeline touches.
  ordersFixture?: string;
  turns: GoldenTurn[];
};

// The extra table surface revenue_intelligence's analytics tools need,
// beyond menu_pricing's 6 tables — same FakeSupabaseClient, more seed data.
export type OrdersFixture = {
  orders: Array<Record<string, unknown>>;
  orderItems: Array<Record<string, unknown>>;
  promotions: Array<Record<string, unknown>>;
  promotionRewards: Array<Record<string, unknown>>;
  couponRedemptions: Array<Record<string, unknown>>;
};

// --- Runner / adapter contract -------------------------------------------

export type AssertionResult = { pass: boolean; message: string };

export type EvalContext = {
  restaurant: RestaurantFixture;
  menu: MenuFixture;
  // Created once per conversation replay (not per turn), seeded from
  // `menu` — this is what lets a multi-turn conversation genuinely test
  // proposal versioning (the same fake `restaurant_planner_proposals` table
  // persists across turns). Pure-logic-only adapters (Phase 1) may ignore it.
  fakeClient: FakeSupabaseClient;
};

export type ConversationState = {
  openProposalGroupId?: string;
};

export type ActualTurnResult = {
  parsed: PlannerOutput;
  detail: unknown;
};

// Every capability's adapter knows how to run ONE turn (parse → drive its
// own pipeline) and assert against it, plus (optionally, for capabilities
// whose golden conversations exercise approval/execution) how to run and
// assert a post-turn user action. menu_pricing implements both; a
// pure-logic-only capability can omit runAction/assertAfterAction entirely.
export type CapabilityEvalAdapter = {
  capability: CapabilityKey;
  runTurn(ctx: EvalContext, turn: GoldenTurn, state: ConversationState): Promise<{ actual: ActualTurnResult; state: ConversationState }>;
  assert(expected: ExpectedForIntent, actual: ActualTurnResult): AssertionResult[];
  runAction?(ctx: EvalContext, turn: GoldenTurn, actual: ActualTurnResult, state: ConversationState): Promise<{ actualAfterAction: unknown; state: ConversationState }>;
  assertAfterAction?(expected: ExpectedExecutionOutcome, actualAfterAction: unknown): AssertionResult[];
};

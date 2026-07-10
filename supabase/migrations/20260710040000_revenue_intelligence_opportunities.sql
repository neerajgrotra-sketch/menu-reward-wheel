-- Revenue Intelligence Agent V1: the model's structured output gains a 5th
-- classified shape. A goal-shaped ask ("increase beverage sales") no longer
-- forces the model to invent a specific discount itself — it classifies
-- which of 8 closed business goals the message maps to
-- (lib/restaurant-planner/types.ts's RevenueGoalKey), and a deterministic
-- pipeline (lib/restaurant-planner/capabilities/revenue-intelligence.ts)
-- does all the actual analysis. 'revenue_opportunities' is the stored
-- intent for the resulting message when that analysis found something to
-- recommend; a goal with no evidence-backed opportunity (or no honest
-- executable lever at all — see the architecture doc) still degrades to the
-- existing 'answer' intent, so this is the only new stored intent value
-- needed.
--
-- revenue_opportunities stores { goal, opportunities: RevenueOpportunity[] }
-- at the moment the list message is created — including each opportunity's
-- server-computed action — so "Create Proposal" only ever needs
-- {relatedMessageId, opportunityId} from the client and re-fetches the real
-- data server-side (never trusts a client round-trip of it), the same
-- precedent target-selection/route.ts already established for `action` on a
-- clarification message. Not reusing the existing `candidates` column: that
-- column already means PlannerCandidate[] (bare name+category) elsewhere in
-- this codebase, and overloading it with a much richer shape would confuse
-- a future reader more than one small column costs.

alter table public.dashboard_assistant_messages
  drop constraint dashboard_assistant_messages_intent_check;

alter table public.dashboard_assistant_messages
  add constraint dashboard_assistant_messages_intent_check
  check (intent in ('answer', 'menu_discount_action', 'action_outcome', 'clarification', 'unsupported', 'revenue_opportunities'));

alter table public.dashboard_assistant_messages
  add column revenue_opportunities jsonb;

-- Widens dashboard_assistant_messages for the Restaurant Planner (Phase 1):
-- the assistant's structured output is no longer a closed
-- answer|menu_discount_action union — it can also ask a clarifying question
-- using real menu data, or recognize a business intent it doesn't support
-- yet (e.g. "create a lunch combo") instead of hallucinating an action.
--
-- 'clarification': the assistant's own natural-language question (distinct
-- from 'action_outcome', which is the deterministic ambiguity message
-- surfaced by the discount resolver — both can appear in one conversation).
-- 'unsupported': assistant recognized the business intent but no capability
-- is registered for it yet. 'menu_discount_action' is kept (not renamed to a
-- generic 'propose_action') so already-persisted rows stay valid without a
-- backfill; it is Phase 1's only propose-action intent.
--
-- capability tags which capability produced a 'menu_discount_action' message
-- ('menu_pricing' today) — the concrete extension point a future
-- CAPABILITY_REGISTRY entry (Pricing/Promotion/Analytics/...) plugs into
-- without any further schema change.

alter table public.dashboard_assistant_messages
  drop constraint dashboard_assistant_messages_intent_check;

alter table public.dashboard_assistant_messages
  add constraint dashboard_assistant_messages_intent_check
  check (intent in ('answer', 'menu_discount_action', 'action_outcome', 'clarification', 'unsupported'));

alter table public.dashboard_assistant_messages
  add column capability text;

-- menu_edit capability (registry key menu_agent): persistent catalog
-- changes (price, name, description, category, visibility, tags) — the
-- sibling of menu_pricing's temporary/schedulable discount overlay.
-- Root-caused and designed in docs/architecture/menu-editing-capability-
-- boundary-audit-v1.md; approved implementation plan builds it as a new
-- capability rather than expanding menu_pricing, so this migration is
-- purely additive and touches no menu_pricing-owned schema.

-- 1. Widen dashboard_assistant_messages.intent for the new
--    'menu_edit_action' stored intent (same drop/recreate pattern as
--    20260710000000_restaurant_planner_intent_widen.sql and
--    20260710040000_revenue_intelligence_opportunities.sql).
alter table public.dashboard_assistant_messages
  drop constraint dashboard_assistant_messages_intent_check;

alter table public.dashboard_assistant_messages
  add constraint dashboard_assistant_messages_intent_check
  check (intent in ('answer', 'menu_discount_action', 'action_outcome', 'clarification', 'unsupported', 'revenue_opportunities', 'menu_edit_action'));

-- 2. Audit trail for menu_edit writes — a structural mirror of
--    menu_discount_change_log (20260709040000), deliberately a SEPARATE
--    table rather than a shared/overloaded one: that table's old_value/
--    new_value shape is discount-specific (special_* fields), and this
--    repo's own convention is not to share audit tables across capabilities
--    until proven necessary. Same owner-scoped RLS posture, not
--    is_super_admin() — this is the owner's own business data.
create table public.menu_edit_change_log (
  id             uuid        primary key default gen_random_uuid(),
  restaurant_id  uuid        not null references public.restaurants(id) on delete cascade,
  actor_user_id  uuid        not null references auth.users(id),
  menu_item_id   uuid        not null references public.menu_items(id) on delete cascade,
  old_value      jsonb       not null,
  new_value      jsonb       not null,
  source         text        not null default 'ai_action' check (source in ('ai_action', 'manual')),
  created_at     timestamptz not null default now()
);

create index menu_edit_change_log_restaurant_idx
  on public.menu_edit_change_log (restaurant_id, created_at desc);

alter table public.menu_edit_change_log enable row level security;

create policy "menu_edit_change_log_select_owner"
  on public.menu_edit_change_log for select to authenticated
  using (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));

create policy "menu_edit_change_log_insert_owner"
  on public.menu_edit_change_log for insert to authenticated
  with check (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));

-- No update/delete policies — append-only.

-- 3. Seed capability_settings so menu_agent ships dark by default — same
--    launch posture as menu_pricing's original environment-level seed
--    (20260710030000_capability_settings.sql). Flipping this to true is a
--    deliberate later step, not part of this build.
insert into public.capability_settings (capability_key, scope, scope_id, enabled)
values ('menu_agent', 'environment', null, false);

-- Restaurant Planner V2: turns a proposal into a first-class, versioned,
-- append-only entity instead of a raw action re-derived on every render.
-- Append-only, same convention as dashboard_assistant_messages /
-- menu_discount_change_log / intelligence_audit_log: a "modify" or a status
-- transition (approved/cancelled/executed) is always a NEW row, never an
-- UPDATE of an existing one. "Current" version of a proposal is computed at
-- read time as max(version) for a given proposal_group_id — no row is ever
-- mutated, so there is no UPDATE/DELETE policy on this table, matching every
-- other append-only table in this system.

create table public.restaurant_planner_proposals (
  id                  uuid        primary key default gen_random_uuid(),
  -- Stable across versions of the same proposal — equal to the id of this
  -- group's version-1 row. A real self-referencing FK: the application
  -- generates the uuid client-side and inserts id = proposal_group_id in
  -- the same statement for version 1, so the referenced row always exists.
  proposal_group_id   uuid        not null references public.restaurant_planner_proposals(id),
  version             int         not null default 1 check (version > 0),
  restaurant_id       uuid        not null references public.restaurants(id) on delete cascade,
  conversation_id     uuid        not null references public.dashboard_assistant_conversations(id) on delete cascade,
  capability          text        not null,
  -- Raw MenuDiscountAction (widened target/discount shape,
  -- lib/intelligence/actions/menu-discount-schema.ts).
  action              jsonb       not null,
  -- resolveMenuDiscountAction() output captured at build time — the source
  -- ProposalCard renders from immediately, and what apply-time revalidation
  -- diffs live data against to detect drift since the proposal was shown.
  resolved_snapshot   jsonb,
  confidence          text        check (confidence in ('high', 'medium', 'low')),
  -- Deterministic, server-composed explanation — never raw model text.
  reasoning           text,
  -- [{id, label, status}] — a fixed, per-capability step template populated
  -- as the server walks resolve -> estimate -> build. Explainability data,
  -- not a graph-execution engine: see docs/architecture note on why.
  plan_tasks          jsonb,
  status              text        not null check (status in ('draft', 'modified', 'approved', 'cancelled', 'executed')),
  related_message_id  uuid        references public.dashboard_assistant_messages(id) on delete set null,
  created_by          uuid        not null references auth.users(id),
  created_at          timestamptz not null default now()
);

create index restaurant_planner_proposals_group_idx
  on public.restaurant_planner_proposals (proposal_group_id, version desc);

create index restaurant_planner_proposals_conversation_idx
  on public.restaurant_planner_proposals (conversation_id, created_at);

alter table public.restaurant_planner_proposals enable row level security;

create policy "restaurant_planner_proposals_select_owner"
  on public.restaurant_planner_proposals for select to authenticated
  using (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));

create policy "restaurant_planner_proposals_insert_owner"
  on public.restaurant_planner_proposals for insert to authenticated
  with check (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));

-- No update/delete policies — append-only.

-- Additive columns on dashboard_assistant_messages: which proposal group (if
-- any) this message represents, and structured real candidates for a
-- clarification message (sourced from the deterministic resolver, never
-- model-invented) so the UI can render a checkbox selector instead of a
-- plain question bubble. Both nullable — existing rows are unaffected.
alter table public.dashboard_assistant_messages
  add column proposal_group_id uuid references public.restaurant_planner_proposals(id) on delete set null,
  add column candidates jsonb;

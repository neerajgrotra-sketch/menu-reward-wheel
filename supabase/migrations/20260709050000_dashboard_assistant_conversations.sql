-- Persistent chat thread for "Ask SpinBite" (dashboard_assistant). Phase 1 of
-- turning it from a single-shot Q&A box into a real agentic conversation:
-- the UI always loads/creates the most recent conversation per restaurant —
-- no "start new thread" UI yet.
--
-- Messages are append-only, same convention as menu_discount_change_log /
-- intelligence_audit_log: no UPDATE/DELETE policy. A resolved proposal is
-- recorded as a NEW follow-up message (intent = 'action_outcome',
-- related_message_id -> the proposal it resolves), never a mutation of the
-- original row. This is what lets a clarifying reply like "only cardamom
-- chai" see the real candidate item names that are only known after
-- /api/admin/menus/discount-action/preview resolves against live menu data
-- (lib/menu-discount-actions/resolve.ts) — even though the proposal message
-- itself only ever held the raw AI-authored action (name-only target, never
-- an item id).

create table public.dashboard_assistant_conversations (
  id               uuid        primary key default gen_random_uuid(),
  restaurant_id    uuid        not null references public.restaurants(id) on delete cascade,
  created_by       uuid        not null references auth.users(id),
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);

create index dashboard_assistant_conversations_restaurant_idx
  on public.dashboard_assistant_conversations (restaurant_id, last_message_at desc);

create table public.dashboard_assistant_messages (
  id                  uuid        primary key default gen_random_uuid(),
  conversation_id     uuid        not null references public.dashboard_assistant_conversations(id) on delete cascade,
  -- Denormalized so RLS and the restaurant-scoped index don't require a join
  -- through conversations — same choice menu_discount_change_log made.
  restaurant_id       uuid        not null references public.restaurants(id) on delete cascade,
  role                text        not null check (role in ('user', 'assistant')),
  -- User's raw text, or the assistant's rendered answer / clarifying
  -- question / deterministic outcome summary. Always natural language, so a
  -- transcript can be built by concatenating content across intents.
  content             text        not null,
  intent              text        check (intent in ('answer', 'menu_discount_action', 'action_outcome')),
  -- Raw MenuDiscountAction (lib/intelligence/actions/menu-discount-schema.ts)
  -- when intent = 'menu_discount_action'. Name-only target, never an item id.
  action              jsonb,
  -- {kind:'ambiguous'|'applied'|'cancelled', ...} when intent = 'action_outcome'.
  outcome             jsonb,
  related_message_id  uuid        references public.dashboard_assistant_messages(id) on delete set null,
  created_by          uuid        not null references auth.users(id),
  created_at          timestamptz not null default now()
);

create index dashboard_assistant_messages_conversation_idx
  on public.dashboard_assistant_messages (conversation_id, created_at);

-- Keeps last_message_at accurate for "most recent conversation" ordering.
-- security definer so it can write regardless of the inserting row's RLS
-- context, matching soft_delete_restaurant's convention
-- (20260709010000_soft_delete_restaurant_function.sql).
create or replace function public.touch_dashboard_assistant_conversation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.dashboard_assistant_conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger dashboard_assistant_messages_touch_conversation
  after insert on public.dashboard_assistant_messages
  for each row execute function public.touch_dashboard_assistant_conversation();

alter table public.dashboard_assistant_conversations enable row level security;
alter table public.dashboard_assistant_messages enable row level security;

create policy "dashboard_assistant_conversations_select_owner"
  on public.dashboard_assistant_conversations for select to authenticated
  using (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));

create policy "dashboard_assistant_conversations_insert_owner"
  on public.dashboard_assistant_conversations for insert to authenticated
  with check (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));

create policy "dashboard_assistant_messages_select_owner"
  on public.dashboard_assistant_messages for select to authenticated
  using (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));

create policy "dashboard_assistant_messages_insert_owner"
  on public.dashboard_assistant_messages for insert to authenticated
  with check (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));

-- No update/delete policies on either table — append-only.

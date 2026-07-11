-- Conversation-management fields for Ask SpinBite's New Chat / Conversation
-- History / Archive UX (Decision Intelligence follow-up: "Conversation
-- Management V1"). Additive only.
--
-- Hard delete was considered and rejected: dashboard_assistant_conversations.id
-- is referenced by BOTH dashboard_assistant_messages.conversation_id and
-- restaurant_planner_proposals.conversation_id with ON DELETE CASCADE
-- (20260709050000, 20260710010000). Deleting a conversation row would
-- cascade-delete every message AND every proposal version in it, including
-- already-executed proposals that changed live menu pricing — destroying
-- audit history to support a UI affordance. Archive (a visibility flag) is
-- implemented instead; no DELETE policy is added.
--
-- `title` stays NULL until a future LLM-generated-title feature writes it
-- (Part 4 — no LLM call is added here). Until then, the API derives a
-- display title from the first user message (lib/dashboard-assistant/title.ts).

alter table public.dashboard_assistant_conversations
  add column title text,
  add column archived_at timestamptz;

-- Lets the default (non-archived) History list filter without a full scan.
create index dashboard_assistant_conversations_active_idx
  on public.dashboard_assistant_conversations (restaurant_id, archived_at, last_message_at desc);

-- No UPDATE policy existed before this migration — conversations were
-- append-only (no rename/archive/anything). Archiving needs one, scoped
-- identically to the existing SELECT/INSERT owner policies. Still no DELETE
-- policy — hard delete is deliberately not offered (see header comment).
create policy "dashboard_assistant_conversations_update_owner"
  on public.dashboard_assistant_conversations for update to authenticated
  using (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));

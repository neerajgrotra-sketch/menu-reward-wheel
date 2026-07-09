-- Audit trail for AI-executed (and future manual) menu discount changes.
-- Modeled on intelligence_audit_log's shape (entity_id/old_value/new_value/
-- created_at, append-only) but RLS-scoped to the restaurant owner rather
-- than is_super_admin() — this is the owner's own business data, not
-- platform config. Not building an "undo" feature yet; this is the trail
-- it would need.

create table public.menu_discount_change_log (
  id             uuid        primary key default gen_random_uuid(),
  restaurant_id  uuid        not null references public.restaurants(id) on delete cascade,
  actor_user_id  uuid        not null references auth.users(id),
  menu_item_id   uuid        not null references public.menu_items(id) on delete cascade,
  old_value      jsonb       not null,
  new_value      jsonb       not null,
  source         text        not null default 'ai_action' check (source in ('ai_action', 'manual')),
  created_at     timestamptz not null default now()
);

create index menu_discount_change_log_restaurant_idx
  on public.menu_discount_change_log (restaurant_id, created_at desc);

alter table public.menu_discount_change_log enable row level security;

-- Owners can read their own restaurant's change history.
create policy "menu_discount_change_log_select_owner"
  on public.menu_discount_change_log for select to authenticated
  using (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));

-- Writes only happen from the apply route using the acting owner's own
-- session — same predicate as SELECT, and as menu_items' own UPDATE policy
-- (20260609020000_phase_c1_h6_h5_h2_security_hardening.sql), so a write can
-- only be attributed to the restaurant the actor actually owns.
create policy "menu_discount_change_log_insert_owner"
  on public.menu_discount_change_log for insert to authenticated
  with check (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));

-- No update/delete policies — append-only.

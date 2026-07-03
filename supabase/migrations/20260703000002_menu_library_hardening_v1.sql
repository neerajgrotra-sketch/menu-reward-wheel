-- Menu Library — Hardening pass (pre-merge audit)
-- Two independent fixes:
--   1. promotions: add the missing owner-scoped INSERT policy, then drop the
--      fully-open one the app was silently relying on (public/anon could
--      insert a promotion for ANY restaurant_id). Discovered during a
--      platform-wide RLS sweep triggered by the menu_categories open-insert
--      bug found in 20260703000001.
--   2. menus.version: placeholder integer, auto-incremented on every update
--      to the menus row itself. Does NOT implement rollback — no snapshot
--      history exists yet — this only satisfies "track that something
--      changed" until a real versioning design is scoped.

-- ─── 1. promotions: close the open INSERT policy ──────────────────────────────

drop policy if exists "owners insert own promotions" on public.promotions;
create policy "owners insert own promotions" on public.promotions
  for insert to authenticated
  with check (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
  );

drop policy if exists "public insert promotions" on public.promotions;

-- ─── 2. menus.version ──────────────────────────────────────────────────────────

alter table public.menus add column if not exists version integer not null default 1;

create or replace function public.increment_menu_version()
returns trigger
language plpgsql
as $$
begin
  new.version = old.version + 1;
  return new;
end;
$$;

drop trigger if exists increment_menus_version on public.menus;
create trigger increment_menus_version
  before update on public.menus
  for each row
  when (old.* is distinct from new.*)
  execute function public.increment_menu_version();

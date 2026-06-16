-- Architecture correction: games table is the canonical availability authority.
-- promotion_game_assignments is the single source of truth for all game assignments
-- including the primary game. promotions.game_type becomes a legacy read-only field.

-- ─── 0. Replace stale game_type check constraint ──────────────────────────────
-- The pre-existing constraint used legacy aliases (wheel, slot_machine, fortune_cookie,
-- pick_a_door). Drop it first so subsequent DML can use canonical IDs, then
-- recreate it with the locked canonical set.

alter table public.promotion_game_assignments
  drop constraint if exists promotion_game_assignments_game_type_valid;

alter table public.promotion_game_assignments
  add constraint promotion_game_assignments_game_type_valid
  check (game_type = any (array[
    'spin_wheel',
    'mystery_box',
    'scratch_card',
    'open_the_door',
    'reward_reels'   -- kept for audit rows (always disabled); excluded from active play
  ]));

-- ─── 1. Add is_primary column ─────────────────────────────────────────────────

alter table public.promotion_game_assignments
  add column if not exists is_primary boolean not null default false;

-- ─── 2. Normalize legacy 'wheel' alias in existing assignment rows ─────────────

update public.promotion_game_assignments
  set game_type = 'spin_wheel'
  where game_type = 'wheel';

-- ─── 3. Backfill primary game from promotions.game_type ───────────────────────
-- For every promotion that does not yet have an is_primary=true row, insert one
-- derived from promotions.game_type (normalising 'wheel' → 'spin_wheel').
-- ON CONFLICT: if that game_type already exists as an additional assignment,
-- promote it to primary in-place rather than creating a duplicate.

insert into public.promotion_game_assignments
  (promotion_id, game_type, weight, enabled, is_primary)
select
  p.id,
  case
    when p.game_type = 'wheel' then 'spin_wheel'
    else coalesce(p.game_type, 'spin_wheel')
  end,
  1,
  true,
  true
from public.promotions p
where not exists (
  select 1
  from public.promotion_game_assignments pga
  where pga.promotion_id = p.id
    and pga.is_primary = true
)
on conflict (promotion_id, game_type)
do update set
  is_primary = true,
  enabled    = true;

-- ─── 4. Data cleanup: disable reward_reels assignments ────────────────────────
-- Lucky Reels has no playable runtime. Existing assignments must be disabled so
-- resolvePromotionGame never selects it. Rows are kept for audit; not deleted.

update public.promotion_game_assignments
  set enabled = false
  where game_type = 'reward_reels';

-- ─── 5. Enforce single primary per promotion ──────────────────────────────────

create unique index if not exists promotion_game_assignments_one_primary
  on public.promotion_game_assignments (promotion_id)
  where is_primary = true;

-- ─── 6. RLS policies for promotion_game_assignments ───────────────────────────

alter table public.promotion_game_assignments enable row level security;

-- Restaurant owners — read their own promotion assignments
drop policy if exists "pga_select_own" on public.promotion_game_assignments;
create policy "pga_select_own"
  on public.promotion_game_assignments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.promotions p
      join public.restaurants r on r.id = p.restaurant_id
      where p.id = promotion_game_assignments.promotion_id
        and r.owner_id = auth.uid()
    )
  );

-- Restaurant owners — insert assignments for their own promotions
drop policy if exists "pga_insert_own" on public.promotion_game_assignments;
create policy "pga_insert_own"
  on public.promotion_game_assignments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.promotions p
      join public.restaurants r on r.id = p.restaurant_id
      where p.id = promotion_game_assignments.promotion_id
        and r.owner_id = auth.uid()
    )
  );

-- Restaurant owners — update their own assignments
drop policy if exists "pga_update_own" on public.promotion_game_assignments;
create policy "pga_update_own"
  on public.promotion_game_assignments
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.promotions p
      join public.restaurants r on r.id = p.restaurant_id
      where p.id = promotion_game_assignments.promotion_id
        and r.owner_id = auth.uid()
    )
  );

-- Restaurant owners — delete their own assignments
drop policy if exists "pga_delete_own" on public.promotion_game_assignments;
create policy "pga_delete_own"
  on public.promotion_game_assignments
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.promotions p
      join public.restaurants r on r.id = p.restaurant_id
      where p.id = promotion_game_assignments.promotion_id
        and r.owner_id = auth.uid()
    )
  );

-- Super admin — unrestricted access
drop policy if exists "pga_super_admin_all" on public.promotion_game_assignments;
create policy "pga_super_admin_all"
  on public.promotion_game_assignments
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

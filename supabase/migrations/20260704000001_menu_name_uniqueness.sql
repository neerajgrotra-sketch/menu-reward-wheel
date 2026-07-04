-- Enforce "no two menus with the same name per owner" (case-insensitive).
-- Requested after two backfilled menus both named "Punjabi By Nature Menu"
-- (one per restaurant location, both owned by the same account) caused
-- confusion in the Menu Library and Assign Locations screens.

-- ─── 1. Dedupe existing collisions before the constraint can be added ─────────
-- For every (owner_id, lower(name)) group with more than one live menu, keep the
-- oldest untouched and rename the rest — preferring the city of the restaurant
-- it's actively assigned to (if any), falling back to a numbered suffix.
with dupes as (
  select
    m.id,
    m.name,
    row_number() over (partition by m.owner_id, lower(m.name) order by m.created_at) as rn,
    (
      select r.city
      from public.restaurant_menu_assignments rma
      join public.restaurants r on r.id = rma.restaurant_id
      where rma.menu_id = m.id and rma.active = true
      order by rma.created_at
      limit 1
    ) as assigned_city
  from public.menus m
  where m.deleted_at is null
)
update public.menus m
set name = m.name || ' (' || coalesce(d.assigned_city, 'Copy ' || d.rn::text) || ')'
from dupes d
where m.id = d.id and d.rn > 1;

-- ─── 2. Enforce it going forward ───────────────────────────────────────────────
create unique index if not exists menus_owner_id_name_unique
  on public.menus (owner_id, lower(name))
  where deleted_at is null;

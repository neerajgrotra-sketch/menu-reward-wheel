-- Menu categories have always inserted with display_order = 0 (the column
-- default) — addMenu() in the admin builder never set it, and the admin
-- category list query didn't even select/order by it. Every category in a
-- menu ties at 0, so the "order" customers and admins saw was really just
-- whatever arbitrary order Postgres returned for tied rows, which could
-- differ between the admin builder's unordered query and the public page's
-- order-by-tied-column query.
--
-- Backfill: assign a real display_order per menu, using created_at as the
-- ordering key so today's category order (creation order) becomes the
-- starting point rather than being scrambled by this migration.

with ranked as (
  select
    id,
    row_number() over (partition by menu_id order by created_at, id) - 1 as rn
  from public.menu_categories
)
update public.menu_categories mc
set display_order = ranked.rn
from ranked
where mc.id = ranked.id
  and mc.display_order is distinct from ranked.rn;

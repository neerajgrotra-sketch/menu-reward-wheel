alter table public.restaurants
add column if not exists current_promotion_id uuid references public.promotions(id) on delete set null;

create index if not exists restaurants_current_promotion_idx
on public.restaurants (current_promotion_id);

-- Backfill current_promotion_id for locations that already have an active promotion.
-- If more than one active promotion exists, use the most recently created one.
with ranked_active_promotions as (
  select
    p.restaurant_id,
    p.id as promotion_id,
    row_number() over (
      partition by p.restaurant_id
      order by p.created_at desc
    ) as rn
  from public.promotions p
  where p.status = 'active'
    and (p.starts_at is null or p.starts_at <= now())
    and (p.ends_at is null or p.ends_at > now())
)
update public.restaurants r
set current_promotion_id = rap.promotion_id
from ranked_active_promotions rap
where rap.restaurant_id = r.id
  and rap.rn = 1
  and r.current_promotion_id is null;

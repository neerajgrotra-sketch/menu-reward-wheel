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

create or replace function public.set_current_promotion_on_launch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and (old.status is distinct from new.status) then
    -- End the previous current promotion for this location, if different.
    update public.promotions
    set
      status = 'ended',
      ends_at = coalesce(ends_at, now())
    where restaurant_id = new.restaurant_id
      and id <> new.id
      and status = 'active';

    -- Point the permanent location QR to the newly launched promotion.
    update public.restaurants
    set current_promotion_id = new.id
    where id = new.restaurant_id;
  end if;

  if old.status = 'active' and new.status <> 'active' then
    -- If the current promotion is manually ended, clear the pointer.
    update public.restaurants
    set current_promotion_id = null
    where id = new.restaurant_id
      and current_promotion_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists set_current_promotion_after_promotion_launch on public.promotions;
create trigger set_current_promotion_after_promotion_launch
after update of status on public.promotions
for each row
execute function public.set_current_promotion_on_launch();

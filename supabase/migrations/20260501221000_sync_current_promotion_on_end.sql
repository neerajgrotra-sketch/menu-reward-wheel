-- Keep restaurants.current_promotion_id aligned when a promotion is ended by setting ends_at.
-- This is intentionally safe to rerun.

create or replace function public.sync_restaurant_current_promotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- If the new row is currently live, point the restaurant QR to it.
  if new.status = 'active'
     and (new.starts_at is null or new.starts_at <= now())
     and (new.ends_at is null or new.ends_at > now()) then
    update public.restaurants
    set current_promotion_id = new.id
    where id = new.restaurant_id;

  -- If this promotion was previously current but is no longer live, clear the pointer.
  elsif old.status = 'active'
     and (old.starts_at is null or old.starts_at <= now())
     and (old.ends_at is null or old.ends_at > now()) then
    update public.restaurants
    set current_promotion_id = null
    where id = old.restaurant_id
      and current_promotion_id = old.id;
  end if;

  return new;
end;
$$;

-- Ensure the sync trigger exists and listens to ends_at changes.
drop trigger if exists sync_restaurant_current_promotion_after_write on public.promotions;

create trigger sync_restaurant_current_promotion_after_write
after insert or update of status, starts_at, ends_at, restaurant_id on public.promotions
for each row
execute function public.sync_restaurant_current_promotion();

-- Clear any currently stale pointers immediately.
update public.restaurants r
set current_promotion_id = null
where current_promotion_id is not null
  and not exists (
    select 1
    from public.promotions p
    where p.id = r.current_promotion_id
      and p.restaurant_id = r.id
      and p.status = 'active'
      and (p.starts_at is null or p.starts_at <= now())
      and (p.ends_at is null or p.ends_at > now())
  );

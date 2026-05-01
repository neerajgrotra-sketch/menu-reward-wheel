create or replace function public.block_or_set_current_promotion_on_launch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_live_promotion record;
begin
  -- Only apply when a promotion is being moved into active status.
  if new.status = 'active' and (old.status is distinct from new.status) then
    select id, name
    into existing_live_promotion
    from public.promotions
    where restaurant_id = new.restaurant_id
      and id <> new.id
      and status = 'active'
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now())
    order by created_at desc
    limit 1;

    if existing_live_promotion.id is not null then
      raise exception 'This location already has a live promotion: %. End the current promotion before launching a new one.', existing_live_promotion.name
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.set_current_promotion_after_launch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and (old.status is distinct from new.status) then
    update public.restaurants
    set current_promotion_id = new.id
    where id = new.restaurant_id;
  end if;

  if old.status = 'active' and new.status <> 'active' then
    update public.restaurants
    set current_promotion_id = null
    where id = new.restaurant_id
      and current_promotion_id = new.id;
  end if;

  return new;
end;
$$;

-- Remove the old trigger that silently expired/replaced existing live promotions.
drop trigger if exists set_current_promotion_after_promotion_launch on public.promotions;

-- Block silent replacement before the active status is written.
drop trigger if exists block_live_replacement_before_promotion_launch on public.promotions;
create trigger block_live_replacement_before_promotion_launch
before update of status on public.promotions
for each row
execute function public.block_or_set_current_promotion_on_launch();

-- Set/clear the restaurant pointer only after the update is allowed.
drop trigger if exists set_current_promotion_after_allowed_launch on public.promotions;
create trigger set_current_promotion_after_allowed_launch
after update of status on public.promotions
for each row
execute function public.set_current_promotion_after_launch();

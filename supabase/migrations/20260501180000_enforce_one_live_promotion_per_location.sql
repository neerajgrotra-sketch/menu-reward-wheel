-- HARD PRODUCT RULE:
-- One restaurant location can have only one currently-live promotion at a time.
-- Drafts are allowed. Ended/expired promotions are allowed. Multiple live promotions are not.

-- 1) Clean up existing bad data.
-- Keep the current_promotion_id if it points to a currently-live promotion.
-- Otherwise keep the most recently created currently-live promotion.
-- Expire all other currently-live promotions by setting ends_at = now().
with live_promotions as (
  select
    p.id,
    p.restaurant_id,
    p.name,
    p.created_at,
    r.current_promotion_id,
    row_number() over (
      partition by p.restaurant_id
      order by
        case when r.current_promotion_id = p.id then 0 else 1 end,
        p.created_at desc
    ) as keep_rank
  from public.promotions p
  join public.restaurants r on r.id = p.restaurant_id
  where p.status = 'active'
    and (p.starts_at is null or p.starts_at <= now())
    and (p.ends_at is null or p.ends_at > now())
), kept as (
  select restaurant_id, id as promotion_id
  from live_promotions
  where keep_rank = 1
), expired as (
  update public.promotions p
  set ends_at = now()
  from live_promotions lp
  where p.id = lp.id
    and lp.keep_rank > 1
  returning p.id
)
update public.restaurants r
set current_promotion_id = kept.promotion_id
from kept
where kept.restaurant_id = r.id;

-- Clear stale pointers where the pointed promotion is not currently live.
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

-- 2) BEFORE trigger: block any insert/update that would create a second currently-live promotion.
create or replace function public.block_duplicate_live_promotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_live_promotion record;
begin
  if new.status = 'active'
     and (new.starts_at is null or new.starts_at <= now())
     and (new.ends_at is null or new.ends_at > now()) then

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

-- 3) AFTER trigger: maintain restaurants.current_promotion_id after allowed changes.
create or replace function public.sync_restaurant_current_promotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active'
     and (new.starts_at is null or new.starts_at <= now())
     and (new.ends_at is null or new.ends_at > now()) then
    update public.restaurants
    set current_promotion_id = new.id
    where id = new.restaurant_id;
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

-- Remove previous/older permanent QR triggers so only the final integrity model remains.
drop trigger if exists set_current_promotion_after_promotion_launch on public.promotions;
drop trigger if exists block_live_replacement_before_promotion_launch on public.promotions;
drop trigger if exists set_current_promotion_after_allowed_launch on public.promotions;
drop trigger if exists block_duplicate_live_promotion_before_write on public.promotions;
drop trigger if exists sync_restaurant_current_promotion_after_write on public.promotions;

create trigger block_duplicate_live_promotion_before_write
before insert or update of status, starts_at, ends_at, restaurant_id on public.promotions
for each row
execute function public.block_duplicate_live_promotion();

create trigger sync_restaurant_current_promotion_after_write
after insert or update of status, starts_at, ends_at, restaurant_id on public.promotions
for each row
execute function public.sync_restaurant_current_promotion();

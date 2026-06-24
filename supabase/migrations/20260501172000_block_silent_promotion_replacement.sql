create or replace function public.set_current_promotion_on_launch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_live_promotion record;
begin
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

    -- Point the permanent location QR to the newly launched promotion.
    update public.restaurants
    set current_promotion_id = new.id
    where id = new.restaurant_id;
  end if;

  if old.status = 'active' and new.status <> 'active' then
    -- If the current promotion is manually moved out of active status, clear the pointer.
    update public.restaurants
    set current_promotion_id = null
    where id = new.restaurant_id
      and current_promotion_id = new.id;
  end if;

  return new;
end;
$$;

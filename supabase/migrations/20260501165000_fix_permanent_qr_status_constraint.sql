create or replace function public.set_current_promotion_on_launch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and (old.status is distinct from new.status) then
    -- Expire the previous active promotion for this location without changing its status.
    -- Some environments restrict promotion.status values through promotions_status_check.
    -- The app already treats active promotions with ends_at <= now() as ended.
    update public.promotions
    set ends_at = now()
    where restaurant_id = new.restaurant_id
      and id <> new.id
      and status = 'active'
      and (ends_at is null or ends_at > now());

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

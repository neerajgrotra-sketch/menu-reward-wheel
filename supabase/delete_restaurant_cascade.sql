-- Safe restaurant delete RPC
-- Deletes a restaurant and related data only when the restaurant belongs to the logged-in user.

create or replace function public.delete_restaurant_cascade(target_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from restaurants
    where id = target_restaurant_id
      and owner_id = auth.uid()
  ) then
    raise exception 'Restaurant not found or not owned by current user';
  end if;

  delete from rewards
  where restaurant_id = target_restaurant_id;

  delete from promotions
  where restaurant_id = target_restaurant_id;

  delete from menu_items
  where restaurant_id = target_restaurant_id;

  delete from menus
  where restaurant_id = target_restaurant_id;

  delete from restaurants
  where id = target_restaurant_id
    and owner_id = auth.uid();
end;
$$;

grant execute on function public.delete_restaurant_cascade(uuid) to authenticated;

-- Safe promotion delete RPC
-- Deletes a promotion and its rewards only if the promotion belongs to a restaurant owned by the logged-in user.

create or replace function public.delete_promotion_cascade(target_promotion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_restaurant_id uuid;
begin
  select p.restaurant_id
  into target_restaurant_id
  from promotions p
  join restaurants r on r.id = p.restaurant_id
  where p.id = target_promotion_id
    and r.owner_id = auth.uid();

  if target_restaurant_id is null then
    raise exception 'Promotion not found or not owned by current user';
  end if;

  delete from promotion_rewards
  where promotion_id = target_promotion_id;

  delete from promotions
  where id = target_promotion_id;
end;
$$;

grant execute on function public.delete_promotion_cascade(uuid) to authenticated;

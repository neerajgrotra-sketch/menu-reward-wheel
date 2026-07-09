-- Release 1, PR-007 — block hard deletes on public.restaurants.
--
-- Restaurant deletion must go through a soft delete (setting `deleted_at`)
-- going forward — see PR-008, which replaces `delete_restaurant_cascade`
-- with a soft-delete function. This trigger is deliberately unconditional:
-- it protects against every current and future code path that might attempt
-- a hard delete (a buggy RPC, a future admin script, an ad hoc query), not
-- just the one known today. SECURITY DEFINER functions bypass RLS but
-- cannot bypass a table-level trigger, which is why this is the correct
-- enforcement point rather than an RLS policy.
--
-- Rollback:
--   drop trigger if exists block_restaurants_hard_delete on public.restaurants;
--   drop function if exists public.prevent_restaurants_hard_delete();

create or replace function public.prevent_restaurants_hard_delete()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  raise exception 'Hard delete of restaurants is not permitted. Soft-delete by setting deleted_at instead.'
    using errcode = '42501';
end;
$$;

create trigger block_restaurants_hard_delete
  before delete on public.restaurants
  for each row
  execute function public.prevent_restaurants_hard_delete();

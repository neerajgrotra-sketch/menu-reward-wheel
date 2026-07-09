-- Release 1, PR-008 — replace destructive restaurant deletion with soft-delete
-- (archival). Closes Business Invariants R-2 ("any restaurant-deletion code
-- path must write deleted_at, never DELETE FROM restaurants") and SEC-6
-- ("rewire the restaurant delete button to set deleted_at; remove or heavily
-- gate delete_restaurant_cascade").
--
-- delete_restaurant_cascade is renamed to soft_delete_restaurant and its body
-- replaced: it now sets restaurants.deleted_at instead of deleting rows in
-- rewards/promotions/menu_items/menus/restaurants. Per Business Invariants R-5
-- ("soft-delete cascades visibility, never data"), no child table is touched
-- here — those tables' own query paths (already audited in PR-009) are what
-- stop surfacing an archived restaurant, not a cascading delete of their rows.
-- The PR-007 BEFORE DELETE trigger on restaurants is unaffected and continues
-- to protect independently: this function now only ever issues an UPDATE.
--
-- delete_promotion_cascade is dropped — confirmed dead (zero call sites in
-- application code) in the original Phase 0 remediation audit and
-- re-confirmed live this session before this migration was written.
--
-- Rollback:
--   alter function public.soft_delete_restaurant(uuid) rename to delete_restaurant_cascade;
--   create or replace function public.delete_restaurant_cascade(target_restaurant_id uuid)
--   returns void language plpgsql security definer set search_path to 'public' as $$
--   begin
--     if not exists (select 1 from restaurants where id = target_restaurant_id and owner_id = auth.uid()) then
--       raise exception 'Restaurant not found or not owned by current user';
--     end if;
--     delete from rewards where restaurant_id = target_restaurant_id;
--     delete from promotions where restaurant_id = target_restaurant_id;
--     delete from menu_items where restaurant_id = target_restaurant_id;
--     delete from menus where restaurant_id = target_restaurant_id;
--     delete from restaurants where id = target_restaurant_id;
--   end; $$;
--   -- Note: the PR-007 trigger would still block the final statement above,
--   -- so this rollback restores the pre-PR-008 (already twice-broken) body
--   -- for historical parity only, not as a working hard-delete path.
--   -- delete_promotion_cascade is not recreated on rollback — it was already
--   -- confirmed dead code before this migration.

alter function public.delete_restaurant_cascade(uuid) rename to soft_delete_restaurant;

create or replace function public.soft_delete_restaurant(target_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (
    select 1
    from restaurants
    where id = target_restaurant_id
      and owner_id = auth.uid()
      and deleted_at is null
  ) then
    raise exception 'Restaurant not found or not owned by current user';
  end if;

  update restaurants
  set deleted_at = now()
  where id = target_restaurant_id;
end;
$$;

drop function if exists public.delete_promotion_cascade(uuid);

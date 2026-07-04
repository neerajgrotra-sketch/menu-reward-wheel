-- Fix: "infinite recursion detected in policy for relation restaurant_menu_assignments"
-- Surfaced on /admin/menus/[id]/assign when toggling a location checkbox.
--
-- Root cause: a two-table RLS cycle introduced by 20260703000000_menu_library_v1.sql.
--   - menus."Public read assigned menus" (SELECT) queries restaurant_menu_assignments.
--   - restaurant_menu_assignments's INSERT/UPDATE checks query menus directly
--     (`menu_id in (select id from public.menus where owner_id = auth.uid())`),
--     which triggers menus' own RLS — including the policy above that queries
--     restaurant_menu_assignments again. Postgres detects this same-relation
--     re-entrancy while planning the INSERT/UPDATE check and aborts.
--
-- Fix: replace the raw cross-table subquery in restaurant_menu_assignments's
-- INSERT/UPDATE checks with a SECURITY DEFINER helper, so ownership of the menu
-- is checked without re-invoking menus' RLS policies (breaking the cycle).

create or replace function public.user_owns_menu(p_menu_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.menus where id = p_menu_id and owner_id = auth.uid()
  );
$$;

drop policy if exists "Owners insert own menu assignments" on public.restaurant_menu_assignments;
create policy "Owners insert own menu assignments" on public.restaurant_menu_assignments
  for insert to authenticated with check (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
    and public.user_owns_menu(menu_id)
  );

drop policy if exists "Owners update own menu assignments" on public.restaurant_menu_assignments;
create policy "Owners update own menu assignments" on public.restaurant_menu_assignments
  for update to authenticated using (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
  ) with check (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
    and public.user_owns_menu(menu_id)
  );

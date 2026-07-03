-- Drop a stray pre-existing open INSERT policy on menu_categories (carried over
-- from the old `menus` table via the rename in 20260703000000_menu_library_v1).
-- It allowed the `public` role to insert arbitrary rows with WITH CHECK (true) —
-- not introduced by that migration, but discovered while auditing this table's
-- RLS afterward and fixed immediately since it's a live, exploitable hole (anon
-- could spam category rows onto any menu).

drop policy if exists "public insert menus" on public.menu_categories;

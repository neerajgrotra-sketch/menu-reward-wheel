-- Fix "Owners upload menu images": the original WITH CHECK put
-- storage.foldername(name) inside a correlated EXISTS subquery against
-- public.menus, whose own `name` column shadowed storage.objects.name —
-- Postgres silently resolved it to menus.name, so the check always
-- compared a menu's title against a folder segment and rejected every
-- upload. Rewritten to match the existing safe pattern used by
-- restaurant-heroes/menu-item-images/restaurant-logos: evaluate
-- storage.foldername(name) in the outer scope and test membership via
-- IN (subquery that only selects menus.id).

drop policy if exists "Owners upload menu images" on storage.objects;
create policy "Owners upload menu images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] in (
      select m.id::text from public.menus m where m.owner_id = auth.uid()
    )
  );

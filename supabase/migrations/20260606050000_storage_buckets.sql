-- Phase 2: Storage Buckets
-- Creates restaurant-heroes (10 MB, hero/background images) and
-- menu-item-images (5 MB, food photography) with path-scoped RLS.
--
-- Path conventions:
--   restaurant-heroes:  {user_id}/{restaurant_id}/hero.{ext}
--   menu-item-images:   {user_id}/{restaurant_id}/items/{item_id}/{timestamp}.{ext}
--
-- Both buckets are public for CDN delivery. Writes are restricted to the
-- authenticated owner of the target restaurant (verified via path prefix).

-- ─── restaurant-heroes ────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-heroes',
  'restaurant-heroes',
  true,
  10485760,
  array['image/jpeg', 'image/webp', 'image/png']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read hero images" on storage.objects;
create policy "Public read hero images"
  on storage.objects for select
  using (bucket_id = 'restaurant-heroes');

drop policy if exists "Owners upload hero images" on storage.objects;
create policy "Owners upload hero images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'restaurant-heroes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.restaurants r
      where r.owner_id = auth.uid()
        and r.id::text = (storage.foldername(name))[2]
    )
  );

drop policy if exists "Owners update hero images" on storage.objects;
create policy "Owners update hero images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'restaurant-heroes'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'restaurant-heroes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owners delete hero images" on storage.objects;
create policy "Owners delete hero images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'restaurant-heroes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── menu-item-images ─────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-item-images',
  'menu-item-images',
  true,
  5242880,
  array['image/jpeg', 'image/webp', 'image/png']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read menu item images" on storage.objects;
create policy "Public read menu item images"
  on storage.objects for select
  using (bucket_id = 'menu-item-images');

drop policy if exists "Owners upload menu item images" on storage.objects;
create policy "Owners upload menu item images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'menu-item-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.restaurants r
      where r.owner_id = auth.uid()
        and r.id::text = (storage.foldername(name))[2]
    )
  );

drop policy if exists "Owners delete menu item images" on storage.objects;
create policy "Owners delete menu item images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'menu-item-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

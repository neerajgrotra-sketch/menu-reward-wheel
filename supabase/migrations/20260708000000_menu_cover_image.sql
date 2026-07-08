-- Menu Library cover image: adds menus.image_url and a menu-images storage
-- bucket, owner-scoped like the rest of the Menu Library redesign (menus
-- have no restaurant_id, so path scoping checks menus.owner_id instead).
--
-- Path convention: {owner_id}/{menu_id}/{timestamp}.{ext}
-- Public bucket for CDN delivery; writes restricted to the owning user.

alter table public.menus add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images',
  'menu-images',
  true,
  10485760,
  array['image/jpeg', 'image/webp', 'image/png']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read menu images" on storage.objects;
create policy "Public read menu images"
  on storage.objects for select
  using (bucket_id = 'menu-images');

drop policy if exists "Owners upload menu images" on storage.objects;
create policy "Owners upload menu images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.menus m
      where m.owner_id = auth.uid()
        and m.id::text = (storage.foldername(name))[2]
    )
  );

drop policy if exists "Owners update menu images" on storage.objects;
create policy "Owners update menu images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owners delete menu images" on storage.objects;
create policy "Owners delete menu images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

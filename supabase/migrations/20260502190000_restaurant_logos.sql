-- Restaurant branding support for reusable QR print kits.
-- Adds a logo URL to each restaurant location and creates a public logo bucket.

alter table public.restaurants
  add column if not exists logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-logos',
  'restaurant-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Bucket layout: {owner_user_id}/{restaurant_id}/{filename}
-- Public read is required because print kits render logo images in the browser/PDF preview.
drop policy if exists "Public read restaurant logos" on storage.objects;
create policy "Public read restaurant logos"
on storage.objects for select
using (bucket_id = 'restaurant-logos');

drop policy if exists "Restaurant owners upload logos" on storage.objects;
create policy "Restaurant owners upload logos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'restaurant-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.restaurants r
    where r.owner_id = auth.uid()
      and r.id::text = (storage.foldername(name))[2]
  )
);

drop policy if exists "Restaurant owners update logos" on storage.objects;
create policy "Restaurant owners update logos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'restaurant-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.restaurants r
    where r.owner_id = auth.uid()
      and r.id::text = (storage.foldername(name))[2]
  )
)
with check (
  bucket_id = 'restaurant-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.restaurants r
    where r.owner_id = auth.uid()
      and r.id::text = (storage.foldername(name))[2]
  )
);

drop policy if exists "Restaurant owners delete logos" on storage.objects;
create policy "Restaurant owners delete logos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'restaurant-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.restaurants r
    where r.owner_id = auth.uid()
      and r.id::text = (storage.foldername(name))[2]
  )
);

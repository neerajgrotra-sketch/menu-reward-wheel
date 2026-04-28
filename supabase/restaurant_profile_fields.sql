-- Restaurant profile fields for richer setup/edit screens.

alter table restaurants
  add column if not exists address_line1 text,
  add column if not exists city text,
  add column if not exists phone text,
  add column if not exists cuisine_type text,
  add column if not exists image_url text;

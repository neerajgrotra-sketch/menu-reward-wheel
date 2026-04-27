alter table restaurants
  add column if not exists owner_name text,
  add column if not exists contact_email text,
  add column if not exists phone text,
  add column if not exists address_line1 text,
  add column if not exists city text,
  add column if not exists province_state text,
  add column if not exists postal_code text,
  add column if not exists country text default 'Canada',
  add column if not exists cuisine_type text,
  add column if not exists location_count integer default 1,
  add column if not exists main_goal text,
  add column if not exists average_ticket text,
  add column if not exists pos_system text;

create table if not exists public.site_content (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  section_key text not null,
  field_key text not null,
  label text not null,
  value text not null default '',
  field_type text not null default 'text',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_content_unique_field unique (page_key, section_key, field_key)
);

create index if not exists site_content_directory_idx
on public.site_content (page_key, section_key, sort_order, field_key);

create index if not exists site_content_active_idx
on public.site_content (is_active, page_key, section_key);

drop trigger if exists set_site_content_updated_at on public.site_content;
create trigger set_site_content_updated_at
before update on public.site_content
for each row
execute function public.set_updated_at();

alter table public.site_content enable row level security;

drop policy if exists "site_content_public_select_active" on public.site_content;
create policy "site_content_public_select_active"
on public.site_content
for select
to anon, authenticated
using (is_active = true or public.is_super_admin());

drop policy if exists "site_content_insert_super_admin" on public.site_content;
create policy "site_content_insert_super_admin"
on public.site_content
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists "site_content_update_super_admin" on public.site_content;
create policy "site_content_update_super_admin"
on public.site_content
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "site_content_delete_super_admin" on public.site_content;
create policy "site_content_delete_super_admin"
on public.site_content
for delete
to authenticated
using (public.is_super_admin());

insert into public.site_content (page_key, section_key, field_key, label, value, field_type, sort_order, is_active)
values
  ('home', 'hero', 'eyebrow', 'Hero Eyebrow', 'QR games for restaurants', 'text', 10, true),
  ('home', 'hero', 'headline', 'Hero Headline', 'Turn Every Meal Into a Game', 'text', 20, true),
  ('home', 'hero', 'subheadline', 'Hero Subheadline', 'Restaurants create spin wheels tied to real menu items. Diners scan a QR code, spin, win, and redeem instantly. Fun that actually drives sales.', 'textarea', 30, true),
  ('home', 'hero', 'badge_1', 'Hero Badge 1', 'No app download', 'text', 40, true),
  ('home', 'hero', 'badge_2', 'Hero Badge 2', 'Instant redemption', 'text', 50, true),
  ('home', 'hero', 'badge_3', 'Hero Badge 3', 'Margin-safe controls', 'text', 60, true),
  ('home', 'hero', 'primary_cta_label', 'Primary CTA Label', 'Get Started Free', 'text', 70, true),
  ('home', 'hero', 'spin_button_label', 'Demo Spin Button Label', 'Spin the Wheel', 'text', 80, true),
  ('super_admin', 'hero', 'eyebrow', 'Command Center Eyebrow', 'Super Admin', 'text', 10, true),
  ('super_admin', 'hero', 'headline', 'Command Center Headline', 'Control games, content, and platform settings.', 'text', 20, true),
  ('super_admin', 'hero', 'subheadline', 'Command Center Subheadline', 'Manage which games restaurants can use, tune default rules, and prepare future product features without hardcoding platform behavior.', 'textarea', 30, true),
  ('faq', 'hero', 'eyebrow', 'FAQ Eyebrow', 'Restaurant promotion FAQ', 'text', 10, true),
  ('faq', 'hero', 'headline', 'FAQ Headline', 'Questions restaurant owners ask before using SpinBite', 'text', 20, true),
  ('faq', 'hero', 'subheadline', 'FAQ Subheadline', 'Clear answers about QR games, coupon validation, menu rewards, promotion limits, and how SpinBite helps restaurants turn attention into orders.', 'textarea', 30, true)
on conflict (page_key, section_key, field_key)
do update set
  label = excluded.label,
  value = excluded.value,
  field_type = excluded.field_type,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text not null default 'general',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists faqs_active_sort_idx
on public.faqs (is_active, sort_order, created_at);

create index if not exists faqs_category_sort_idx
on public.faqs (category, sort_order, created_at);

drop trigger if exists set_faqs_updated_at on public.faqs;
create trigger set_faqs_updated_at
before update on public.faqs
for each row
execute function public.set_updated_at();

alter table public.faqs enable row level security;

drop policy if exists "faqs_public_select_active" on public.faqs;
create policy "faqs_public_select_active"
on public.faqs
for select
to anon, authenticated
using (is_active = true or public.is_super_admin());

drop policy if exists "faqs_insert_super_admin" on public.faqs;
create policy "faqs_insert_super_admin"
on public.faqs
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists "faqs_update_super_admin" on public.faqs;
create policy "faqs_update_super_admin"
on public.faqs
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "faqs_delete_super_admin" on public.faqs;
create policy "faqs_delete_super_admin"
on public.faqs
for delete
to authenticated
using (public.is_super_admin());

insert into public.faqs (question, answer, category, sort_order, is_active)
values
  (
    'What is SpinBite?',
    'SpinBite is a restaurant QR promotion platform. Restaurants create game-based promotions, customers scan a QR code, play on their phone, and receive a coupon they can redeem with staff.',
    'general',
    10,
    true
  ),
  (
    'Do customers need to download an app?',
    'No. Customers scan a QR code and play directly in their mobile browser.',
    'customer experience',
    20,
    true
  ),
  (
    'Can restaurants control the rewards?',
    'Yes. Restaurants configure their own promotions, rewards, coupon expiry, print kits, and validation flow from the restaurant admin area.',
    'restaurant admin',
    30,
    true
  ),
  (
    'How are coupons redeemed?',
    'Customers show the coupon code or QR code to staff. Staff can validate and redeem the coupon using the SpinBite validator.',
    'coupons',
    40,
    true
  ),
  (
    'Can coupons expire?',
    'Yes. Coupons can be configured to expire after a set number of minutes from the time they are issued.',
    'coupons',
    50,
    true
  ),
  (
    'Can SpinBite support more than one game?',
    'Yes. The platform is designed for multiple game types. Spin Wheel is active first, and additional games can be activated from the Super Admin game controls as they are built.',
    'games',
    60,
    true
  )
on conflict do nothing;

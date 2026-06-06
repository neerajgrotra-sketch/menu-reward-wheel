-- Phase 2: Restaurant Settings Table
-- Key-value store for per-restaurant feature flags and experimental configuration.
-- NOT intended for core business attributes (those live as real columns on restaurants).
--
-- Standard keys (not enforced by schema — maintained by convention):
--   hero_layout           "fullbleed" | "banner"          default "fullbleed"
--   widget_position       "bottom_right" | "bottom_left"  default "bottom_right"
--   show_prices_on_landing boolean                        default true
--   reward_card_position  "above_featured"|"below_featured" default "below_featured"
--   ai_features_enabled   boolean                         default false

create table if not exists public.restaurant_settings (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references public.restaurants(id) on delete cascade,
  key           text        not null,
  value         jsonb       not null default 'null'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint restaurant_settings_unique_key unique (restaurant_id, key)
);

create index if not exists restaurant_settings_restaurant_id_idx
  on public.restaurant_settings(restaurant_id);

drop trigger if exists set_restaurant_settings_updated_at on public.restaurant_settings;
create trigger set_restaurant_settings_updated_at
  before update on public.restaurant_settings
  for each row
  execute function public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.restaurant_settings enable row level security;

-- Owners read their own settings (admin portal)
drop policy if exists "Owners read own restaurant settings" on public.restaurant_settings;
create policy "Owners read own restaurant settings"
  on public.restaurant_settings for select
  to authenticated
  using (
    restaurant_id in (
      select id from public.restaurants where owner_id = auth.uid()
    )
  );

-- Owners write their own settings
drop policy if exists "Owners write own restaurant settings" on public.restaurant_settings;
create policy "Owners write own restaurant settings"
  on public.restaurant_settings for all
  to authenticated
  using (
    restaurant_id in (
      select id from public.restaurants where owner_id = auth.uid()
    )
  )
  with check (
    restaurant_id in (
      select id from public.restaurants where owner_id = auth.uid()
    )
  );

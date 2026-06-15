-- Intelligence Engine Foundation
-- Branch: feature/intelligence-engine-foundation
-- Date: 2026-06-15
--
-- Tables (in FK-dependency order):
--   1. intelligence_features
--   2. intelligence_prompt_templates
--   3. intelligence_provider_costs
--   4. intelligence_usage_limits
--   5. restaurant_intelligence_profile
--   6. intelligence_experiments
--   7. intelligence_generation_logs
--
-- set_updated_at() and is_super_admin() already exist from prior migrations.

-- ─── 1. intelligence_features ────────────────────────────────────────────────
-- Registry of every Intelligence Engine capability.
-- feature_key is the system-wide contract identifier.

create table public.intelligence_features (
  id           uuid        primary key default gen_random_uuid(),
  feature_key  text        not null unique,
  name         text        not null,
  description  text,
  enabled      boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists set_intelligence_features_updated_at on public.intelligence_features;
create trigger set_intelligence_features_updated_at
  before update on public.intelligence_features
  for each row execute function public.set_updated_at();

alter table public.intelligence_features enable row level security;

create policy "intelligence_features_select_authenticated"
  on public.intelligence_features for select to authenticated using (true);

create policy "intelligence_features_insert_super_admin"
  on public.intelligence_features for insert to authenticated
  with check (public.is_super_admin());

create policy "intelligence_features_update_super_admin"
  on public.intelligence_features for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "intelligence_features_delete_super_admin"
  on public.intelligence_features for delete to authenticated
  using (public.is_super_admin());

insert into public.intelligence_features (feature_key, name, description, enabled) values
  ('menu_description_generation', 'Menu Description Generation',
   'Generate appetizing menu item descriptions from item name, tags, and restaurant context.',
   true),
  ('promotion_generation',        'Promotion Generation',
   'Generate promotion names and descriptions.',
   false),
  ('campaign_generation',         'Campaign Generation',
   'Generate marketing campaign copy.',
   false),
  ('pricing_recommendation',      'Pricing Recommendation',
   'Suggest pricing based on menu and category context.',
   false),
  ('customer_segmentation',       'Customer Segmentation',
   'Analyse and segment customers for targeted campaigns.',
   false),
  ('sales_optimization',          'Sales Optimization',
   'Suggest menu and promotion changes to improve sales.',
   false),
  ('menu_photo_import',           'Menu Photo Import',
   'Extract and structure menu data from photos.',
   false);

-- ─── 2. intelligence_prompt_templates ────────────────────────────────────────
-- Every prompt that has ever been active is a row. Prompts are never edited
-- in place — a new version is inserted and the previous deactivated.
-- Source code contains zero prompt text.

create table public.intelligence_prompt_templates (
  id                   uuid         primary key default gen_random_uuid(),
  feature_key          text         not null
                         references public.intelligence_features(feature_key)
                         on update cascade on delete restrict,
  name                 text         not null,
  provider             text         not null default 'anthropic'
                         check (provider in ('anthropic', 'openai', 'gemini')),
  model                text         not null default 'claude-haiku-4-5-20251001',
  system_prompt        text,
  user_prompt_template text         not null,
  temperature          numeric(3,2) not null default 0.70
                         check (temperature >= 0 and temperature <= 2),
  max_tokens           int          not null default 150
                         check (max_tokens > 0 and max_tokens <= 4096),
  active               boolean      not null default false,
  version              int          not null default 1,
  notes                text,
  created_at           timestamptz  not null default now(),
  updated_at           timestamptz  not null default now()
);

-- Only one active template per feature at any time.
create unique index intelligence_prompt_templates_one_active_per_feature
  on public.intelligence_prompt_templates (feature_key)
  where active = true;

drop trigger if exists set_intelligence_prompt_templates_updated_at
  on public.intelligence_prompt_templates;
create trigger set_intelligence_prompt_templates_updated_at
  before update on public.intelligence_prompt_templates
  for each row execute function public.set_updated_at();

alter table public.intelligence_prompt_templates enable row level security;

create policy "intelligence_prompt_templates_select_authenticated"
  on public.intelligence_prompt_templates for select to authenticated using (true);

create policy "intelligence_prompt_templates_insert_super_admin"
  on public.intelligence_prompt_templates for insert to authenticated
  with check (public.is_super_admin());

create policy "intelligence_prompt_templates_update_super_admin"
  on public.intelligence_prompt_templates for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "intelligence_prompt_templates_delete_super_admin"
  on public.intelligence_prompt_templates for delete to authenticated
  using (public.is_super_admin());

-- ─── 3. intelligence_provider_costs ──────────────────────────────────────────
-- Pricing is data, not code. Update this table when providers change rates.
-- Cost is USD per 1 million tokens.

create table public.intelligence_provider_costs (
  id                   uuid          primary key default gen_random_uuid(),
  provider             text          not null
                         check (provider in ('anthropic', 'openai', 'gemini')),
  model                text          not null,
  input_cost_per_1m    numeric(12,6) not null check (input_cost_per_1m >= 0),
  output_cost_per_1m   numeric(12,6) not null check (output_cost_per_1m >= 0),
  active               boolean       not null default true,
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now(),
  constraint intelligence_provider_costs_provider_model_unique unique (provider, model)
);

drop trigger if exists set_intelligence_provider_costs_updated_at
  on public.intelligence_provider_costs;
create trigger set_intelligence_provider_costs_updated_at
  before update on public.intelligence_provider_costs
  for each row execute function public.set_updated_at();

alter table public.intelligence_provider_costs enable row level security;

create policy "intelligence_provider_costs_select_authenticated"
  on public.intelligence_provider_costs for select to authenticated using (true);

create policy "intelligence_provider_costs_insert_super_admin"
  on public.intelligence_provider_costs for insert to authenticated
  with check (public.is_super_admin());

create policy "intelligence_provider_costs_update_super_admin"
  on public.intelligence_provider_costs for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "intelligence_provider_costs_delete_super_admin"
  on public.intelligence_provider_costs for delete to authenticated
  using (public.is_super_admin());

-- USD per 1M tokens — current public pricing as of 2026-06-15
insert into public.intelligence_provider_costs
  (provider, model, input_cost_per_1m, output_cost_per_1m)
values
  ('anthropic', 'claude-haiku-4-5-20251001', 0.800000,  4.000000),
  ('anthropic', 'claude-sonnet-4-6',         3.000000,  15.000000),
  ('anthropic', 'claude-opus-4-8',           15.000000, 75.000000);

-- ─── 4. intelligence_usage_limits ────────────────────────────────────────────
-- Per-restaurant generation limits. Auto-provisioned with defaults on first
-- request if no row exists.

create table public.intelligence_usage_limits (
  id                   uuid        primary key default gen_random_uuid(),
  restaurant_id        uuid        not null unique
                         references public.restaurants(id) on delete cascade,
  monthly_limit        int         not null default 100
                         check (monthly_limit >= 0),
  requests_per_minute  int         not null default 5
                         check (requests_per_minute >= 1),
  current_month_usage  int         not null default 0
                         check (current_month_usage >= 0),
  usage_reset_at       timestamptz not null
                         default date_trunc('month', now()) + interval '1 month',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists set_intelligence_usage_limits_updated_at
  on public.intelligence_usage_limits;
create trigger set_intelligence_usage_limits_updated_at
  before update on public.intelligence_usage_limits
  for each row execute function public.set_updated_at();

alter table public.intelligence_usage_limits enable row level security;

create policy "intelligence_usage_limits_select_owner_or_super_admin"
  on public.intelligence_usage_limits for select to authenticated
  using (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
    or public.is_super_admin()
  );

create policy "intelligence_usage_limits_insert_super_admin"
  on public.intelligence_usage_limits for insert to authenticated
  with check (public.is_super_admin());

create policy "intelligence_usage_limits_update_owner_or_super_admin"
  on public.intelligence_usage_limits for update to authenticated
  using (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
    or public.is_super_admin()
  )
  with check (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
    or public.is_super_admin()
  );

-- ─── 5. restaurant_intelligence_profile ──────────────────────────────────────
-- Persistent brand and context data injected automatically into every prompt
-- for that restaurant. One row per restaurant. Filling it in once benefits
-- all Intelligence Engine features.

create table public.restaurant_intelligence_profile (
  id                   uuid        primary key default gen_random_uuid(),
  restaurant_id        uuid        not null unique
                         references public.restaurants(id) on delete cascade,
  cuisine_type         text,
  brand_tone           text
                         check (brand_tone in (
                           'casual', 'elevated', 'playful', 'formal',
                           'rustic', 'modern', 'family'
                         )),
  restaurant_style     text,
  customer_demographic text,
  price_range          text
                         check (price_range in ('$', '$$', '$$$', '$$$$')),
  target_customer      text,
  service_style        text
                         check (service_style in (
                           'counter_service', 'table_service', 'fast_casual',
                           'fine_dining', 'takeout_only', 'delivery_only'
                         )),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists set_restaurant_intelligence_profile_updated_at
  on public.restaurant_intelligence_profile;
create trigger set_restaurant_intelligence_profile_updated_at
  before update on public.restaurant_intelligence_profile
  for each row execute function public.set_updated_at();

alter table public.restaurant_intelligence_profile enable row level security;

create policy "restaurant_intelligence_profile_select_owner_or_super_admin"
  on public.restaurant_intelligence_profile for select to authenticated
  using (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
    or public.is_super_admin()
  );

create policy "restaurant_intelligence_profile_insert_owner_or_super_admin"
  on public.restaurant_intelligence_profile for insert to authenticated
  with check (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
    or public.is_super_admin()
  );

create policy "restaurant_intelligence_profile_update_owner_or_super_admin"
  on public.restaurant_intelligence_profile for update to authenticated
  using (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
    or public.is_super_admin()
  )
  with check (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
    or public.is_super_admin()
  );

create policy "restaurant_intelligence_profile_delete_super_admin"
  on public.restaurant_intelligence_profile for delete to authenticated
  using (public.is_super_admin());

-- ─── 6. intelligence_experiments ─────────────────────────────────────────────
-- A/B testing framework for prompt templates. Only one active experiment
-- per feature at a time.

create table public.intelligence_experiments (
  id                   uuid        primary key default gen_random_uuid(),
  feature_key          text        not null
                         references public.intelligence_features(feature_key)
                         on update cascade on delete restrict,
  name                 text        not null,
  template_a_id        uuid        not null
                         references public.intelligence_prompt_templates(id)
                         on delete restrict,
  template_b_id        uuid        not null
                         references public.intelligence_prompt_templates(id)
                         on delete restrict,
  -- Percentage of requests that receive variant B (1–99).
  traffic_split_pct    int         not null default 50
                         check (traffic_split_pct between 1 and 99),
  winner               text        check (winner in ('a', 'b')),
  active               boolean     not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint intelligence_experiments_templates_differ
    check (template_a_id <> template_b_id)
);

create unique index intelligence_experiments_one_active_per_feature
  on public.intelligence_experiments (feature_key)
  where active = true;

drop trigger if exists set_intelligence_experiments_updated_at
  on public.intelligence_experiments;
create trigger set_intelligence_experiments_updated_at
  before update on public.intelligence_experiments
  for each row execute function public.set_updated_at();

alter table public.intelligence_experiments enable row level security;

create policy "intelligence_experiments_select_authenticated"
  on public.intelligence_experiments for select to authenticated using (true);

create policy "intelligence_experiments_insert_super_admin"
  on public.intelligence_experiments for insert to authenticated
  with check (public.is_super_admin());

create policy "intelligence_experiments_update_super_admin"
  on public.intelligence_experiments for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "intelligence_experiments_delete_super_admin"
  on public.intelligence_experiments for delete to authenticated
  using (public.is_super_admin());

-- ─── 7. intelligence_generation_logs ─────────────────────────────────────────
-- Append-only audit log. Every generation attempt — success or failure —
-- writes one row. No updated_at, no update/delete policies.

create table public.intelligence_generation_logs (
  id                   uuid          primary key default gen_random_uuid(),
  restaurant_id        uuid          references public.restaurants(id) on delete set null,
  user_id              uuid          references auth.users(id) on delete set null,
  feature_key          text          not null,
  prompt_template_id   uuid
                         references public.intelligence_prompt_templates(id)
                         on delete set null,
  experiment_id        uuid
                         references public.intelligence_experiments(id)
                         on delete set null,
  experiment_variant   text          check (experiment_variant in ('a', 'b')),
  provider             text          not null,
  model                text          not null,
  input_tokens         int,
  output_tokens        int,
  -- Stored at write time so historical records survive pricing changes.
  estimated_cost_usd   numeric(10,6),
  latency_ms           int,
  success              boolean       not null,
  error_message        text,
  created_at           timestamptz   not null default now()
);

create index intelligence_generation_logs_restaurant_idx
  on public.intelligence_generation_logs (restaurant_id, created_at desc)
  where restaurant_id is not null;

create index intelligence_generation_logs_feature_key_idx
  on public.intelligence_generation_logs (feature_key, created_at desc);

alter table public.intelligence_generation_logs enable row level security;

create policy "intelligence_generation_logs_select_owner_or_super_admin"
  on public.intelligence_generation_logs for select to authenticated
  using (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
    or public.is_super_admin()
  );

-- Inserts always go through the service role key in route handlers,
-- bypassing RLS. This policy is belt-and-suspenders for future use.
create policy "intelligence_generation_logs_insert_authenticated"
  on public.intelligence_generation_logs for insert to authenticated
  with check (true);

-- ─── 8. Seed: menu_description_generation prompt template ────────────────────
-- This row is the authoritative prompt. The hardcoded text that previously
-- lived in app/api/admin/generate-description/route.ts is now here.
-- Model: claude-haiku-4-5-20251001 (lightweight — appropriate for short text).

insert into public.intelligence_prompt_templates (
  feature_key,
  name,
  provider,
  model,
  system_prompt,
  user_prompt_template,
  temperature,
  max_tokens,
  active,
  version,
  notes
) values (
  'menu_description_generation',
  'Menu Description v1',
  'anthropic',
  'claude-haiku-4-5-20251001',
  null,
  $prompt$Write a concise, appetizing menu description for "{{item_name}}".

Context:
Restaurant: {{restaurant_name}}
Cuisine: {{cuisine_type}}
Brand tone: {{brand_tone}}
Menu category: {{category_name}}
Item tags: {{tags}}

Rules:
- 1-2 sentences, under 300 characters total
- Premium but natural tone - evocative and inviting, not over-the-top
- Describe flavour, texture, or cooking method only if clearly implied by the dish name or tags
- Do NOT claim homemade, fresh, or organic unless explicitly stated in the tags
- Do NOT mention allergens or ingredients not evident from the name or tags
- Do NOT include prices, discounts, or promotional language
- Return only the description text - no quotes, no labels, no preamble$prompt$,
  0.70,
  150,
  true,
  1,
  'Initial prompt migrated from source code at feature/intelligence-engine-foundation. Haiku used for cost efficiency on short descriptions. Template variables: item_name, restaurant_name, cuisine_type, brand_tone, category_name, tags.'
);

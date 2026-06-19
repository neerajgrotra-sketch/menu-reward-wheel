-- AI Food Image Generation Engine
-- Branch: feature/ai-food-image-generation-engine
-- Date: 2026-06-20
--
-- Phase 1: DB migration — schema only, no application code.
--
-- Changes (in FK-dependency order):
--   1. Extend provider CHECK on intelligence_provider_costs + intelligence_prompt_templates
--   2. Add cost_per_generation column to intelligence_provider_costs
--   3. Add image quota columns to intelligence_usage_limits
--   4. CREATE image_generation_jobs
--   5. CREATE ai_generated_assets
--   6. Seed intelligence_features (2 new rows)
--   7. Seed intelligence_prompt_templates (2 new rows)
--   8. Seed intelligence_provider_costs (image model pricing)
--
-- set_updated_at(), is_super_admin() already exist from prior migrations.

-- ─── 1. Extend provider CHECK constraints ─────────────────────────────────────
-- Both tables had CHECK (provider IN ('anthropic','openai','gemini')).
-- Image generation requires 'google' (Imagen 3) and 'replicate' (Flux Pro fallback).

alter table public.intelligence_provider_costs
  drop constraint if exists intelligence_provider_costs_provider_check;

alter table public.intelligence_provider_costs
  add constraint intelligence_provider_costs_provider_check
    check (provider in ('anthropic', 'openai', 'gemini', 'google', 'replicate'));

alter table public.intelligence_prompt_templates
  drop constraint if exists intelligence_prompt_templates_provider_check;

alter table public.intelligence_prompt_templates
  add constraint intelligence_prompt_templates_provider_check
    check (provider in ('anthropic', 'openai', 'gemini', 'google', 'replicate'));

-- ─── 2. cost_per_generation column ───────────────────────────────────────────
-- Image models bill per generation, not per token.
-- Nullable: text models use input/output cost columns; image models use this one.

alter table public.intelligence_provider_costs
  add column if not exists cost_per_generation numeric(12, 6)
    check (cost_per_generation >= 0);

-- ─── 3. Image quota columns on intelligence_usage_limits ─────────────────────
-- Separate quota for image generation: 20 free requests/month per restaurant.
-- 1 request = 1 credit, regardless of variant count (4 variants per request).
-- image_current_month_usage resets on the same cycle as current_month_usage.

alter table public.intelligence_usage_limits
  add column if not exists image_monthly_limit       int not null default 20
    check (image_monthly_limit >= 0),
  add column if not exists image_current_month_usage int not null default 0
    check (image_current_month_usage >= 0);

-- ─── 4. image_generation_jobs ────────────────────────────────────────────────
-- One row per generation request. Tracks async job lifecycle.
-- Workers write via service role key (bypasses RLS).
-- Clients poll via authenticated service role path in route handlers.
--
-- State machine: pending → generating → complete
--                                     ↘ failed

create table public.image_generation_jobs (
  id             uuid        primary key default gen_random_uuid(),
  restaurant_id  uuid        not null
                   references public.restaurants(id) on delete cascade,
  menu_item_id   uuid        not null
                   references public.menu_items(id) on delete cascade,
  user_id        uuid
                   references auth.users(id) on delete set null,
  status         text        not null default 'pending'
                   check (status in ('pending', 'generating', 'complete', 'failed')),
  error_message  text,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists set_image_generation_jobs_updated_at
  on public.image_generation_jobs;
create trigger set_image_generation_jobs_updated_at
  before update on public.image_generation_jobs
  for each row execute function public.set_updated_at();

create index image_generation_jobs_restaurant_item_idx
  on public.image_generation_jobs (restaurant_id, menu_item_id, created_at desc);

create index image_generation_jobs_status_idx
  on public.image_generation_jobs (status, created_at desc)
  where status in ('pending', 'generating');

alter table public.image_generation_jobs enable row level security;

create policy "image_generation_jobs_select_owner_or_super_admin"
  on public.image_generation_jobs for select to authenticated
  using (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
    or public.is_super_admin()
  );

-- All writes go through service role key in route handlers (bypasses RLS).
-- These policies are belt-and-suspenders for future direct-auth paths.
create policy "image_generation_jobs_insert_super_admin"
  on public.image_generation_jobs for insert to authenticated
  with check (public.is_super_admin());

create policy "image_generation_jobs_update_super_admin"
  on public.image_generation_jobs for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "image_generation_jobs_delete_super_admin"
  on public.image_generation_jobs for delete to authenticated
  using (public.is_super_admin());

-- ─── 5. ai_generated_assets ──────────────────────────────────────────────────
-- One row per generated image variant. A standard generation creates 4 rows
-- per job (variant_index 1–4). Tracks provenance, storage location, and
-- whether the restaurant accepted this variant onto their menu item.
--
-- Only the selected / selected_at columns are mutable after insert.
-- All other columns are set at insert time and never changed.

create table public.ai_generated_assets (
  id                  uuid         primary key default gen_random_uuid(),

  -- Ownership
  restaurant_id       uuid         not null
                        references public.restaurants(id) on delete cascade,
  menu_item_id        uuid
                        references public.menu_items(id) on delete set null,

  -- Job linkage
  job_id              uuid
                        references public.image_generation_jobs(id) on delete set null,

  -- Classification
  asset_type          text         not null default 'menu_item_photo'
                        check (asset_type in ('menu_item_photo', 'hero_image', 'logo')),

  -- Generation provenance — immutable after insert
  provider            text         not null,
  model               text         not null,
  prompt_used         text         not null,   -- final prompt sent to image provider
  enhanced_prompt     text,                    -- output from Haiku enhancer step
  generation_version  int          not null default 1,  -- Nth generation for this item
  variant_index       int          not null default 1
                        check (variant_index between 1 and 10),

  -- Storage
  storage_path        text         not null,   -- relative path in Supabase Storage bucket
  storage_url         text         not null,   -- full public CDN URL

  -- Selection state
  selected            boolean      not null default false,
  selected_at         timestamptz,

  -- Cost tracking (captured at insert time, survives pricing changes)
  estimated_cost_usd  numeric(10, 6),

  created_at          timestamptz  not null default now()
);

-- No updated_at: only selected/selected_at change post-insert.
-- Tracks selection via explicit columns rather than generic updated_at.

create index ai_generated_assets_job_idx
  on public.ai_generated_assets (job_id, variant_index);

create index ai_generated_assets_restaurant_idx
  on public.ai_generated_assets (restaurant_id, created_at desc);

create index ai_generated_assets_item_selected_idx
  on public.ai_generated_assets (menu_item_id, selected)
  where selected = true;

alter table public.ai_generated_assets enable row level security;

create policy "ai_generated_assets_select_owner_or_super_admin"
  on public.ai_generated_assets for select to authenticated
  using (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
    or public.is_super_admin()
  );

create policy "ai_generated_assets_insert_super_admin"
  on public.ai_generated_assets for insert to authenticated
  with check (public.is_super_admin());

create policy "ai_generated_assets_update_super_admin"
  on public.ai_generated_assets for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "ai_generated_assets_delete_super_admin"
  on public.ai_generated_assets for delete to authenticated
  using (public.is_super_admin());

-- ─── 6. Seed: intelligence_features ──────────────────────────────────────────
-- food_image_prompt_enhancement: enabled at launch — always runs before image gen.
-- restaurant_food_image_generation: disabled until provider credentials are
--   confirmed in Vercel env vars. Toggle via Supabase dashboard, no code deploy.

insert into public.intelligence_features
  (feature_key, name, description, enabled)
values
  (
    'food_image_prompt_enhancement',
    'Food Image Prompt Enhancement',
    'Enriches dish names and descriptions into detailed visual descriptions for AI image generation. Uses Claude Haiku. Runs automatically before every image generation request.',
    true
  ),
  (
    'restaurant_food_image_generation',
    'Restaurant Food Image Generation',
    'Generates 4 photorealistic food photography variants per request using Google Imagen 3. Restaurant reviews variants and accepts one onto their menu item.',
    false
  );

-- ─── 7. Seed: intelligence_prompt_templates ───────────────────────────────────
-- Both prompts are SpinBite IP. No prompt text lives in source code (Rule 20).
-- Enhancement prompt: active immediately (feature enabled above).
-- Image generation prompt: status = draft, active = false — enabled with feature toggle.

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
  status,
  version,
  notes
)
values
  -- ── Enhancement prompt ──────────────────────────────────────────────────────
  (
    'food_image_prompt_enhancement',
    'Food Image Prompt Enhancer v1',
    'anthropic',
    'claude-haiku-4-5-20251001',
    $sys$You are a food photography visual assistant for the SpinBite restaurant platform.
Your task: given a dish name, optional description, and restaurant context, produce a precise visual ingredient and presentation list for professional food photography AI generation.

Output rules — strictly enforced:
- Output ONLY a comma-separated visual noun phrase list
- No sentences, no explanations, no preamble, no quotes, no markdown
- No subjective words: delicious, tasty, amazing, fresh, homemade
- Focus on: visible ingredients, cooking appearance, plating style, garnishes, serving vessel, sauce presentation
- Maximum 100 words$sys$,
    $prompt$Dish: {{item_name}}
Description: {{item_description}}
Restaurant: {{restaurant_name}}
Cuisine type: {{cuisine_type}}
Brand tone: {{brand_tone}}
Restaurant style: {{restaurant_style}}

Produce a visual description list for this dish for professional food photography AI image generation. Be specific, visual, and cuisine-appropriate.$prompt$,
    0.60,
    150,
    true,
    'active',
    1,
    'SpinBite IP. Haiku used for cost efficiency (~$0.001/call). Output feeds {{enhanced_description}} in image generation template. Variables: item_name, item_description, restaurant_name, cuisine_type, brand_tone, restaurant_style.'
  ),

  -- ── Image generation prompt ─────────────────────────────────────────────────
  (
    'restaurant_food_image_generation',
    'Food Image Generation v1',
    'google',
    'imagen-3',
    null,
    $prompt$Professional restaurant food photography of {{item_name}} at {{restaurant_name}}.

{{enhanced_description}}

Photography direction: overhead or 45-degree angle, natural soft window light, premium restaurant-quality plating, no text overlays, no watermarks, no hands, no people, no props beyond food and tableware, photorealistic, high-end food delivery app hero image quality.

Cuisine and brand context: {{restaurant_name}} is a {{restaurant_style}} establishment serving {{cuisine_type}} cuisine with a {{brand_tone}} brand character. Match the plating style, colour temperature, surface materials, and visual atmosphere to this cuisine and brand identity.$prompt$,
    1.00,
    1,
    false,
    'draft',
    1,
    'SpinBite IP. Google Imagen 3 via Vertex AI REST API. temperature and max_tokens are not applicable to image generation — stored as 1.00/1 and ignored by image-engine. Variables: item_name, restaurant_name, enhanced_description, restaurant_style, cuisine_type, brand_tone. Enable via activate_prompt_version() when provider credentials confirmed.'
  );

-- ─── 8. Seed: intelligence_provider_costs (image models) ─────────────────────
-- cost_per_generation is USD per single image generated.
-- input_cost_per_1m and output_cost_per_1m are 0.00 for image models
-- (token costs don't apply; cost_per_generation is the operative field).
-- Pricing as of 2026-06-20.

insert into public.intelligence_provider_costs
  (provider, model, input_cost_per_1m, output_cost_per_1m, cost_per_generation)
values
  ('google',    'imagen-3',           0.000000, 0.000000, 0.020000),
  ('replicate', 'flux-pro-1.1',       0.000000, 0.000000, 0.055000),
  ('openai',    'dall-e-3-standard',  0.000000, 0.000000, 0.040000),
  ('openai',    'dall-e-3-hd',        0.000000, 0.000000, 0.080000);

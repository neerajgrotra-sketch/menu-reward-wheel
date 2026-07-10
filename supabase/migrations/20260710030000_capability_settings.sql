-- Capability Management: replaces the single global "is dashboard_assistant
-- enabled" question with per-capability, hierarchically-scoped answers, so
-- a future rollout ("enable analytics_agent for one test restaurant") never
-- needs a code change — only a row here.
--
-- Three scopes, most specific wins at read time: restaurant > owner >
-- environment. `intelligence_features` is NOT touched or removed — it
-- remains the outer whole-feature kill switch for `dashboard_assistant`
-- exactly as before (lib/intelligence/feature-resolver.ts is unchanged).
-- This table is a second, finer-grained gate layered underneath it, checked
-- by the Restaurant Planner's tool-selection layer
-- (lib/restaurant-planner/tool-registry.ts's isCapabilityAvailable), not by
-- the intelligence engine.
--
-- "Migrate the existing flag into the new registry, remaining backward
-- compatible": the seed row below mirrors the *current* value of
-- intelligence_features.enabled for 'dashboard_assistant' (false, verified
-- live) as the environment-level default for the 'menu_pricing' capability
-- — the only capability that flag ever gated. Going forward the two are
-- independent; capability_settings.isCapabilityEnabled() only falls back to
-- reading the legacy flag for 'menu_pricing' when no capability_settings
-- row exists for it at all (see the resolver for the exact fallback order).

create table public.capability_settings (
  id             uuid        primary key default gen_random_uuid(),
  -- Matches a key in lib/restaurant-planner/tool-registry.ts's
  -- CAPABILITY_REGISTRY (e.g. 'menu_pricing', 'analytics_agent') — not
  -- foreign-keyed to code, so a new capability's rows can be seeded before
  -- or after its module ships.
  capability_key text        not null,
  scope          text        not null check (scope in ('environment', 'restaurant', 'owner')),
  -- null for scope='environment' (there is only ever one); a restaurants.id
  -- for scope='restaurant'; an auth.users.id (restaurants.owner_id) for
  -- scope='owner'. Not a single FK since it points at two different tables
  -- depending on scope — validity is enforced at the application layer,
  -- same convention as menu_discount_change_log's polymorphic-by-source design.
  scope_id       uuid,
  enabled        boolean     not null default false,
  updated_by     uuid        references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint capability_settings_scope_id_shape check (
    (scope = 'environment' and scope_id is null) or
    (scope in ('restaurant', 'owner') and scope_id is not null)
  )
);

-- At most one row per capability per scope-instance. Partial indexes (not a
-- single composite unique) because scope_id is null for 'environment' and
-- Postgres treats each NULL as distinct in a plain unique index.
create unique index capability_settings_environment_uniq
  on public.capability_settings (capability_key) where scope = 'environment';
create unique index capability_settings_restaurant_uniq
  on public.capability_settings (capability_key, scope_id) where scope = 'restaurant';
create unique index capability_settings_owner_uniq
  on public.capability_settings (capability_key, scope_id) where scope = 'owner';

create index capability_settings_lookup_idx
  on public.capability_settings (capability_key, scope, scope_id);

-- Mutable config, not an event log — same convention as
-- intelligence_features.enabled (plain UPDATE via toggleFeature), not the
-- append-only convention used by proposals/messages/audit logs, since this
-- is current on/off state rather than history.
create or replace function public.touch_capability_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger capability_settings_touch_updated_at
  before update on public.capability_settings
  for each row execute function public.touch_capability_settings_updated_at();

alter table public.capability_settings enable row level security;

-- Platform configuration — same security model as intelligence_features /
-- intelligence_prompt_templates (super-admin only, all operations). A
-- restaurant owner has no self-service UI to toggle their own capabilities
-- today; this is a platform rollout control, not a customer-facing setting.
create policy "capability_settings_super_admin_all"
  on public.capability_settings for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Seeds the environment-level default for the one real capability today,
-- mirroring the live intelligence_features.enabled value for
-- 'dashboard_assistant' at the time of this migration (false).
insert into public.capability_settings (capability_key, scope, scope_id, enabled)
values ('menu_pricing', 'environment', null, false);

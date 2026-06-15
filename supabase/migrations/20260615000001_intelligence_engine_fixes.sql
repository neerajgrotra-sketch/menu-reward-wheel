-- Intelligence Engine — Security & Lifecycle Fixes
-- Branch: feature/intelligence-lab-pr2
-- Date: 2026-06-15
--
-- Fixes applied:
--   1. RLS: Restrict SELECT on all platform intelligence tables to super_admin only
--   2. Atomic activation: activate_prompt_version(feature_key, template_id) RPC
--   4. Audit log: intelligence_audit_log table
--   5. Prompt lifecycle: status column (draft → testing → active → archived)
--
-- Order: 5 before 2 (RPC sets status values); 1 and 4 are independent.

-- ─── Fix 5 — Prompt lifecycle status column ──────────────────────────────────

alter table public.intelligence_prompt_templates
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'testing', 'active', 'archived'));

-- Backfill: seed row (active = true) → 'active'; any inactive rows → 'archived'.
update public.intelligence_prompt_templates
  set status = 'active'
  where active = true;

update public.intelligence_prompt_templates
  set status = 'archived'
  where active = false;

-- ─── Fix 1 — RLS: restrict SELECT to super_admin only ────────────────────────

-- intelligence_features
drop policy if exists "intelligence_features_select_authenticated"
  on public.intelligence_features;
create policy "intelligence_features_select_super_admin"
  on public.intelligence_features for select to authenticated
  using (public.is_super_admin());

-- intelligence_prompt_templates
drop policy if exists "intelligence_prompt_templates_select_authenticated"
  on public.intelligence_prompt_templates;
create policy "intelligence_prompt_templates_select_super_admin"
  on public.intelligence_prompt_templates for select to authenticated
  using (public.is_super_admin());

-- intelligence_provider_costs
drop policy if exists "intelligence_provider_costs_select_authenticated"
  on public.intelligence_provider_costs;
create policy "intelligence_provider_costs_select_super_admin"
  on public.intelligence_provider_costs for select to authenticated
  using (public.is_super_admin());

-- intelligence_experiments
drop policy if exists "intelligence_experiments_select_authenticated"
  on public.intelligence_experiments;
create policy "intelligence_experiments_select_super_admin"
  on public.intelligence_experiments for select to authenticated
  using (public.is_super_admin());

-- ─── Fix 2 — Atomic prompt activation RPC ────────────────────────────────────
--
-- Deactivates the currently active template and activates the target template
-- in a single transaction. The unique partial index
-- intelligence_prompt_templates_one_active_per_feature (WHERE active = true)
-- still enforces DB-level uniqueness. This function makes the swap atomic so
-- there is never a window with zero active templates for a feature.
--
-- SECURITY DEFINER: runs as the function owner (bypasses RLS) but performs its
-- own is_super_admin() guard so ordinary users cannot invoke it.
-- SET search_path = public: prevents search-path injection attacks.

create or replace function public.activate_prompt_version(
  p_feature_key  text,
  p_template_id  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Permission guard — must be super admin.
  if not public.is_super_admin() then
    raise exception 'Permission denied: super admin required.';
  end if;

  -- Verify the target template exists and belongs to the stated feature.
  if not exists (
    select 1 from public.intelligence_prompt_templates
    where id = p_template_id and feature_key = p_feature_key
  ) then
    raise exception 'Template % does not belong to feature %.', p_template_id, p_feature_key;
  end if;

  -- Idempotent: if the target is already active, nothing to do.
  if exists (
    select 1 from public.intelligence_prompt_templates
    where id = p_template_id and active = true
  ) then
    return;
  end if;

  -- Step 1: Archive the current active template for this feature (if any).
  update public.intelligence_prompt_templates
  set    active = false,
         status = 'archived'
  where  feature_key = p_feature_key
    and  active = true
    and  id <> p_template_id;

  -- Step 2: Activate the target template.
  update public.intelligence_prompt_templates
  set    active = true,
         status = 'active'
  where  id           = p_template_id
    and  feature_key  = p_feature_key;

  -- Confirm the update actually matched a row.
  if not found then
    raise exception 'Activation failed: template % not found for feature %.', p_template_id, p_feature_key;
  end if;
end;
$$;

-- Grant execute to authenticated; the function's own guard restricts to super_admin.
grant execute on function public.activate_prompt_version(text, uuid) to authenticated;

-- ─── Fix 4 — intelligence_audit_log ──────────────────────────────────────────
--
-- Append-only audit trail for all super-admin mutations on intelligence tables.
-- Inserts always go through the service role client in server actions.
-- No UPDATE or DELETE policies — this table is immutable after write.

create table if not exists public.intelligence_audit_log (
  id            uuid        primary key default gen_random_uuid(),
  admin_user_id uuid        references auth.users(id) on delete set null,
  action        text        not null,   -- e.g. 'feature_toggled', 'template_created'
  entity_type   text        not null,   -- 'feature', 'prompt_template', 'provider_cost', 'experiment'
  entity_id     text,                   -- feature_key or UUID of the affected row
  old_value     jsonb,
  new_value     jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists intelligence_audit_log_user_idx
  on public.intelligence_audit_log (admin_user_id, created_at desc);

create index if not exists intelligence_audit_log_entity_idx
  on public.intelligence_audit_log (entity_type, entity_id, created_at desc);

alter table public.intelligence_audit_log enable row level security;

create policy "intelligence_audit_log_select_super_admin"
  on public.intelligence_audit_log for select to authenticated
  using (public.is_super_admin());

create policy "intelligence_audit_log_insert_service_role"
  on public.intelligence_audit_log for insert to authenticated
  with check (public.is_super_admin());

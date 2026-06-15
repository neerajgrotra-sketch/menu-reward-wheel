'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/super-admin';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured.');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  return createServiceSupabaseClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function requiredString(value: FormDataEntryValue | null, fallback = '') {
  return String(value || '').trim() || fallback;
}

function toFloat(value: FormDataEntryValue | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(value: FormDataEntryValue | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function revalidateLab() {
  revalidatePath('/super-admin/intelligence-lab');
}

// Audit log — written via service role so it always succeeds regardless of
// session state. Failures are swallowed to never block the primary mutation.
async function writeAuditLog(
  adminUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
) {
  try {
    const svc = makeServiceClient();
    await svc.from('intelligence_audit_log').insert({
      admin_user_id: adminUserId,
      action,
      entity_type:   entityType,
      entity_id:     entityId,
      old_value:     oldValue  as Database['public']['Tables']['intelligence_audit_log']['Insert']['old_value'],
      new_value:     newValue  as Database['public']['Tables']['intelligence_audit_log']['Insert']['new_value'],
    });
  } catch (err) {
    console.error('[intelligence-audit] Failed to write audit log:', err);
  }
}

// ── Feature toggles ──────────────────────────────────────────────────────────

export async function toggleFeature(formData: FormData) {
  const { user } = await requireSuperAdmin();

  const featureKey = requiredString(formData.get('feature_key'));
  const enabled    = formData.get('enabled') === 'true';
  if (!featureKey) throw new Error('feature_key is required.');

  const supabase = createClient();
  const { error } = await supabase
    .from('intelligence_features')
    .update({ enabled })
    .eq('feature_key', featureKey);

  if (error) throw new Error(error.message);

  await writeAuditLog(user.id, 'feature_toggled', 'feature', featureKey,
    { enabled: !enabled },
    { enabled },
  );

  revalidateLab();
}

// ── Prompt templates ─────────────────────────────────────────────────────────

// Creates a new template version as 'draft'. It does NOT activate immediately.
// Activation is a separate deliberate step via activateTemplate / the RPC.
export async function savePromptTemplate(formData: FormData) {
  const { user } = await requireSuperAdmin();

  const featureKey         = requiredString(formData.get('feature_key'));
  const name               = requiredString(formData.get('name'), 'Untitled Template');
  const provider           = requiredString(formData.get('provider'), 'anthropic');
  const model              = requiredString(formData.get('model'), 'claude-haiku-4-5-20251001');
  const systemPrompt       = requiredString(formData.get('system_prompt')) || null;
  const userPromptTemplate = requiredString(formData.get('user_prompt_template'));
  const temperature        = toFloat(formData.get('temperature'), 0.7);
  const maxTokens          = toInt(formData.get('max_tokens'), 150);
  const notes              = requiredString(formData.get('notes')) || null;

  if (!featureKey)         throw new Error('feature_key is required.');
  if (!userPromptTemplate) throw new Error('user_prompt_template is required.');

  const supabase = createClient();

  const { data: latest } = await supabase
    .from('intelligence_prompt_templates')
    .select('version')
    .eq('feature_key', featureKey)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version ?? 0) + 1;

  // Insert as draft — never auto-activates.
  const { data: newTemplate, error } = await supabase
    .from('intelligence_prompt_templates')
    .insert({
      feature_key:          featureKey,
      name,
      provider,
      model,
      system_prompt:        systemPrompt,
      user_prompt_template: userPromptTemplate,
      temperature,
      max_tokens:           maxTokens,
      active:               false,
      status:               'draft',
      version:              nextVersion,
      notes,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  await writeAuditLog(user.id, 'template_created', 'prompt_template', newTemplate.id, null, {
    feature_key: featureKey,
    name,
    provider,
    model,
    version:     nextVersion,
    status:      'draft',
  });

  revalidateLab();
}

// Atomically swaps the active template using the activate_prompt_version RPC.
// The RPC runs both UPDATEs in a single Postgres transaction — no zero-active window.
export async function activateTemplate(formData: FormData) {
  const { user } = await requireSuperAdmin();

  const templateId = requiredString(formData.get('template_id'));
  const featureKey = requiredString(formData.get('feature_key'));
  if (!templateId || !featureKey) throw new Error('template_id and feature_key are required.');

  const supabase = createClient();
  const { error } = await supabase.rpc('activate_prompt_version', {
    p_feature_key: featureKey,
    p_template_id: templateId,
  });

  if (error) throw new Error(error.message);

  await writeAuditLog(user.id, 'template_activated', 'prompt_template', templateId, null, {
    feature_key: featureKey,
    status:      'active',
  });

  revalidateLab();
}

// ── Provider costs ────────────────────────────────────────────────────────────

export async function updateProviderCost(formData: FormData) {
  const { user } = await requireSuperAdmin();

  const id              = requiredString(formData.get('id'));
  const inputCostPer1m  = toFloat(formData.get('input_cost_per_1m'), 0);
  const outputCostPer1m = toFloat(formData.get('output_cost_per_1m'), 0);
  if (!id) throw new Error('id is required.');

  const supabase = createClient();

  // Fetch current values for the audit log before mutating.
  const { data: oldCost } = await supabase
    .from('intelligence_provider_costs')
    .select('input_cost_per_1m, output_cost_per_1m')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('intelligence_provider_costs')
    .update({ input_cost_per_1m: inputCostPer1m, output_cost_per_1m: outputCostPer1m })
    .eq('id', id);

  if (error) throw new Error(error.message);

  await writeAuditLog(user.id, 'provider_cost_updated', 'provider_cost', id,
    oldCost ? { input_cost_per_1m: oldCost.input_cost_per_1m, output_cost_per_1m: oldCost.output_cost_per_1m } : null,
    { input_cost_per_1m: inputCostPer1m, output_cost_per_1m: outputCostPer1m },
  );

  revalidateLab();
}

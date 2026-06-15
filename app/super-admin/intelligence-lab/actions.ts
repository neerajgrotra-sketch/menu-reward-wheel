'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/super-admin';
import { createClient } from '@/lib/supabase/server';

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

// ── Feature toggles ──────────────────────────────────────────────────────────

export async function toggleFeature(formData: FormData) {
  await requireSuperAdmin();

  const featureKey = requiredString(formData.get('feature_key'));
  const enabled    = formData.get('enabled') === 'true';
  if (!featureKey) throw new Error('feature_key is required.');

  const supabase = createClient();
  const { error } = await supabase
    .from('intelligence_features')
    .update({ enabled })
    .eq('feature_key', featureKey);

  if (error) throw new Error(error.message);
  revalidateLab();
}

// ── Prompt templates ─────────────────────────────────────────────────────────

export async function savePromptTemplate(formData: FormData) {
  await requireSuperAdmin();

  const featureKey          = requiredString(formData.get('feature_key'));
  const name                = requiredString(formData.get('name'), 'Untitled Template');
  const provider            = requiredString(formData.get('provider'), 'anthropic');
  const model               = requiredString(formData.get('model'), 'claude-haiku-4-5-20251001');
  const systemPrompt        = requiredString(formData.get('system_prompt')) || null;
  const userPromptTemplate  = requiredString(formData.get('user_prompt_template'));
  const temperature         = toFloat(formData.get('temperature'), 0.7);
  const maxTokens           = toInt(formData.get('max_tokens'), 150);
  const notes               = requiredString(formData.get('notes')) || null;

  if (!featureKey)         throw new Error('feature_key is required.');
  if (!userPromptTemplate) throw new Error('user_prompt_template is required.');

  const supabase = createClient();

  // Determine the next version number for this feature.
  const { data: latest } = await supabase
    .from('intelligence_prompt_templates')
    .select('version')
    .eq('feature_key', featureKey)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version ?? 0) + 1;

  // Deactivate any currently active template for this feature.
  await supabase
    .from('intelligence_prompt_templates')
    .update({ active: false })
    .eq('feature_key', featureKey)
    .eq('active', true);

  // Insert the new version as the active template.
  const { error } = await supabase
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
      active:               true,
      version:              nextVersion,
      notes,
    });

  if (error) throw new Error(error.message);
  revalidateLab();
}

export async function activateTemplate(formData: FormData) {
  await requireSuperAdmin();

  const templateId = requiredString(formData.get('template_id'));
  const featureKey = requiredString(formData.get('feature_key'));
  if (!templateId || !featureKey) throw new Error('template_id and feature_key are required.');

  const supabase = createClient();

  // Deactivate the current active template for this feature.
  await supabase
    .from('intelligence_prompt_templates')
    .update({ active: false })
    .eq('feature_key', featureKey)
    .eq('active', true);

  // Activate the selected template.
  const { error } = await supabase
    .from('intelligence_prompt_templates')
    .update({ active: true })
    .eq('id', templateId);

  if (error) throw new Error(error.message);
  revalidateLab();
}

// ── Provider costs ────────────────────────────────────────────────────────────

export async function updateProviderCost(formData: FormData) {
  await requireSuperAdmin();

  const id              = requiredString(formData.get('id'));
  const inputCostPer1m  = toFloat(formData.get('input_cost_per_1m'), 0);
  const outputCostPer1m = toFloat(formData.get('output_cost_per_1m'), 0);
  if (!id) throw new Error('id is required.');

  const supabase = createClient();
  const { error } = await supabase
    .from('intelligence_provider_costs')
    .update({ input_cost_per_1m: inputCostPer1m, output_cost_per_1m: outputCostPer1m })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidateLab();
}

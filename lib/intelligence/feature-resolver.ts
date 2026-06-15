import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export type PromptTemplate =
  Database['public']['Tables']['intelligence_prompt_templates']['Row'];

export type ResolvedFeature = {
  template: PromptTemplate;
  experimentId: string | null;
  variant: 'a' | 'b' | null;
};

export class FeatureDisabledError extends Error {
  constructor(featureKey: string) {
    super(`Intelligence feature '${featureKey}' is disabled or does not exist.`);
    this.name = 'FeatureDisabledError';
  }
}

export class TemplateMissingError extends Error {
  constructor(featureKey: string) {
    super(`No active prompt template found for feature '${featureKey}'.`);
    this.name = 'TemplateMissingError';
  }
}

export async function resolveFeature(
  featureKey: string,
  supabase: SupabaseClient<Database>
): Promise<ResolvedFeature> {
  // Verify feature exists and is enabled.
  const { data: feature } = await supabase
    .from('intelligence_features')
    .select('enabled')
    .eq('feature_key', featureKey)
    .maybeSingle();

  if (!feature || !feature.enabled) {
    throw new FeatureDisabledError(featureKey);
  }

  // Check for an active A/B experiment on this feature.
  const { data: experiment } = await supabase
    .from('intelligence_experiments')
    .select('id, template_a_id, template_b_id, traffic_split_pct')
    .eq('feature_key', featureKey)
    .eq('active', true)
    .maybeSingle();

  if (experiment) {
    // Roll 1–100: values <= traffic_split_pct go to variant B.
    const roll = Math.floor(Math.random() * 100) + 1;
    const variant: 'a' | 'b' = roll <= experiment.traffic_split_pct ? 'b' : 'a';
    const templateId =
      variant === 'b' ? experiment.template_b_id : experiment.template_a_id;

    const { data: template } = await supabase
      .from('intelligence_prompt_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (!template) throw new TemplateMissingError(featureKey);

    return { template, experimentId: experiment.id, variant };
  }

  // No experiment — load the single active template for this feature.
  const { data: template } = await supabase
    .from('intelligence_prompt_templates')
    .select('*')
    .eq('feature_key', featureKey)
    .eq('active', true)
    .maybeSingle();

  if (!template) throw new TemplateMissingError(featureKey);

  return { template, experimentId: null, variant: null };
}

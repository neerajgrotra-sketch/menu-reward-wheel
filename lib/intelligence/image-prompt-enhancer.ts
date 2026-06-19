import { createClient as createServiceSupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { resolveFeature } from './feature-resolver';
import { buildContext } from './context-builder';
import { renderPrompt } from './prompt-engine';
import { AnthropicProvider } from './providers/anthropic-provider';
import { validate } from './validators';

const FEATURE_KEY = 'food_image_prompt_enhancement';

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

export type EnhancerResult = {
  enhancedDescription: string;
  usedFallback: boolean;
};

export async function enhanceImagePrompt(
  rawContext: Record<string, string>,
  restaurantId: string,
  userId: string,
  serviceClient: SupabaseClient<Database>,
): Promise<EnhancerResult> {
  const startTime = Date.now();
  let success = false;
  let errorMessage: string | null = null;
  let provider = 'anthropic';
  let model = 'claude-haiku-4-5-20251001';
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let estimatedCostUsd: number | null = null;

  const fallback = rawContext.item_description || rawContext.item_name || '';

  try {
    // 1. Resolve the enhancement feature + template.
    const resolved = await resolveFeature(FEATURE_KEY, serviceClient);
    provider = resolved.template.provider;
    model = resolved.template.model;

    // 2. Build context (merges restaurant profile + raw input).
    const context = await buildContext(
      FEATURE_KEY,
      restaurantId,
      rawContext,
      serviceClient,
    );

    // 3. Render the enhancer prompt.
    const userPrompt = renderPrompt(resolved.template.user_prompt_template, context);
    const systemPrompt = resolved.template.system_prompt
      ? renderPrompt(resolved.template.system_prompt, context)
      : null;

    // 4. Look up cost for this model.
    const { data: costRow } = await serviceClient
      .from('intelligence_provider_costs')
      .select('input_cost_per_1m, output_cost_per_1m')
      .eq('provider', provider)
      .eq('model', model)
      .maybeSingle();

    // 5. Call Anthropic Haiku — cheapest model, short output.
    const anthropic = new AnthropicProvider();
    const result = await anthropic.generate({
      model,
      systemPrompt,
      userPrompt,
      temperature: Number(resolved.template.temperature),
      maxTokens: resolved.template.max_tokens,
    });

    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;

    if (costRow) {
      estimatedCostUsd =
        (inputTokens / 1_000_000) * Number(costRow.input_cost_per_1m) +
        (outputTokens / 1_000_000) * Number(costRow.output_cost_per_1m);
    }

    // 6. Validate output — must be non-empty and not look like prose.
    const enhanced = validate(FEATURE_KEY, result.output);
    success = true;

    return { enhancedDescription: enhanced, usedFallback: false };
  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : 'Unknown error in prompt enhancement';
    // Enhancement failure is non-fatal — caller continues with fallback.
    console.warn('[image-prompt-enhancer] Falling back to raw description:', errorMessage);
    return { enhancedDescription: fallback, usedFallback: true };
  } finally {
    // Log regardless of success or failure.
    const latencyMs = Date.now() - startTime;
    try {
      await serviceClient.from('intelligence_generation_logs').insert({
        restaurant_id: restaurantId,
        user_id: userId,
        feature_key: FEATURE_KEY,
        prompt_template_id: null,
        experiment_id: null,
        experiment_variant: null,
        provider,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: estimatedCostUsd,
        latency_ms: latencyMs,
        success,
        error_message: errorMessage,
      });
    } catch (logErr) {
      console.error('[image-prompt-enhancer] Failed to write log:', logErr);
    }
  }
}

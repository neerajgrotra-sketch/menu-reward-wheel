import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { resolveFeature } from './feature-resolver';
import { buildContext } from './context-builder';
import { renderPrompt } from './prompt-engine';
import { validate } from './validators';
import { AnthropicProvider } from './providers/anthropic-provider';
import { OpenAIProvider } from './providers/openai-provider';
import { GeminiProvider } from './providers/gemini-provider';
import type { IntelligenceProvider } from './providers/provider.interface';

export type GenerateParams = {
  featureKey: string;
  restaurantId: string;
  userId: string;
  rawInput: Record<string, string>;
};

export type GenerateResult = {
  output: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
};

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

function getProvider(providerName: string): IntelligenceProvider {
  switch (providerName) {
    case 'anthropic': return new AnthropicProvider();
    case 'openai':    return new OpenAIProvider();
    case 'gemini':    return new GeminiProvider();
    default:
      throw new Error(`Unknown provider: '${providerName}'`);
  }
}

export async function generate(params: GenerateParams): Promise<GenerateResult> {
  const { featureKey, restaurantId, userId, rawInput } = params;

  // Both clients created before try/finally so they are in scope for the log write.
  const serverClient = createClient();
  const serviceClient = makeServiceClient();

  // Variables captured for the generation log — populated as the flow progresses.
  let templateId: string | null = null;
  let experimentId: string | null = null;
  let variant: 'a' | 'b' | null = null;
  let provider = 'unknown';
  let model = 'unknown';
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let estimatedCostUsd: number | null = null;
  let latencyMs: number | null = null;
  let success = false;
  let errorMessage: string | null = null;
  let output = '';

  const startTime = Date.now();

  try {
    // 1. Resolve template (or experiment variant).
    // serviceClient used: RLS on platform tables restricts reads to super_admin;
    // the service role bypasses RLS so generation works for any authenticated user.
    const resolved = await resolveFeature(featureKey, serviceClient);
    templateId  = resolved.template.id;
    experimentId = resolved.experimentId;
    variant     = resolved.variant;
    provider    = resolved.template.provider;
    model       = resolved.template.model;

    // 2. Build context (merges intelligence profile + caller-supplied input).
    const context = await buildContext(featureKey, restaurantId, rawInput, serverClient);

    // 3. Render the prompt — substitutes all {{variables}}.
    const userPrompt = renderPrompt(resolved.template.user_prompt_template, context);
    const systemPrompt = resolved.template.system_prompt
      ? renderPrompt(resolved.template.system_prompt, context)
      : null;

    // 4. Look up cost rate for this provider + model.
    // serviceClient used: RLS restricts intelligence_provider_costs to super_admin.
    const { data: costRow } = await serviceClient
      .from('intelligence_provider_costs')
      .select('input_cost_per_1m, output_cost_per_1m')
      .eq('provider', provider)
      .eq('model', model)
      .maybeSingle();

    // 5. Route to the correct provider adapter.
    const providerAdapter = getProvider(provider);

    // 6. Generate.
    const result = await providerAdapter.generate({
      model,
      systemPrompt,
      userPrompt,
      temperature: Number(resolved.template.temperature),
      maxTokens:   resolved.template.max_tokens,
    });

    latencyMs    = Date.now() - startTime;
    inputTokens  = result.inputTokens;
    outputTokens = result.outputTokens;

    if (costRow) {
      estimatedCostUsd =
        (inputTokens  / 1_000_000) * Number(costRow.input_cost_per_1m) +
        (outputTokens / 1_000_000) * Number(costRow.output_cost_per_1m);
    }

    // 7. Validate and clean output.
    output  = validate(featureKey, result.output);
    success = true;

    return {
      output,
      inputTokens,
      outputTokens,
      latencyMs,
      estimatedCostUsd: estimatedCostUsd ?? 0,
    };
  } catch (err: unknown) {
    latencyMs    = Date.now() - startTime;
    errorMessage = err instanceof Error ? err.message : 'Unknown error';
    throw err;
  } finally {
    // Always write a generation log — success and failure both produce a row.
    try {
      await serviceClient.from('intelligence_generation_logs').insert({
        restaurant_id:      restaurantId,
        user_id:            userId,
        feature_key:        featureKey,
        prompt_template_id: templateId,
        experiment_id:      experimentId,
        experiment_variant: variant,
        provider,
        model,
        input_tokens:       inputTokens,
        output_tokens:      outputTokens,
        estimated_cost_usd: estimatedCostUsd,
        latency_ms:         latencyMs,
        success,
        error_message:      errorMessage,
      });
    } catch (logErr) {
      // A log failure must never mask the actual generation result.
      console.error('[intelligence-engine] Failed to write generation log:', logErr);
    }
  }
}

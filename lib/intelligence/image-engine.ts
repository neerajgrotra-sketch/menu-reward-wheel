import { createClient as createServiceSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { resolveFeature } from './feature-resolver';
import { buildContext } from './context-builder';
import { renderPrompt } from './prompt-engine';
import { GoogleImagenProvider } from './providers/google-imagen-provider';
import type { ImageIntelligenceProvider } from './providers/image-provider.interface';
import { enhanceImagePrompt } from './image-prompt-enhancer';

export type ImageJobParams = {
  jobId: string;
  restaurantId: string;
  menuItemId: string;
  userId: string;
  restaurantName: string;
  itemName: string;
  itemDescription: string;
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

function getImageProvider(): ImageIntelligenceProvider {
  return new GoogleImagenProvider();
}

function dataUriToBuffer(dataUri: string): { buffer: Buffer; mimeType: string } {
  const [meta, base64] = dataUri.split(',');
  const mimeType = meta.replace('data:', '').replace(';base64', '');
  return { buffer: Buffer.from(base64, 'base64'), mimeType };
}

function mimeTypeToExt(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

export async function processImageJob(params: ImageJobParams): Promise<void> {
  const { jobId, restaurantId, menuItemId, userId, restaurantName, itemName, itemDescription } =
    params;

  const serviceClient = makeServiceClient();

  let success = false;
  let errorMessage: string | null = null;
  let finalPrompt = '';
  let resolvedProvider = 'google';
  let resolvedModel = 'imagen-3';
  let estimatedCostUsd = 0;
  let latencyMs = 0;
  const startTime = Date.now();

  try {
    // 1. Mark job as generating.
    await serviceClient
      .from('image_generation_jobs')
      .update({ status: 'generating' })
      .eq('id', jobId);

    // 2. Resolve the image generation feature + template.
    const resolved = await resolveFeature('restaurant_food_image_generation', serviceClient);
    resolvedProvider = resolved.template.provider;
    resolvedModel = resolved.template.model;

    // 3. Build context (merges restaurant intelligence profile + raw input).
    const context = await buildContext(
      'restaurant_food_image_generation',
      restaurantId,
      { item_name: itemName, item_description: itemDescription, restaurant_name: restaurantName },
      serviceClient,
    );

    // 4. Enhance the prompt via Claude Haiku before image generation.
    // Failure is non-fatal: enhancer falls back to raw item_description.
    const { enhancedDescription, usedFallback } = await enhanceImagePrompt(
      { item_name: itemName, item_description: itemDescription, restaurant_name: restaurantName },
      restaurantId,
      userId,
      serviceClient,
    );
    context.enhanced_description = enhancedDescription;
    if (usedFallback) {
      console.warn(`[image-engine] job=${jobId}: prompt enhancement fell back to raw description`);
    }

    // 5. Render the final image prompt.
    finalPrompt = renderPrompt(resolved.template.user_prompt_template, context);

    // 6. Look up cost per generation for this provider + model.
    const { data: costRow } = await serviceClient
      .from('intelligence_provider_costs')
      .select('cost_per_generation')
      .eq('provider', resolvedProvider)
      .eq('model', resolvedModel)
      .maybeSingle();

    const costPerImage = Number(costRow?.cost_per_generation ?? 0.02);

    // 7. Generate 4 image variants.
    const imageProvider = getImageProvider();
    const providerResult = await imageProvider.generateImages({
      prompt: finalPrompt,
      count: 4,
    });
    estimatedCostUsd = providerResult.estimatedCostUsd;

    // 8. Determine next generation_version for this item.
    const { data: versionRow } = await serviceClient
      .from('ai_generated_assets')
      .select('generation_version')
      .eq('menu_item_id', menuItemId)
      .eq('restaurant_id', restaurantId)
      .order('generation_version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const generationVersion = (versionRow?.generation_version ?? 0) + 1;

    // 9. Upload each variant to storage and insert asset rows — all in parallel.
    const uploadPromises = providerResult.images.map(async (img) => {
      const ext = mimeTypeToExt(img.mimeType);
      const storagePath = `ai/${restaurantId}/${menuItemId}/${jobId}/variant_${img.index}.${ext}`;

      let uploadBuffer: Buffer;
      let contentType = img.mimeType;

      if (img.providerUrl.startsWith('data:')) {
        // Imagen 3 returns base64-encoded data URIs.
        const decoded = dataUriToBuffer(img.providerUrl);
        uploadBuffer = decoded.buffer;
        contentType = decoded.mimeType;
      } else {
        // Replicate and other providers return real URLs — fetch the bytes.
        const fetchResponse = await fetch(img.providerUrl, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!fetchResponse.ok) {
          throw new Error(
            `Failed to fetch variant ${img.index} from provider: ${fetchResponse.status}`,
          );
        }
        uploadBuffer = Buffer.from(await fetchResponse.arrayBuffer());
      }

      const { error: uploadError } = await serviceClient.storage
        .from('menu-item-images')
        .upload(storagePath, uploadBuffer, { contentType, upsert: true });

      if (uploadError) {
        throw new Error(`Storage upload failed for variant ${img.index}: ${uploadError.message}`);
      }

      const {
        data: { publicUrl },
      } = serviceClient.storage.from('menu-item-images').getPublicUrl(storagePath);

      const { error: assetError } = await serviceClient.from('ai_generated_assets').insert({
        restaurant_id: restaurantId,
        menu_item_id: menuItemId,
        job_id: jobId,
        asset_type: 'menu_item_photo',
        provider: resolvedProvider,
        model: resolvedModel,
        prompt_used: finalPrompt,
        enhanced_prompt: context.enhanced_description,
        generation_version: generationVersion,
        variant_index: img.index,
        storage_path: storagePath,
        storage_url: publicUrl,
        selected: false,
        estimated_cost_usd: costPerImage,
      });

      if (assetError) {
        throw new Error(`Asset insert failed for variant ${img.index}: ${assetError.message}`);
      }
    });

    await Promise.all(uploadPromises);
    latencyMs = Date.now() - startTime;
    success = true;

    // 10. Mark job complete.
    // Quota was already pre-incremented atomically in the route handler via
    // reserve_image_generation_credit(). No increment needed here.
    await serviceClient
      .from('image_generation_jobs')
      .update({ status: 'complete', completed_at: new Date().toISOString() })
      .eq('id', jobId);
  } catch (err: unknown) {
    latencyMs = Date.now() - startTime;
    errorMessage = err instanceof Error ? err.message : 'Unknown error in image generation';

    try {
      await serviceClient
        .from('image_generation_jobs')
        .update({ status: 'failed', error_message: errorMessage })
        .eq('id', jobId);
    } catch {
      // Must not mask the original error.
    }

    // Refund the credit that was pre-reserved in the route handler.
    // The SQL function floors at 0, so this is safe to call unconditionally.
    try {
      await serviceClient.rpc('refund_image_generation_credit', { p_restaurant_id: restaurantId });
    } catch {
      console.error(`[image-engine] job=${jobId}: failed to refund quota credit`);
    }
  } finally {
    // Always log — success and failure both produce a row.
    try {
      await serviceClient.from('intelligence_generation_logs').insert({
        restaurant_id: restaurantId,
        user_id: userId,
        feature_key: 'restaurant_food_image_generation',
        prompt_template_id: null,
        experiment_id: null,
        experiment_variant: null,
        provider: resolvedProvider,
        model: resolvedModel,
        input_tokens: null,
        output_tokens: null,
        estimated_cost_usd: estimatedCostUsd,
        latency_ms: latencyMs,
        success,
        error_message: errorMessage,
      });
    } catch (logErr) {
      console.error('[image-engine] Failed to write generation log:', logErr);
    }
  }
}

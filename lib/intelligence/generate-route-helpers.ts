// Shared metering + error-mapping logic for every route that calls
// lib/intelligence/intelligence-engine.ts's generate(). Extracted from
// app/api/admin/intelligence/generate/route.ts (where it originally lived
// inline) so a second caller — app/api/admin/assistant/messages/route.ts —
// can't accidentally bypass usage limits and cost metering by calling
// generate() directly. Behavior is unchanged from the original inline code.

import { createClient as createServiceSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { UnresolvedVariableError } from '@/lib/intelligence/prompt-engine';
import { FeatureDisabledError, TemplateMissingError } from '@/lib/intelligence/feature-resolver';
import { MissingContextError } from '@/lib/intelligence/context-builder';
import { ValidationError } from '@/lib/intelligence/validators';

export function clientSafeError(err: unknown): { message: string; status: number } {
  if (err instanceof FeatureDisabledError) {
    return { message: 'This feature is currently unavailable.', status: 503 };
  }
  if (err instanceof MissingContextError) {
    return { message: 'Insufficient context to generate a description.', status: 400 };
  }
  if (err instanceof UnresolvedVariableError || err instanceof TemplateMissingError) {
    return { message: 'Template configuration error. Please contact support.', status: 500 };
  }
  if (err instanceof ValidationError) {
    return { message: 'Generation produced no usable output. Please try again.', status: 500 };
  }
  return { message: 'Description generation temporarily unavailable.', status: 500 };
}

export function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured.');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  return createServiceSupabaseClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type ServiceClient = ReturnType<typeof makeServiceClient>;

type Limits = {
  id: string;
  monthly_limit: number;
  requests_per_minute: number;
  current_month_usage: number;
  usage_reset_at: string;
};

export type RateLimitCheck =
  | { ok: true; limits: Limits | null }
  | { ok: false; error: string; status: number };

// Auto-provisions a limits row with defaults on the restaurant's first
// request, resets the monthly counter on calendar rollover, then enforces
// both the monthly cap and the per-minute cap. Returns the limits row (for
// incrementUsage to bump afterward) or a plain error/status pair — deliberately
// NOT a ready-made NextResponse, since a caller that already persisted state
// before this check (e.g. app/api/admin/assistant/messages/route.ts saving
// the user's chat message) needs to fold extra fields like conversationId
// into its own response rather than return this error verbatim and silently
// drop that state from the client's view.
export async function checkRateLimit(serviceClient: ServiceClient, restaurantId: string): Promise<RateLimitCheck> {
  await serviceClient
    .from('intelligence_usage_limits')
    .upsert({ restaurant_id: restaurantId }, { onConflict: 'restaurant_id', ignoreDuplicates: true });

  const { data: limits } = await serviceClient
    .from('intelligence_usage_limits')
    .select('id, monthly_limit, requests_per_minute, current_month_usage, usage_reset_at')
    .eq('restaurant_id', restaurantId)
    .single();

  if (!limits) return { ok: true, limits: null };

  if (new Date(limits.usage_reset_at) <= new Date()) {
    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1, 1);
    nextReset.setHours(0, 0, 0, 0);
    await serviceClient
      .from('intelligence_usage_limits')
      .update({ current_month_usage: 0, usage_reset_at: nextReset.toISOString() })
      .eq('id', limits.id);
    limits.current_month_usage = 0;
  }

  if (limits.current_month_usage >= limits.monthly_limit) {
    return {
      ok: false,
      error: 'Monthly generation limit reached. Contact support to increase your limit.',
      status: 429,
    };
  }

  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount } = await serviceClient
    .from('intelligence_generation_logs')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .gte('created_at', oneMinuteAgo);

  if ((recentCount ?? 0) >= limits.requests_per_minute) {
    return {
      ok: false,
      error: 'Rate limit exceeded. Please wait a moment before generating again.',
      status: 429,
    };
  }

  return { ok: true, limits };
}

export async function incrementUsage(serviceClient: ServiceClient, restaurantId: string, limits: Limits | null) {
  if (!limits) return;
  await serviceClient
    .from('intelligence_usage_limits')
    .update({ current_month_usage: limits.current_month_usage + 1 })
    .eq('restaurant_id', restaurantId);
}

import { NextResponse } from 'next/server';
import { createClient as createServiceSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import { generate } from '@/lib/intelligence/intelligence-engine';
import { UnresolvedVariableError } from '@/lib/intelligence/prompt-engine';
import { FeatureDisabledError, TemplateMissingError } from '@/lib/intelligence/feature-resolver';
import { MissingContextError } from '@/lib/intelligence/context-builder';
import { ValidationError } from '@/lib/intelligence/validators';

function clientSafeError(err: unknown): { message: string; status: number } {
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

export async function POST(request: Request) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const authClient = createServerAuthClient();
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const userId = userData.user.id;

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let featureKey: string;
  let restaurantId: string;
  let context: Record<string, string>;
  try {
    const body = await request.json();
    featureKey   = (body.featureKey   ?? '').trim();
    restaurantId = (body.restaurantId ?? '').trim();
    context =
      typeof body.context === 'object' && body.context !== null
        ? body.context
        : {};
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!featureKey)   return NextResponse.json({ error: 'featureKey is required.'   }, { status: 400 });
  if (!restaurantId) return NextResponse.json({ error: 'restaurantId is required.' }, { status: 400 });

  // ── 3. Verify restaurant ownership ────────────────────────────────────────
  const { data: restaurant } = await authClient
    .from('restaurants')
    .select('id')
    .eq('id', restaurantId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json(
      { error: 'Restaurant not found or access denied.' },
      { status: 403 }
    );
  }

  // ── 4. Rate limiting ───────────────────────────────────────────────────────
  const serviceClient = makeServiceClient();

  // Auto-provision a limits row with defaults on the restaurant's first request.
  await serviceClient
    .from('intelligence_usage_limits')
    .upsert({ restaurant_id: restaurantId }, { onConflict: 'restaurant_id', ignoreDuplicates: true });

  const { data: limits } = await serviceClient
    .from('intelligence_usage_limits')
    .select('id, monthly_limit, requests_per_minute, current_month_usage, usage_reset_at')
    .eq('restaurant_id', restaurantId)
    .single();

  if (limits) {
    // Reset monthly counter if the calendar month has rolled over.
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
      return NextResponse.json(
        { error: 'Monthly generation limit reached. Contact support to increase your limit.' },
        { status: 429 }
      );
    }

    // Per-minute rate limit: count successful requests in the last 60 seconds.
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount } = await serviceClient
      .from('intelligence_generation_logs')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .gte('created_at', oneMinuteAgo);

    if ((recentCount ?? 0) >= limits.requests_per_minute) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a moment before generating again.' },
        { status: 429 }
      );
    }
  }

  // ── 5. Generate ────────────────────────────────────────────────────────────
  try {
    const result = await generate({ featureKey, restaurantId, userId, rawInput: context });

    // Increment monthly usage counter on success.
    if (limits) {
      await serviceClient
        .from('intelligence_usage_limits')
        .update({ current_month_usage: limits.current_month_usage + 1 })
        .eq('restaurant_id', restaurantId);
    }

    return NextResponse.json({ output: result.output });
  } catch (err: unknown) {
    console.error('[intelligence/generate] Error:', err);
    const { message, status } = clientSafeError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

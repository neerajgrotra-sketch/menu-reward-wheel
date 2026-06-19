import { NextResponse } from 'next/server';
import { createClient as createServiceSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
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

// GET /api/admin/generate-food-image/resume?menuItemId=X&restaurantId=Y
//
// Fix C: Job recovery for sheet-close and browser-refresh scenarios.
//
// When a restaurant reopens the item editor (or returns after a refresh), the
// client calls this endpoint to check whether a background generation job is
// still running or recently completed. If found, the client resumes polling or
// restores the variant grid without forcing a new generation (and wasting a credit).
//
// Scope: looks back 24 hours. Jobs older than that are considered stale and not
// recovered (the restaurant should regenerate at their own discretion).

export async function GET(request: Request) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const authClient = createServerAuthClient();
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const userId = userData.user.id;

  // ── 2. Parse query params ─────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const menuItemId   = (searchParams.get('menuItemId')   ?? '').trim();
  const restaurantId = (searchParams.get('restaurantId') ?? '').trim();

  if (!menuItemId || !restaurantId) {
    return NextResponse.json({ status: 'none' });
  }

  // ── 3. Ownership check: caller must own the restaurant ────────────────────
  const { data: restaurant } = await authClient
    .from('restaurants')
    .select('id')
    .eq('id', restaurantId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  }

  void userId; // used for auth only

  const serviceClient = makeServiceClient();

  // ── 4. Find the most recent resumable job (last 24 h) ────────────────────
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: job } = await serviceClient
    .from('image_generation_jobs')
    .select('id, status')
    .eq('restaurant_id', restaurantId)
    .eq('menu_item_id', menuItemId)
    .in('status', ['pending', 'generating', 'complete'])
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ status: 'none' });
  }

  // ── 5. In-progress job — return jobId for client to resume polling ────────
  if (job.status !== 'complete') {
    return NextResponse.json({ status: 'generating', jobId: job.id });
  }

  // ── 6. Complete job — return variants so client can restore the grid ───────
  const { data: assets } = await serviceClient
    .from('ai_generated_assets')
    .select('id, storage_url, variant_index')
    .eq('job_id', job.id)
    .order('variant_index', { ascending: true });

  const variants = (assets ?? []).map((a) => ({
    assetId: a.id,
    url: a.storage_url,
    variantIndex: a.variant_index,
  }));

  if (variants.length === 0) {
    return NextResponse.json({ status: 'none' });
  }

  return NextResponse.json({ status: 'complete', jobId: job.id, variants });
}

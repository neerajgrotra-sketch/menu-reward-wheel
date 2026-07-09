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

export async function GET(
  _request: Request,
  { params }: { params: { jobId: string } },
) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const authClient = createServerAuthClient();
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const userId = userData.user.id;

  const { jobId } = params;
  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required.' }, { status: 400 });
  }

  const serviceClient = makeServiceClient();

  // ── 2. Fetch job — verify ownership via restaurant_id ─────────────────────
  const { data: job, error: jobError } = await serviceClient
    .from('image_generation_jobs')
    .select('id, status, error_message, restaurant_id')
    .eq('id', jobId)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  // Verify caller owns the restaurant this job belongs to.
  const { data: restaurant } = await authClient
    .from('restaurants')
    .select('id')
    .eq('id', job.restaurant_id)
    .eq('owner_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  }

  // ── 3. For non-complete jobs return status only ────────────────────────────
  if (job.status !== 'complete') {
    return NextResponse.json({
      status: job.status,
      variants: null,
      errorMessage: job.status === 'failed' ? job.error_message : null,
    });
  }

  // ── 4. For complete jobs, fetch variants ──────────────────────────────────
  const { data: assets, error: assetsError } = await serviceClient
    .from('ai_generated_assets')
    .select('id, storage_url, variant_index')
    .eq('job_id', jobId)
    .order('variant_index', { ascending: true });

  if (assetsError) {
    return NextResponse.json({ error: 'Failed to fetch variants.' }, { status: 500 });
  }

  const variants = (assets ?? []).map((a) => ({
    assetId: a.id,
    url: a.storage_url,
    variantIndex: a.variant_index,
  }));

  return NextResponse.json({ status: 'complete', variants, errorMessage: null });
}

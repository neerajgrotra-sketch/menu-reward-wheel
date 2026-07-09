import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createClient as createServiceSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import { processImageJob } from '@/lib/intelligence/image-engine';

export const maxDuration = 60;

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

  // ── 2. Parse + validate body ───────────────────────────────────────────────
  let restaurantId: string;
  let menuItemId: string;
  let itemName: string;
  let itemDescription: string;

  try {
    const body = await request.json();
    restaurantId = (body.restaurantId ?? '').trim();
    menuItemId = (body.menuItemId ?? '').trim();
    itemName = String(body.itemName ?? '').slice(0, 100).trim();
    itemDescription = String(body.itemDescription ?? '').slice(0, 500).trim();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!restaurantId) return NextResponse.json({ error: 'restaurantId is required.' }, { status: 400 });
  if (!menuItemId)   return NextResponse.json({ error: 'menuItemId is required.' }, { status: 400 });
  if (!itemName)     return NextResponse.json({ error: 'itemName is required.' }, { status: 400 });

  const serviceClient = makeServiceClient();

  // ── 3. Ownership check: restaurant ────────────────────────────────────────
  const { data: restaurant } = await authClient
    .from('restaurants')
    .select('id, name')
    .eq('id', restaurantId)
    .eq('owner_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurant not found or access denied.' }, { status: 403 });
  }

  // ── 4. Ownership check: menu item belongs to this restaurant ──────────────
  const { data: menuItem } = await serviceClient
    .from('menu_items')
    .select('id')
    .eq('id', menuItemId)
    .eq('restaurant_id', restaurantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!menuItem) {
    return NextResponse.json({ error: 'Menu item not found or access denied.' }, { status: 403 });
  }

  // ── 5. Prevent duplicate concurrent jobs for the same menu item (Fix B) ─────
  // Belt: explicit pre-check returns a clean 409 before INSERT.
  // Suspenders: partial unique index on image_generation_jobs enforces this
  // at DB level even if two requests race past this check simultaneously.
  const { data: activeJob } = await serviceClient
    .from('image_generation_jobs')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('menu_item_id', menuItemId)
    .in('status', ['pending', 'generating'])
    .maybeSingle();

  if (activeJob) {
    return NextResponse.json(
      { error: 'Image generation already in progress for this menu item.' },
      { status: 409 },
    );
  }

  // ── 6. Atomic quota reservation (Fix A) ───────────────────────────────────
  // reserve_image_generation_credit() auto-provisions the limits row, resets
  // the counter if the month rolled over, and atomically increments usage in a
  // single UPDATE WHERE usage < limit. Returns false when the limit is reached.
  // Credit is pre-reserved here; the background worker calls
  // refund_image_generation_credit() if generation fails, so failed jobs
  // never permanently consume quota.
  const { data: creditReserved, error: creditError } = await serviceClient
    .rpc('reserve_image_generation_credit', { p_restaurant_id: restaurantId });

  if (creditError) {
    console.error('[generate-food-image] Quota reservation error:', creditError);
    return NextResponse.json({ error: 'Failed to reserve generation credit.' }, { status: 500 });
  }

  if (!creditReserved) {
    return NextResponse.json(
      { error: 'Monthly image generation limit reached. Contact support to increase your limit.' },
      { status: 429 },
    );
  }

  // ── 7. Create job record ───────────────────────────────────────────────────
  const { data: job, error: jobError } = await serviceClient
    .from('image_generation_jobs')
    .insert({
      restaurant_id: restaurantId,
      menu_item_id: menuItemId,
      user_id: userId,
      status: 'pending',
    })
    .select('id')
    .single();

  if (jobError || !job) {
    // If INSERT failed (e.g. unique index race), refund the pre-reserved credit.
    await serviceClient.rpc('refund_image_generation_credit', { p_restaurant_id: restaurantId });
    console.error('[generate-food-image] Failed to create job:', jobError);
    return NextResponse.json({ error: 'Failed to start generation job.' }, { status: 500 });
  }

  // ── 8. Trigger background processing ──────────────────────────────────────
  // waitUntil keeps the Vercel Lambda alive after the 202 response is sent.
  waitUntil(
    processImageJob({
      jobId: job.id,
      restaurantId,
      menuItemId,
      userId,
      restaurantName: restaurant.name ?? '',
      itemName,
      itemDescription,
    }),
  );

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}

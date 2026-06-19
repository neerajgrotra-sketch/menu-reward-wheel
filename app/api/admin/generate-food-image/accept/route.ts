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

export async function POST(request: Request) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const authClient = createServerAuthClient();
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const userId = userData.user.id;

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let restaurantId: string;
  let menuItemId: string;
  let assetId: string;

  try {
    const body = await request.json();
    restaurantId = (body.restaurantId ?? '').trim();
    menuItemId = (body.menuItemId ?? '').trim();
    assetId = (body.assetId ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!restaurantId) return NextResponse.json({ error: 'restaurantId is required.' }, { status: 400 });
  if (!menuItemId)   return NextResponse.json({ error: 'menuItemId is required.' }, { status: 400 });
  if (!assetId)      return NextResponse.json({ error: 'assetId is required.' }, { status: 400 });

  // ── 3. Ownership check: caller owns the restaurant ────────────────────────
  const { data: restaurant } = await authClient
    .from('restaurants')
    .select('id')
    .eq('id', restaurantId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurant not found or access denied.' }, { status: 403 });
  }

  const serviceClient = makeServiceClient();

  // ── 4. Fetch asset — ownership enforced via restaurant_id column ──────────
  // This is the canonical security check: asset.restaurant_id must match the
  // verified restaurantId. No URL string parsing required.
  const { data: asset, error: assetError } = await serviceClient
    .from('ai_generated_assets')
    .select('id, storage_url, menu_item_id, job_id')
    .eq('id', assetId)
    .eq('restaurant_id', restaurantId)
    .eq('menu_item_id', menuItemId)
    .maybeSingle();

  if (assetError || !asset) {
    return NextResponse.json({ error: 'Asset not found or access denied.' }, { status: 403 });
  }

  // ── 5. Update menu_items.image_url ────────────────────────────────────────
  const { error: itemUpdateError } = await serviceClient
    .from('menu_items')
    .update({ image_url: asset.storage_url })
    .eq('id', menuItemId)
    .eq('restaurant_id', restaurantId);

  if (itemUpdateError) {
    console.error('[accept] Failed to update menu item image_url:', itemUpdateError);
    return NextResponse.json({ error: 'Failed to apply image to menu item.' }, { status: 500 });
  }

  // ── 6. Mark chosen asset as selected ─────────────────────────────────────
  await serviceClient
    .from('ai_generated_assets')
    .update({ selected: true, selected_at: new Date().toISOString() })
    .eq('id', assetId);

  // ── 7. De-select sibling variants from the same job ───────────────────────
  if (asset.job_id) {
    await serviceClient
      .from('ai_generated_assets')
      .update({ selected: false, selected_at: null })
      .eq('job_id', asset.job_id)
      .neq('id', assetId);
  }

  void userId; // referenced for auth, not stored on accept

  return NextResponse.json({ imageUrl: asset.storage_url });
}

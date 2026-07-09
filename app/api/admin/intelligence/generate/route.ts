import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { generate } from '@/lib/intelligence/intelligence-engine';
import { checkRateLimit, incrementUsage, makeServiceClient, clientSafeError } from '@/lib/intelligence/generate-route-helpers';

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
    .is('deleted_at', null)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json(
      { error: 'Restaurant not found or access denied.' },
      { status: 403 }
    );
  }

  // ── 4. Rate limiting ───────────────────────────────────────────────────────
  const serviceClient = makeServiceClient();

  const rateLimitCheck = await checkRateLimit(serviceClient, restaurantId);
  if (!rateLimitCheck.ok) return NextResponse.json({ error: rateLimitCheck.error }, { status: rateLimitCheck.status });
  const { limits } = rateLimitCheck;

  // ── 5. Generate ────────────────────────────────────────────────────────────
  try {
    const result = await generate({ featureKey, restaurantId, userId, rawInput: context });

    await incrementUsage(serviceClient, restaurantId, limits);

    return NextResponse.json({ output: result.output });
  } catch (err: unknown) {
    console.error('[intelligence/generate] Error:', err);
    const { message, status } = clientSafeError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

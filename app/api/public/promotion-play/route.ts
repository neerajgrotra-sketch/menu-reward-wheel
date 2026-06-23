import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { resolvePromotionGame } from '@/lib/game-pool/resolvePromotionGame';
import { resolveSessionPlayState } from '@/lib/session-play-state';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Supabase service client is not configured.');
  }

  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function rewardLabel(reward: any, menuItemName?: string) {
  const baseName = reward.custom_name || menuItemName || 'Reward';
  if (reward.reward_type === 'free') return `FREE ${baseName}`;
  if (reward.reward_type === 'discount') return `${reward.reward_value || 0}% ${baseName}`;
  return baseName;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const restaurantSlug = searchParams.get('restaurantSlug');
    const promotionSlug = searchParams.get('promotionSlug');

    let sessionToken = searchParams.get('sessionToken');
    const visitSessionId = searchParams.get('vsid') || null;

    if (!sessionToken) {
      sessionToken = crypto.randomUUID();
    }

    if (!restaurantSlug || !promotionSlug) {
      return NextResponse.json({ error: 'Missing restaurantSlug or promotionSlug.' }, { status: 400 });
    }

    const supabase = makeServiceClient();

    const restaurantResult = await supabase
      .from('restaurants')
      .select('id,name,slug,address_line1,city,logo_url,experience_mode')
      .eq('slug', restaurantSlug)
      .single();

    if (restaurantResult.error || !restaurantResult.data) {
      return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 });
    }

    const restaurant = restaurantResult.data;

    const promotionResult = await supabase
      .from('promotions')
      .select('id,name,slug,game_type,status,coupon_expiry_minutes,starts_at,ends_at,max_spins')
      .eq('restaurant_id', restaurant.id)
      .eq('slug', promotionSlug)
      .single();

    if (promotionResult.error || !promotionResult.data) {
      return NextResponse.json({ error: 'Promotion not found.' }, { status: 404 });
    }

    const promotion = promotionResult.data;

    // Resolve game type from promotion_game_assignments (single source of truth).
    // Both the primary game (is_primary=true) and additional games live there.
    // Returns the play_sessions.id so downstream routes can store a proper FK.
    const { gameType: selectedGameType, isNewSession, playSessionId } = await resolvePromotionGame({
      promotionId: promotion.id,
      sessionToken,
      ipAddress:
        request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    // -------------------------------------------------------------------------
    // Resolve the definitive play session ID for this request.
    // For a new session this is the freshly-inserted row's ID.
    // For an existing session it comes from resolvePromotionGame; a fallback
    // lookup handles the rare case where a transient DB issue prevented
    // the race-condition read-back from returning it.
    // -------------------------------------------------------------------------
    let resolvedPlaySessionId = playSessionId;

    if (!isNewSession && !resolvedPlaySessionId) {
      const { data: fallbackSession } = await supabase
        .from('play_sessions')
        .select('id')
        .eq('session_token', sessionToken)
        .eq('promotion_id', promotion.id)
        .maybeSingle();
      resolvedPlaySessionId = fallbackSession?.id ?? '';
      console.warn('[promotion-play] used fallback session lookup', {
        sessionToken,
        resolvedPlaySessionId,
      });
    }

    // -------------------------------------------------------------------------
    // Session recovery: determine how many plays have actually been used.
    // Source of truth is coupon issuance, not session creation.
    // -------------------------------------------------------------------------
    let resumedPlaysUsed = 0;
    let resumedExistingCoupons: SessionCoupon[] = [];

    if (!isNewSession) {
      const existingCoupons = resolvedPlaySessionId
        ? await findSessionCoupons(supabase, resolvedPlaySessionId, promotion.coupon_expiry_minutes)
        : [];

      const maxSpins = Math.max(1, promotion.max_spins ?? 1);
      const playState = resolveSessionPlayState(existingCoupons, maxSpins);

      if (playState.alreadyPlayed) {
        // All plays consumed — customer cannot play again.
        return NextResponse.json({
          restaurant,
          promotion: { ...promotion, game_type: selectedGameType },
          sessionToken,
          playSessionId: resolvedPlaySessionId,
          alreadyPlayed: true,
          playsUsed: playState.playsUsed,
          playsRemaining: 0,
          existingCoupons,
        });
      }

      // Session exists but plays remain (unplayed or partial) — resume.
      resumedPlaysUsed = playState.playsUsed;
      resumedExistingCoupons = existingCoupons;
    }

    // -------------------------------------------------------------------------
    // Shared path: new sessions + resumed (unplayed / partial) sessions.
    // Validate promotion state then return game config and rewards.
    // -------------------------------------------------------------------------
    if (promotion.status !== 'active') {
      return NextResponse.json({ error: 'This promotion is not live yet.', restaurant, promotion }, { status: 409 });
    }

    const now = new Date();

    if (promotion.starts_at && now < new Date(promotion.starts_at)) {
      return NextResponse.json({ error: 'This promotion has not started yet.', restaurant, promotion }, { status: 409 });
    }

    if (promotion.ends_at && now > new Date(promotion.ends_at)) {
      return NextResponse.json({ error: 'This promotion has ended.', restaurant, promotion }, { status: 409 });
    }

    const rewardsResult = await supabase
      .from('promotion_rewards')
      .select('id,menu_item_id,custom_name,reward_type,reward_value,weight')
      .eq('promotion_id', promotion.id)
      .order('created_at', { ascending: true });

    if (rewardsResult.error) {
      return NextResponse.json({ error: `Reward lookup failed: ${rewardsResult.error.message}`, restaurant, promotion }, { status: 500 });
    }

    const rawRewards = rewardsResult.data || [];
    const menuItemIds = rawRewards.map((item: any) => item.menu_item_id).filter(Boolean);

    let menuNamesById: Record<string, string> = {};

    if (menuItemIds.length > 0) {
      const menuItemsResult = await supabase
        .from('menu_items')
        .select('id,name')
        .in('id', menuItemIds);

      if (menuItemsResult.error) {
        return NextResponse.json({ error: `Menu item lookup failed: ${menuItemsResult.error.message}`, restaurant, promotion }, { status: 500 });
      }

      menuNamesById = Object.fromEntries(
        (menuItemsResult.data || []).map((item: any) => [item.id, item.name]),
      );
    }

    const rewards = rawRewards.map((item: any) => {
      const label = rewardLabel(
        item,
        item.menu_item_id ? menuNamesById[item.menu_item_id] : undefined,
      );

      return {
        id: item.id,
        label,
        description: label,
        terms:
          'Show this code to staff before ordering. One reward per customer/session. Standard restaurant terms apply.',
        weight: item.weight || 30,
        active: true,
      };
    });

    const maxSpins = Math.max(1, promotion.max_spins ?? 1);

    // Task 14: Session promotion attribution — best effort, never blocks response
    if (visitSessionId && isNewSession) {
      Promise.all([
        supabase.rpc('increment_session_counters', {
          p_session_id: visitSessionId,
          p_promotion_delta: 1,
        }),
        supabase
          .from('visit_sessions')
          .update({
            last_promotion_played: promotion.id,
            last_activity_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', visitSessionId)
          .eq('status', 'active'),
        supabase.rpc('append_session_interaction', {
          p_session_id: visitSessionId,
          p_event: {
            event: 'promotion_played',
            promotion_id: promotion.id,
            ts: new Date().toISOString(),
          },
        }),
      ]).catch((err: unknown) => {
        console.error('[spinbite:promotion-play] session attribution failed', err);
      });
    }

    return NextResponse.json({
      restaurant,
      sessionToken,
      playSessionId: resolvedPlaySessionId,
      promotion: {
        ...promotion,
        game_type: selectedGameType,
      },
      rewards,
      alreadyPlayed: false,
      playsUsed: resumedPlaysUsed,
      playsRemaining: maxSpins - resumedPlaysUsed,
      existingCoupons: resumedExistingCoupons,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || 'Could not load promotion.',
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SessionCoupon = {
  id: string;
  code: string;
  status: string;
  issuedAt: string;
  expiresAt: string;
  rewardLabel: string;
};

async function findSessionCoupons(
  supabase: ReturnType<typeof makeServiceClient>,
  playSessionId: string,
  couponExpiryMinutes: number | null | undefined,
): Promise<SessionCoupon[]> {
  console.log('[session-recovery] findSessionCoupons called', { playSessionId, couponExpiryMinutes });

  const couponResult = await supabase
    .from('coupon_redemptions')
    .select('id, coupon_code, status, issued_at, promotion_reward_id')
    .eq('play_session_id', playSessionId)
    .order('issued_at', { ascending: true });

  console.log('[session-recovery] coupon query result', {
    playSessionId,
    count: couponResult.data?.length ?? 0,
    ids: couponResult.data?.map((c: any) => c.id) ?? [],
    error: couponResult.error?.message ?? null,
  });

  if (couponResult.error) {
    console.error('[session-recovery] coupon lookup error', couponResult.error.message, { playSessionId });
    return [];
  }

  if (!couponResult.data?.length) {
    console.warn('[session-recovery] no coupons found for play_session_id', playSessionId);
    return [];
  }

  const expiryMinutes = couponExpiryMinutes || 20;

  // Fetch all referenced rewards in one query.
  const rewardIds = Array.from(new Set(couponResult.data.map((c: any) => c.promotion_reward_id).filter(Boolean)));
  let rewardsById: Record<string, any> = {};

  if (rewardIds.length > 0) {
    const rewardsResult = await supabase
      .from('promotion_rewards')
      .select('id, custom_name, reward_type, reward_value, menu_item_id')
      .in('id', rewardIds);

    if (!rewardsResult.error && rewardsResult.data) {
      const menuItemIds = Array.from(new Set(rewardsResult.data.map((r: any) => r.menu_item_id).filter(Boolean)));
      let menuNamesById: Record<string, string> = {};

      if (menuItemIds.length > 0) {
        const menuResult = await supabase
          .from('menu_items')
          .select('id, name')
          .in('id', menuItemIds);

        if (!menuResult.error && menuResult.data) {
          menuNamesById = Object.fromEntries(menuResult.data.map((m: any) => [m.id, m.name]));
        }
      }

      rewardsById = Object.fromEntries(
        rewardsResult.data.map((r: any) => [
          r.id,
          { ...r, menuItemName: r.menu_item_id ? menuNamesById[r.menu_item_id] : undefined },
        ]),
      );
    }
  }

  return couponResult.data.map((coupon: any) => {
    const issuedAt = coupon.issued_at as string;
    const expiresAt = new Date(new Date(issuedAt).getTime() + expiryMinutes * 60 * 1000).toISOString();
    const reward = rewardsById[coupon.promotion_reward_id];
    const label = reward ? rewardLabel(reward, reward.menuItemName) : 'Reward';

    return {
      id: coupon.id as string,
      code: coupon.coupon_code as string,
      status: coupon.status as string,
      issuedAt,
      expiresAt,
      rewardLabel: label,
    };
  });
}

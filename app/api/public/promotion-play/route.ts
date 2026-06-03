import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { resolvePromotionGame } from '@/lib/game-pool/resolvePromotionGame';
import type { GameType } from '@/lib/game-pool/types';

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

    if (!sessionToken) {
      sessionToken = crypto.randomUUID();
    }

    if (!restaurantSlug || !promotionSlug) {
      return NextResponse.json({ error: 'Missing restaurantSlug or promotionSlug.' }, { status: 400 });
    }

    const supabase = makeServiceClient();

    const restaurantResult = await supabase
      .from('restaurants')
      .select('id,name,slug,address_line1,city')
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

    // Resolve game type (idempotent — handles duplicate session gracefully).
    // Returns the play_sessions.id so downstream routes can store a proper FK.
    const { gameType: selectedGameType, isNewSession, playSessionId } = await resolvePromotionGame({
      promotionId: promotion.id,
      sessionToken,
      fallbackGameType: (promotion.game_type || 'wheel') as GameType,
      ipAddress:
        request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    // -------------------------------------------------------------------------
    // Session recovery path: session already existed before this request.
    // Find all coupons issued during this session so the customer can see what
    // they won. One session may have multiple coupons (max_spins > 1).
    // -------------------------------------------------------------------------
    if (!isNewSession) {
      const existingCoupons = await findSessionCoupons(
        supabase,
        playSessionId,
        promotion.coupon_expiry_minutes,
      );

      return NextResponse.json({
        restaurant,
        promotion: { ...promotion, game_type: selectedGameType },
        sessionToken,
        playSessionId,
        alreadyPlayed: true,
        existingCoupons,
      });
    }

    // -------------------------------------------------------------------------
    // New session: enforce promotion rules then return game config + rewards.
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

    return NextResponse.json({
      restaurant,
      sessionToken,
      playSessionId,
      promotion: {
        ...promotion,
        game_type: selectedGameType,
      },
      rewards,
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
  const couponResult = await supabase
    .from('coupon_redemptions')
    .select('id, coupon_code, status, issued_at, promotion_reward_id')
    .eq('play_session_id', playSessionId)
    .order('issued_at', { ascending: true });

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

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url) throw new Error('Supabase URL is missing.');
  if (!serviceKey) throw new Error('Promotion performance reporting is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel.');

  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function computeExpiresAt(issuedAt: string | null, minutes: number | null | undefined) {
  if (!issuedAt) return null;
  const expiryMinutes = minutes || 20;
  return new Date(new Date(issuedAt).getTime() + expiryMinutes * 60 * 1000).toISOString();
}

function couponStatus(row: any, expiresAt: string | null) {
  if (row.status === 'redeemed') return 'redeemed';
  if (expiresAt && new Date(expiresAt) < new Date()) return 'expired';
  return 'active';
}

export async function GET(request: NextRequest) {
  try {
    const promotionId = request.nextUrl.searchParams.get('promotionId');
    if (!promotionId) return NextResponse.json({ error: 'promotionId is required.' }, { status: 400 });

    const authClient = createServerAuthClient();
    const { data: userData, error: userError } = await authClient.auth.getUser();

    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const serviceClient = makeServiceClient();

    const promotionResult = await serviceClient
      .from('promotions')
      .select('id,name,slug,status,restaurant_id,starts_at,ends_at,coupon_expiry_minutes')
      .eq('id', promotionId)
      .single();

    if (promotionResult.error || !promotionResult.data) {
      return NextResponse.json({ error: 'Promotion not found.' }, { status: 404 });
    }

    const promotion = promotionResult.data as any;

    const restaurantResult = await serviceClient
      .from('restaurants')
      .select('id,name,slug,address_line1,city,owner_id')
      .eq('id', promotion.restaurant_id)
      .is('deleted_at', null)
      .single();

    if (restaurantResult.error || !restaurantResult.data) {
      return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 });
    }

    const restaurant = restaurantResult.data as any;

    if (restaurant.owner_id !== userData.user.id) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const couponsResult = await serviceClient
      .from('coupon_redemptions')
      .select('id,restaurant_id,promotion_id,promotion_reward_id,coupon_code,status,issued_at,redeemed_at')
      .eq('restaurant_id', restaurant.id)
      .eq('promotion_id', promotion.id)
      .order('issued_at', { ascending: false, nullsFirst: false })
      .limit(250);

    if (couponsResult.error) {
      return NextResponse.json({ error: couponsResult.error.message }, { status: 500 });
    }

    const coupons = couponsResult.data || [];
    const rewardIds = Array.from(new Set(coupons.map((item: any) => item.promotion_reward_id).filter(Boolean)));

    const rewardsResult = rewardIds.length
      ? await serviceClient.from('promotion_rewards').select('id,menu_item_id,custom_name,reward_type,reward_value').in('id', rewardIds)
      : { data: [], error: null } as any;

    if (rewardsResult.error) {
      return NextResponse.json({ error: rewardsResult.error.message }, { status: 500 });
    }

    const rewards = rewardsResult.data || [];
    const menuItemIds = Array.from(new Set(rewards.map((item: any) => item.menu_item_id).filter(Boolean)));

    const menuItemsResult = menuItemIds.length
      ? await serviceClient.from('menu_items').select('id,name').in('id', menuItemIds)
      : { data: [], error: null } as any;

    if (menuItemsResult.error) {
      return NextResponse.json({ error: menuItemsResult.error.message }, { status: 500 });
    }

    const rewardsById = Object.fromEntries(rewards.map((item: any) => [item.id, item]));
    const menuItemsById = Object.fromEntries((menuItemsResult.data || []).map((item: any) => [item.id, item]));

    const enrichedCoupons = coupons.map((coupon: any) => {
      const reward = rewardsById[coupon.promotion_reward_id] || null;
      const menuItem = reward?.menu_item_id ? menuItemsById[reward.menu_item_id] : null;
      const itemName = reward?.custom_name || menuItem?.name || 'Reward';
      const issuedAt = coupon.issued_at;
      const expiresAt = computeExpiresAt(issuedAt, promotion.coupon_expiry_minutes);
      const displayStatus = couponStatus(coupon, expiresAt);
      const discountType = reward?.reward_type === 'free'
        ? 'Free item'
        : reward?.reward_type === 'discount'
          ? `${reward.reward_value || 0}% discount`
          : reward?.reward_type || 'Reward';

      return {
        id: coupon.id,
        coupon_code: coupon.coupon_code,
        issued_at: issuedAt,
        redeemed_at: coupon.redeemed_at,
        expires_at: expiresAt,
        raw_status: coupon.status,
        display_status: displayStatus,
        item_won: itemName,
        discount_type: discountType,
      };
    });

    const summary = enrichedCoupons.reduce((acc: any, coupon: any) => {
      acc.issued += 1;
      if (coupon.display_status === 'redeemed') acc.redeemed += 1;
      if (coupon.display_status === 'active') acc.active += 1;
      if (coupon.display_status === 'expired') acc.expired += 1;
      return acc;
    }, { issued: 0, redeemed: 0, active: 0, expired: 0 });

    summary.redemptionRate = summary.issued ? Math.round((summary.redeemed / summary.issued) * 100) : 0;

    const rewardsBreakdown = enrichedCoupons.reduce((acc: Record<string, number>, coupon: any) => {
      const key = `${coupon.item_won} — ${coupon.discount_type}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      promotion: {
        id: promotion.id,
        name: promotion.name,
        slug: promotion.slug,
        status: promotion.status,
        starts_at: promotion.starts_at,
        ends_at: promotion.ends_at,
        coupon_expiry_minutes: promotion.coupon_expiry_minutes || 20,
      },
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        address: [restaurant.address_line1, restaurant.city].filter(Boolean).join(', '),
      },
      summary,
      rewardsBreakdown,
      coupons: enrichedCoupons,
      limit: 250,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load promotion performance.' }, { status: 500 });
  }
}

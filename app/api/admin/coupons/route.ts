import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url) throw new Error('Supabase URL is missing.');
  if (!serviceKey) throw new Error('Coupon reporting is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel.');

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

export async function GET() {
  try {
    const authClient = createServerAuthClient();
    const { data: userData, error: userError } = await authClient.auth.getUser();

    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const serviceClient = makeServiceClient();

    const restaurantsResult = await serviceClient
      .from('restaurants')
      .select('id,name,slug,address_line1,city')
      .eq('owner_id', userData.user.id);

    if (restaurantsResult.error) {
      return NextResponse.json({ error: restaurantsResult.error.message }, { status: 500 });
    }

    const restaurants = restaurantsResult.data || [];
    const restaurantIds = restaurants.map((item: any) => item.id as string);

    if (restaurantIds.length === 0) return NextResponse.json({ coupons: [] });

    const couponsResult = await serviceClient
      .from('coupon_redemptions')
      .select('id,restaurant_id,promotion_id,promotion_reward_id,coupon_code,status,issued_at,redeemed_at,created_at')
      .in('restaurant_id', restaurantIds)
      .order('issued_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(50);

    if (couponsResult.error) {
      return NextResponse.json({ error: couponsResult.error.message }, { status: 500 });
    }

    const coupons = couponsResult.data || [];
    const promotionIds = Array.from(new Set(coupons.map((item: any) => item.promotion_id).filter(Boolean)));
    const rewardIds = Array.from(new Set(coupons.map((item: any) => item.promotion_reward_id).filter(Boolean)));

    const promotionsResult = promotionIds.length
      ? await serviceClient.from('promotions').select('id,name,slug,coupon_expiry_minutes').in('id', promotionIds)
      : { data: [], error: null } as any;

    if (promotionsResult.error) {
      return NextResponse.json({ error: promotionsResult.error.message }, { status: 500 });
    }

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

    const restaurantsById = Object.fromEntries(restaurants.map((item: any) => [item.id, item]));
    const promotionsById = Object.fromEntries((promotionsResult.data || []).map((item: any) => [item.id, item]));
    const rewardsById = Object.fromEntries(rewards.map((item: any) => [item.id, item]));
    const menuItemsById = Object.fromEntries((menuItemsResult.data || []).map((item: any) => [item.id, item]));

    const enriched = coupons.map((coupon: any) => {
      const restaurant = restaurantsById[coupon.restaurant_id] || null;
      const promotion = promotionsById[coupon.promotion_id] || null;
      const reward = rewardsById[coupon.promotion_reward_id] || null;
      const menuItem = reward?.menu_item_id ? menuItemsById[reward.menu_item_id] : null;
      const itemName = reward?.custom_name || menuItem?.name || 'Reward';
      const issuedAt = coupon.issued_at || coupon.created_at;
      const expiresAt = computeExpiresAt(issuedAt, promotion?.coupon_expiry_minutes);
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
        display_status: couponStatus(coupon, expiresAt),
        restaurant_name: restaurant?.name || 'Restaurant',
        restaurant_slug: restaurant?.slug || '',
        restaurant_address: [restaurant?.address_line1, restaurant?.city].filter(Boolean).join(', '),
        promotion_name: promotion?.name || 'Promotion',
        promotion_slug: promotion?.slug || '',
        item_won: itemName,
        discount_type: discountType,
      };
    });

    return NextResponse.json({ coupons: enriched });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load coupons.' }, { status: 500 });
  }
}

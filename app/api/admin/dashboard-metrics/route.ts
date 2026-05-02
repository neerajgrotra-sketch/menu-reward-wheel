import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';

type PromotionForCount = {
  id: string;
  status: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url) throw new Error('Supabase URL is missing.');
  if (!serviceKey) throw new Error('Server metrics are not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel.');

  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isEffectivelyActive(promotion: PromotionForCount) {
  const now = new Date();
  if (promotion.status !== 'active') return false;
  if (promotion.starts_at && now < new Date(promotion.starts_at)) return false;
  if (promotion.ends_at && now > new Date(promotion.ends_at)) return false;
  return true;
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
      .select('id')
      .eq('owner_id', userData.user.id);

    if (restaurantsResult.error) {
      return NextResponse.json({ error: restaurantsResult.error.message }, { status: 500 });
    }

    const restaurantIds = (restaurantsResult.data || []).map((item) => item.id as string);

    if (restaurantIds.length === 0) {
      return NextResponse.json({
        restaurants: 0,
        activePromotions: 0,
        totalPromotions: 0,
        issuedCoupons: 0,
        redeemedCoupons: 0,
      });
    }

    const promotionsResult = await serviceClient
      .from('promotions')
      .select('id,status,starts_at,ends_at')
      .in('restaurant_id', restaurantIds);

    if (promotionsResult.error) {
      return NextResponse.json({ error: promotionsResult.error.message }, { status: 500 });
    }

    const promotions = (promotionsResult.data || []) as PromotionForCount[];

    const issuedCouponCount = await serviceClient
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .in('restaurant_id', restaurantIds);

    if (issuedCouponCount.error) {
      return NextResponse.json({ error: issuedCouponCount.error.message }, { status: 500 });
    }

    const redeemedCouponCount = await serviceClient
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .in('restaurant_id', restaurantIds)
      .eq('status', 'redeemed');

    if (redeemedCouponCount.error) {
      return NextResponse.json({ error: redeemedCouponCount.error.message }, { status: 500 });
    }

    return NextResponse.json({
      restaurants: restaurantIds.length,
      activePromotions: promotions.filter(isEffectivelyActive).length,
      totalPromotions: promotions.length,
      issuedCoupons: issuedCouponCount.count || 0,
      redeemedCoupons: redeemedCouponCount.count || 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load dashboard metrics.' }, { status: 500 });
  }
}

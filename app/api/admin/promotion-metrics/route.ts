import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url) throw new Error('Supabase URL is missing.');
  if (!serviceKey) throw new Error('Server metrics are not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel.');

  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
      return NextResponse.json({ metrics: {}, metricsBySlug: {}, couponCount: 0 });
    }

    const couponsResult = await serviceClient
      .from('coupon_redemptions')
      .select('promotion_id,status')
      .in('restaurant_id', restaurantIds);

    if (couponsResult.error) {
      return NextResponse.json({ error: couponsResult.error.message }, { status: 500 });
    }

    const coupons = couponsResult.data || [];
    const promotionIds = Array.from(new Set(coupons.map((coupon: any) => coupon.promotion_id).filter(Boolean)));

    const promotionsResult = promotionIds.length
      ? await serviceClient.from('promotions').select('id,slug').in('id', promotionIds)
      : { data: [], error: null } as any;

    if (promotionsResult.error) {
      return NextResponse.json({ error: promotionsResult.error.message }, { status: 500 });
    }

    const promotionsById = Object.fromEntries((promotionsResult.data || []).map((promotion: any) => [promotion.id, promotion]));
    const metrics: Record<string, { issued: number; redeemed: number }> = {};
    const metricsBySlug: Record<string, { issued: number; redeemed: number }> = {};

    coupons.forEach((coupon: any) => {
      if (!coupon.promotion_id) return;

      if (!metrics[coupon.promotion_id]) metrics[coupon.promotion_id] = { issued: 0, redeemed: 0 };
      metrics[coupon.promotion_id].issued += 1;
      if (coupon.status === 'redeemed') metrics[coupon.promotion_id].redeemed += 1;

      const slug = promotionsById[coupon.promotion_id]?.slug;
      if (slug) {
        if (!metricsBySlug[slug]) metricsBySlug[slug] = { issued: 0, redeemed: 0 };
        metricsBySlug[slug].issued += 1;
        if (coupon.status === 'redeemed') metricsBySlug[slug].redeemed += 1;
      }
    });

    return NextResponse.json({ metrics, metricsBySlug, couponCount: coupons.length });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load promotion metrics.' }, { status: 500 });
  }
}

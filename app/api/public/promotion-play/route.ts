import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

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

      menuNamesById = Object.fromEntries((menuItemsResult.data || []).map((item: any) => [item.id, item.name]));
    }

    const rewards = rawRewards.map((item: any) => {
      const label = rewardLabel(item, item.menu_item_id ? menuNamesById[item.menu_item_id] : undefined);
      return {
        id: item.id,
        label,
        description: label,
        terms: 'Show this code to staff before ordering. One reward per customer/session. Standard restaurant terms apply.',
        weight: item.weight || 30,
        active: true,
      };
    });

    return NextResponse.json({ restaurant, promotion: { ...promotion, game_type: promotion.game_type || 'wheel' }, rewards });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load promotion.' }, { status: 500 });
  }
}

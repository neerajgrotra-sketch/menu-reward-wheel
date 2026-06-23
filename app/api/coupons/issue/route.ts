import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url) {
    throw new Error('Supabase URL is missing.');
  }

  if (!serviceKey) {
    throw new Error('Coupon issuance is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel.');
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const promotion_id = body?.promotion_id;
    const promotion_reward_id = body?.promotion_reward_id;
    const restaurant_id = body?.restaurant_id;
    const coupon_code = body?.coupon_code;
    const customer_session_id = body?.customer_session_id || null;
    // UUID of the play_sessions row — links this coupon to the session that produced it.
    // Nullable: coupons issued before the play_session FK migration will have null here.
    const play_session_id = body?.play_session_id || null;
    // UUID of visit_sessions row — session intelligence attribution (Task 14)
    const visit_session_id = body?.visit_session_id || null;

    if (!promotion_id || !promotion_reward_id || !restaurant_id || !coupon_code) {
      return NextResponse.json({ error: 'Missing required coupon fields.' }, { status: 400 });
    }

    const supabase = makeClient();

    const promotionCheck = await supabase
      .from('promotions')
      .select('id,status,restaurant_id,starts_at,ends_at')
      .eq('id', promotion_id)
      .eq('restaurant_id', restaurant_id)
      .single();

    if (promotionCheck.error || !promotionCheck.data) {
      return NextResponse.json({ error: 'Promotion could not be validated.' }, { status: 404 });
    }

    const promotion = promotionCheck.data;
    const now = new Date();

    if (promotion.status !== 'active') {
      return NextResponse.json({ error: 'Promotion is not active.' }, { status: 400 });
    }

    if (promotion.starts_at && now < new Date(promotion.starts_at)) {
      return NextResponse.json({ error: 'Promotion has not started yet.' }, { status: 400 });
    }

    if (promotion.ends_at && now > new Date(promotion.ends_at)) {
      return NextResponse.json({ error: 'Promotion has ended.' }, { status: 400 });
    }

    const rewardCheck = await supabase
      .from('promotion_rewards')
      .select('id,promotion_id,restaurant_id')
      .eq('id', promotion_reward_id)
      .eq('promotion_id', promotion_id)
      .eq('restaurant_id', restaurant_id)
      .single();

    if (rewardCheck.error || !rewardCheck.data) {
      return NextResponse.json({ error: 'Reward could not be validated.' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('coupon_redemptions')
      .insert({
        promotion_id,
        promotion_reward_id,
        restaurant_id,
        coupon_code,
        status: 'issued',
        customer_session_id,
        play_session_id,
        issued_at: new Date().toISOString(),
      })
      .select('id,coupon_code,status,issued_at,play_session_id')
      .single();

    if (error) {
      console.error('[coupon-issue] insert failed', error.message, { play_session_id });
      return NextResponse.json({ error: 'Coupon could not be saved. Please ask staff for help.' }, { status: 500 });
    }

    // Task 14: Increment coupons_issued on visit_session — best effort
    if (visit_session_id) {
      Promise.all([
        supabase.rpc('increment_session_counters', {
          p_session_id: visit_session_id,
          p_coupons_delta: 1,
        }),
        supabase.rpc('append_session_interaction', {
          p_session_id: visit_session_id,
          p_event: {
            event: 'coupon_issued',
            coupon_code,
            ts: new Date().toISOString(),
          },
        }),
      ]).catch((err: unknown) => {
        console.error('[coupon-issue] session attribution failed', err);
      });
    }

    return NextResponse.json({ coupon: data });
  } catch (error: any) {
    console.error('Coupon issuance failed', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Could not issue coupon.' }, { status: 500 });
  }
}

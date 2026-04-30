import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || (!serviceKey && !anonKey)) {
    throw new Error('Supabase environment variables are missing.');
  }

  return createClient(url, serviceKey || anonKey!, {
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

    if (!promotion_id || !promotion_reward_id || !restaurant_id || !coupon_code) {
      return NextResponse.json({ error: 'Missing required coupon fields.' }, { status: 400 });
    }

    const supabase = makeClient();

    const { data, error } = await supabase
      .from('coupon_redemptions')
      .insert({
        promotion_id,
        promotion_reward_id,
        restaurant_id,
        coupon_code,
        status: 'issued',
        customer_session_id,
        issued_at: new Date().toISOString(),
      })
      .select('id,coupon_code,status,issued_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ coupon: data });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not issue coupon.' }, { status: 500 });
  }
}

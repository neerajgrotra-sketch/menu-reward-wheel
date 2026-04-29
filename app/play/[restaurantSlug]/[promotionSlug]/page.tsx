'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import confetti from 'canvas-confetti';
import BrandedUnavailablePage from '@/components/BrandedUnavailablePage';
import { RewardWheel } from '@/components/RewardWheel';
import { createCouponCode, pickWeightedReward } from '@/lib/rewards';
import { createClient } from '@/lib/supabase/client';
import type { Reward } from '@/types/reward';

type Restaurant = { id: string; name: string; slug: string; address_line1?: string | null; city?: string | null };
type Promotion = { id: string; name: string; slug: string; status: string; coupon_expiry_minutes?: number | null; starts_at?: string | null; ends_at?: string | null; max_spins?: number | null };
type PromotionReward = { id: string; menu_item_id: string | null; custom_name: string | null; reward_type: 'free' | 'discount' | 'custom'; reward_value: number | null; weight: number | null };
type WonCoupon = { id: string; redemptionId?: string | null; reward: Reward; code: string; issuedAt: number };

function rewardLabel(reward: PromotionReward, menuItemName?: string) {
  const baseName = reward.custom_name || menuItemName || 'Reward';
  if (reward.reward_type === 'free') return `FREE ${baseName}`;
  if (reward.reward_type === 'discount') return `${reward.reward_value || 0}% ${baseName}`;
  return baseName;
}

function formatRemaining(ms: number) {
  if (ms <= 0) return 'Expired';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function couponQrUrl(code: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(code)}`;
}

function getCustomerSessionId() {
  const key = 'spinbite_customer_session_id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  window.localStorage.setItem(key, next);
  return next;
}

export default function PromotionPlayPage() {
  const { restaurantSlug, promotionSlug } = useParams() as { restaurantSlug: string; promotionSlug: string };
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [wonCoupons, setWonCoupons] = useState<WonCoupon[]>([]);
  const [activeCouponId, setActiveCouponId] = useState<string | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [spinsUsed, setSpinsUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const segmentAngle = useMemo(() => (rewards.length ? 360 / rewards.length : 0), [rewards.length]);
  const maxSpins = Math.max(1, promotion?.max_spins || 1);
  const spinsRemaining = Math.max(0, maxSpins - spinsUsed);
  const canSpin = !spinning && rewards.length > 0 && spinsRemaining > 0;
  const expiryMinutes = promotion?.coupon_expiry_minutes || 20;
  const activeCoupon = wonCoupons.find((item) => item.id === activeCouponId) || wonCoupons[0] || null;
  const activeExpiresAt = activeCoupon ? activeCoupon.issuedAt + expiryMinutes * 60 * 1000 : null;
  const activeExpired = Boolean(activeExpiresAt && now >= activeExpiresAt);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      const supabase = createClient();

      const restaurantResult = await supabase.from('restaurants').select('id,name,slug,address_line1,city').eq('slug', restaurantSlug).single();
      if (restaurantResult.error || !restaurantResult.data) {
        setError('Restaurant not found.');
        setLoading(false);
        return;
      }

      const currentRestaurant = restaurantResult.data as Restaurant;
      setRestaurant(currentRestaurant);

      const promotionResult = await supabase.from('promotions').select('id,name,slug,status,coupon_expiry_minutes,starts_at,ends_at,max_spins').eq('restaurant_id', currentRestaurant.id).eq('slug', promotionSlug).single();
      if (promotionResult.error || !promotionResult.data) {
        setError('Promotion not found.');
        setLoading(false);
        return;
      }

      const currentPromotion = promotionResult.data as Promotion;
      setPromotion(currentPromotion);

      if (currentPromotion.status !== 'active') {
        setError('This promotion is not live yet.');
        setLoading(false);
        return;
      }

      const currentTime = new Date();
      if (currentPromotion.starts_at && currentTime < new Date(currentPromotion.starts_at)) {
        setError('This promotion has not started yet.');
        setLoading(false);
        return;
      }
      if (currentPromotion.ends_at && currentTime > new Date(currentPromotion.ends_at)) {
        setError('This promotion has ended.');
        setLoading(false);
        return;
      }

      const rewardsResult = await supabase.from('promotion_rewards').select('id,menu_item_id,custom_name,reward_type,reward_value,weight').eq('promotion_id', currentPromotion.id).order('created_at', { ascending: true });
      const rawRewards = (rewardsResult.data || []) as PromotionReward[];
      const menuItemIds = rawRewards.map((item) => item.menu_item_id).filter(Boolean) as string[];
      let menuNamesById: Record<string, string> = {};
      if (menuItemIds.length > 0) {
        const menuItemsResult = await supabase.from('menu_items').select('id,name').in('id', menuItemIds);
        menuNamesById = Object.fromEntries((menuItemsResult.data || []).map((item: any) => [item.id, item.name]));
      }

      setRewards(rawRewards.map((item) => {
        const label = rewardLabel(item, item.menu_item_id ? menuNamesById[item.menu_item_id] : undefined);
        return { id: item.id, label, description: label, terms: 'Show this code to staff before ordering. One reward per customer/session. Standard restaurant terms apply.', weight: item.weight || 30, active: true };
      }));
      setLoading(false);
    }

    load();
  }, [restaurantSlug, promotionSlug]);

  function spin() {
    if (!canSpin || !promotion || !restaurant) return;
    const selected = pickWeightedReward(rewards);
    const selectedIndex = rewards.findIndex((item) => item.id === selected.id);
    const finalRotation = rotation + 5 * 360 + (-(selectedIndex * segmentAngle) - (rotation % 360));
    setSpinning(true);
    setShowReveal(false);
    setRotation(finalRotation);

    setTimeout(async () => {
      const code = createCouponCode();
      const issuedAt = Date.now();
      const insertResult = await createClient().from('coupon_redemptions').insert({
        promotion_id: promotion.id,
        promotion_reward_id: selected.id,
        restaurant_id: restaurant.id,
        coupon_code: code,
        status: 'issued',
        customer_session_id: getCustomerSessionId(),
        issued_at: new Date(issuedAt).toISOString(),
      }).select('id').single();

      if (insertResult.error) console.error('Could not save coupon redemption', insertResult.error.message);
      const nextCoupon: WonCoupon = { id: `${issuedAt}-${Math.random()}`, redemptionId: insertResult.data?.id || null, reward: selected, code, issuedAt };
      setWonCoupons((current) => [nextCoupon, ...current]);
      setActiveCouponId(nextCoupon.id);
      setSpinsUsed((current) => current + 1);
      setSpinning(false);
      setShowReveal(true);
      confetti({ particleCount: 180, spread: 100, origin: { y: 0.6 } });
    }, 2900);
  }

  if (loading) return <div className="min-h-screen bg-[#FFF8F0] p-6 text-lg font-bold">Loading promotion...</div>;
  if (error) return <BrandedUnavailablePage message={error} restaurant={restaurant} />;
  if (!restaurant || !promotion) return <BrandedUnavailablePage message="Promotion unavailable." />;
  if (rewards.length < 2) return <BrandedUnavailablePage message="This promotion needs at least 2 active rewards before customers can play." restaurant={restaurant} />;

  const address = [restaurant.address_line1, restaurant.city].filter(Boolean).join(', ');

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-100 px-4 py-6 text-stone-950">
      <section className="mx-auto max-w-md pb-12">
        <div className="rounded-3xl bg-white/85 p-5 text-center shadow-xl">
          <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">{restaurant.name}</p>
          {address && <p className="mt-1 text-xs font-black uppercase tracking-wide text-stone-500">{address}</p>}
          <h1 className="mt-2 text-3xl font-black">Spin & Win</h1>
          <p className="mt-2 text-sm text-stone-600">Spin to unlock your reward.</p>
        </div>

        <div className="mt-5 rounded-3xl bg-white/80 p-4 text-center shadow-lg">
          <p className="text-lg font-black text-[#FF6B00]">{spinsRemaining > 0 ? `You have ${spinsRemaining} ${spinsRemaining === 1 ? 'spin' : 'spins'} left 🎯` : 'No spins left — enjoy your rewards 🎉'}</p>
          <p className="mt-1 text-sm font-bold text-stone-600">{spinsUsed} of {maxSpins} used</p>
        </div>

        <div className="mt-6"><RewardWheel rewards={rewards} rotation={rotation} spinning={spinning} /></div>
        <button onClick={spin} disabled={!canSpin} className="mt-6 w-full rounded-3xl bg-green-600 px-6 py-5 text-xl font-black text-white shadow-xl disabled:bg-stone-400">{spinning ? 'Spinning...' : spinsRemaining > 0 && wonCoupons.length > 0 ? 'Spin Again' : spinsRemaining > 0 ? 'Spin Now' : 'All Spins Used'}</button>

        {wonCoupons.length > 0 && <section className="mt-6 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Your Rewards</p><div className="mt-4 space-y-4">{wonCoupons.map((item, index) => { const expiresAt = item.issuedAt + expiryMinutes * 60 * 1000; const expired = now >= expiresAt; return <button key={item.id} onClick={() => { setActiveCouponId(item.id); setShowReveal(true); }} className="relative w-full rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left shadow-sm">{expired && <span className="absolute right-3 top-3 rotate-[-8deg] rounded-lg border-2 border-red-600 px-2 py-1 text-xs font-black uppercase text-red-600">Expired</span>}<p className="text-xs font-black uppercase tracking-wide text-stone-500">Reward {wonCoupons.length - index}</p><p className="mt-1 pr-20 text-xl font-black">{item.reward.description}</p><p className="mt-2 text-sm font-bold text-stone-500">Code: {item.code}</p><p className={expired ? 'mt-1 text-sm font-black text-red-600' : 'mt-1 text-sm font-bold text-green-700'}>{expired ? 'Expired' : `Expires in ${formatRemaining(expiresAt - now)}`}</p></button>; })}</div></section>}
      </section>

      {showReveal && activeCoupon && <div className="fixed inset-0 z-50 flex items-end bg-black/40 px-3 pb-3 backdrop-blur-sm"><section className="mx-auto w-full max-w-md rounded-[2rem] bg-white p-5 text-center shadow-2xl"><div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-stone-200" /><p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">🎉 You won</p><h2 className="mt-2 text-4xl font-black leading-tight">{activeCoupon.reward.description}</h2><div className="relative mt-5 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 p-4">{activeExpired && <div className="absolute right-3 top-3 rotate-[-10deg] rounded-xl border-4 border-red-600 px-3 py-1 text-lg font-black uppercase text-red-600 opacity-90">Expired</div>}<p className="text-xs font-bold uppercase text-stone-500">Coupon Code</p><p className="mt-1 break-all text-3xl font-black tracking-wider">{activeCoupon.code}</p></div><p className={activeExpired ? 'mt-4 text-lg font-black text-red-600' : 'mt-4 text-lg font-bold text-red-600'}>{activeExpired ? 'Coupon expired' : `Expires in ${formatRemaining((activeExpiresAt || 0) - now)}`}</p><div className="relative mt-4 rounded-3xl bg-stone-50 p-4">{activeExpired && <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rotate-[-12deg] rounded-xl border-4 border-red-600 bg-white/85 px-5 py-2 text-2xl font-black uppercase text-red-600 shadow-lg">Expired</div>}{activeExpired && <div className="absolute inset-4 z-10 rounded-3xl bg-white/65" />}<p className="text-xs font-black uppercase tracking-wide text-stone-500">Scan Coupon</p><img src={couponQrUrl(activeCoupon.code)} alt="Coupon QR code" className={activeExpired ? 'mx-auto mt-3 h-44 w-44 rounded-2xl bg-white p-2 opacity-35 shadow' : 'mx-auto mt-3 h-44 w-44 rounded-2xl bg-white p-2 shadow'} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><button onClick={() => setShowReveal(false)} className="rounded-2xl bg-stone-100 px-5 py-4 text-sm font-black text-stone-800">Close</button><button onClick={spin} disabled={!canSpin} className="rounded-2xl bg-green-600 px-5 py-4 text-sm font-black text-white disabled:bg-stone-300">{spinsRemaining > 0 ? 'Spin Again' : 'No Spins Left'}</button></div><p className="mt-3 text-xs text-stone-500">{activeCoupon.reward.terms}</p></section></div>}
    </main>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import confetti from 'canvas-confetti';
import { RewardWheel } from '@/components/RewardWheel';
import { createCouponCode, pickWeightedReward } from '@/lib/rewards';
import { createClient } from '@/lib/supabase/client';
import type { Reward } from '@/types/reward';

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  address_line1?: string | null;
  city?: string | null;
};

type Promotion = {
  id: string;
  name: string;
  slug: string;
  status: string;
  coupon_expiry_minutes?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  max_spins?: number | null;
  stop_on_win?: boolean | null;
};

type PromotionReward = {
  id: string;
  menu_item_id: string | null;
  custom_name: string | null;
  reward_type: 'free' | 'discount' | 'custom';
  reward_value: number | null;
  daily_limit: number | null;
  weight: number | null;
};

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

export default function PromotionPlayPage() {
  const params = useParams();
  const restaurantSlug = params.restaurantSlug as string;
  const promotionSlug = params.promotionSlug as string;

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponIssuedAt, setCouponIssuedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [spinsUsed, setSpinsUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const segmentAngle = useMemo(() => (rewards.length ? 360 / rewards.length : 0), [rewards.length]);
  const maxSpins = Math.max(1, promotion?.max_spins || 1);
  const spinsRemaining = Math.max(0, maxSpins - spinsUsed);
  const canSpin = !spinning && rewards.length > 0 && spinsRemaining > 0;
  const expiryMinutes = promotion?.coupon_expiry_minutes || 20;
  const expiresAt = couponIssuedAt ? couponIssuedAt + expiryMinutes * 60 * 1000 : null;
  const isExpired = Boolean(expiresAt && now >= expiresAt);
  const couponQrUrl = coupon
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(coupon)}`
    : '';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      const supabase = createClient();

      const restaurantResult = await supabase
        .from('restaurants')
        .select('id,name,slug,address_line1,city')
        .eq('slug', restaurantSlug)
        .single();

      if (restaurantResult.error || !restaurantResult.data) {
        setError('Restaurant not found.');
        setLoading(false);
        return;
      }

      const currentRestaurant = restaurantResult.data as Restaurant;
      setRestaurant(currentRestaurant);

      const promotionResult = await supabase
        .from('promotions')
        .select('id,name,slug,status,coupon_expiry_minutes,starts_at,ends_at,max_spins,stop_on_win')
        .eq('restaurant_id', currentRestaurant.id)
        .eq('slug', promotionSlug)
        .single();

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

      const rewardsResult = await supabase
        .from('promotion_rewards')
        .select('id,menu_item_id,custom_name,reward_type,reward_value,daily_limit,weight')
        .eq('promotion_id', currentPromotion.id)
        .order('created_at', { ascending: true });

      const rawRewards = (rewardsResult.data || []) as PromotionReward[];
      const menuItemIds = rawRewards.map((item) => item.menu_item_id).filter(Boolean) as string[];
      let menuNamesById: Record<string, string> = {};

      if (menuItemIds.length > 0) {
        const menuItemsResult = await supabase.from('menu_items').select('id,name').in('id', menuItemIds);
        menuNamesById = Object.fromEntries((menuItemsResult.data || []).map((item: any) => [item.id, item.name]));
      }

      const mappedRewards: Reward[] = rawRewards.map((item) => {
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

      setRewards(mappedRewards);
      setLoading(false);
    }

    load();
  }, [restaurantSlug, promotionSlug]);

  function spin() {
    if (!canSpin) return;

    const selected = pickWeightedReward(rewards);
    const selectedIndex = rewards.findIndex((item) => item.id === selected.id);
    const currentNormalized = rotation % 360;
    const targetAngle = -(selectedIndex * segmentAngle);
    const finalRotation = rotation + 5 * 360 + (targetAngle - currentNormalized);

    setReward(null);
    setCoupon(null);
    setCouponIssuedAt(null);
    setSpinning(true);
    setRotation(finalRotation);

    setTimeout(() => {
      setReward(selected);
      setCoupon(createCouponCode());
      setCouponIssuedAt(Date.now());
      setSpinsUsed((current) => current + 1);
      setSpinning(false);
      confetti({ particleCount: 180, spread: 100, origin: { y: 0.6 } });
    }, 2900);
  }

  if (loading) return <div className="min-h-screen bg-[#FFF8F0] p-6 text-lg font-bold">Loading promotion...</div>;
  if (error) return <div className="min-h-screen bg-[#FFF8F0] p-6 text-lg font-bold">{error}</div>;
  if (!restaurant || !promotion) return <div className="min-h-screen bg-[#FFF8F0] p-6 text-lg font-bold">Promotion unavailable.</div>;
  if (rewards.length < 2) return <div className="min-h-screen bg-[#FFF8F0] p-6 text-lg font-bold">This promotion needs at least 2 active rewards before customers can play.</div>;

  const address = [restaurant.address_line1, restaurant.city].filter(Boolean).join(', ');

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-100 px-4 py-6 text-stone-950">
      <section className="mx-auto max-w-md">
        <div className="rounded-3xl bg-white/85 p-5 text-center shadow-xl">
          <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">{restaurant.name}</p>
          {address && <p className="mt-1 text-xs font-black uppercase tracking-wide text-stone-500">{address}</p>}
          <h1 className="mt-2 text-3xl font-black">Spin & Win</h1>
          <p className="mt-2 text-sm text-stone-600">Spin to unlock your reward.</p>
        </div>

        <div className="mt-5 rounded-3xl bg-white/80 p-4 text-center shadow-lg">
          <p className="text-lg font-black text-[#FF6B00]">
            {spinsRemaining > 0
              ? `You have ${spinsRemaining} ${spinsRemaining === 1 ? 'spin' : 'spins'} left 🎯`
              : 'No spins left — enjoy your reward 🎉'}
          </p>
          <p className="mt-1 text-sm font-bold text-stone-600">
            {spinsUsed} of {maxSpins} used
          </p>
        </div>

        <div className="mt-6">
          <RewardWheel rewards={rewards} rotation={rotation} spinning={spinning} />
        </div>

        <button onClick={spin} disabled={!canSpin} className="mt-6 w-full rounded-3xl bg-green-600 px-6 py-5 text-xl font-black text-white shadow-xl disabled:bg-stone-400">
          {spinning ? 'Spinning...' : spinsRemaining > 0 && reward ? 'Spin Again' : spinsRemaining > 0 ? 'Spin Now' : 'Reward Unlocked'}
        </button>

        {reward && coupon && (
          <section className="relative mt-6 rounded-3xl bg-white p-5 shadow-xl">
            {isExpired && (
              <div className="absolute right-4 top-4 rotate-[-10deg] rounded-xl border-4 border-red-600 px-4 py-2 text-xl font-black uppercase text-red-600 opacity-90">
                Expired
              </div>
            )}
            <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Your Reward</p>
            <h2 className="mt-1 pr-24 text-3xl font-black">{reward.description}</h2>
            <div className="mt-4 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 p-4 text-center">
              <p className="text-xs font-bold uppercase text-stone-500">Coupon Code</p>
              <p className="mt-1 text-3xl font-black tracking-wider">{coupon}</p>
            </div>
            <div className="mt-4 text-center">
              <p className={isExpired ? 'text-lg font-black text-red-600' : 'text-lg font-bold text-red-600'}>
                {isExpired ? 'Coupon expired' : `Expires in ${formatRemaining((expiresAt || 0) - now)}`}
              </p>
            </div>
            <div className="mt-4 rounded-3xl bg-stone-50 p-4 text-center">
              <p className="text-xs font-black uppercase tracking-wide text-stone-500">Scan Coupon</p>
              <img src={couponQrUrl} alt="Coupon QR code" className="mx-auto mt-3 h-44 w-44 rounded-2xl bg-white p-2 shadow" />
            </div>
            <p className="mt-3 text-sm text-stone-600">{reward.terms}</p>
          </section>
        )}
      </section>
    </main>
  );
}

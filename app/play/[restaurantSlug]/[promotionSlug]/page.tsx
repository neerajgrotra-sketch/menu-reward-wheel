'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import confetti from 'canvas-confetti';
import { CountdownTimer } from '@/components/CountdownTimer';
import { RewardWheel } from '@/components/RewardWheel';
import { createCouponCode, pickWeightedReward } from '@/lib/rewards';
import { createClient } from '@/lib/supabase/client';
import type { Reward } from '@/types/reward';

type Restaurant = { id: string; name: string; slug: string };
type Promotion = {
  id: string;
  name: string;
  slug: string;
  status: string;
  coupon_expiry_minutes?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const segmentAngle = useMemo(() => (rewards.length ? 360 / rewards.length : 0), [rewards.length]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      const supabase = createClient();

      const restaurantResult = await supabase
        .from('restaurants')
        .select('id,name,slug')
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
        .select('id,name,slug,status,coupon_expiry_minutes,starts_at,ends_at')
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

      const now = new Date();
      if (currentPromotion.starts_at && now < new Date(currentPromotion.starts_at)) {
        setError('This promotion has not started yet.');
        setLoading(false);
        return;
      }

      if (currentPromotion.ends_at && now > new Date(currentPromotion.ends_at)) {
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
    if (spinning || rewards.length === 0) return;

    const selected = pickWeightedReward(rewards);
    const selectedIndex = rewards.findIndex((item) => item.id === selected.id);
    const currentNormalized = rotation % 360;
    const targetAngle = -(selectedIndex * segmentAngle);
    const finalRotation = rotation + 5 * 360 + (targetAngle - currentNormalized);

    setReward(null);
    setCoupon(null);
    setSpinning(true);
    setRotation(finalRotation);

    setTimeout(() => {
      setReward(selected);
      setCoupon(createCouponCode());
      setSpinning(false);
      confetti({ particleCount: 180, spread: 100, origin: { y: 0.6 } });
    }, 2900);
  }

  if (loading) return <div className="min-h-screen bg-[#FFF8F0] p-6 text-lg font-bold">Loading promotion...</div>;
  if (error) return <div className="min-h-screen bg-[#FFF8F0] p-6 text-lg font-bold">{error}</div>;
  if (!restaurant || !promotion) return <div className="min-h-screen bg-[#FFF8F0] p-6 text-lg font-bold">Promotion unavailable.</div>;
  if (rewards.length < 2) return <div className="min-h-screen bg-[#FFF8F0] p-6 text-lg font-bold">This promotion needs at least 2 active rewards before customers can play.</div>;

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-100 px-4 py-6 text-stone-950">
      <section className="mx-auto max-w-md">
        <div className="rounded-3xl bg-white/85 p-5 text-center shadow-xl">
          <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">{restaurant.name}</p>
          <h1 className="mt-1 text-3xl font-black">{promotion.name}</h1>
          <p className="mt-2 text-sm text-stone-600">Spin to unlock your reward.</p>
        </div>

        <div className="mt-6">
          <RewardWheel rewards={rewards} rotation={rotation} spinning={spinning} />
        </div>

        <button onClick={spin} disabled={spinning || Boolean(reward)} className="mt-6 w-full rounded-3xl bg-green-600 px-6 py-5 text-xl font-black text-white shadow-xl disabled:bg-stone-400">
          {spinning ? 'Spinning...' : reward ? 'Reward Unlocked' : 'Spin Now'}
        </button>

        {reward && coupon && (
          <section className="mt-6 rounded-3xl bg-white p-5 shadow-xl">
            <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Your Reward</p>
            <h2 className="mt-1 text-3xl font-black">{reward.description}</h2>
            <div className="mt-4 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 p-4 text-center">
              <p className="text-xs font-bold uppercase text-stone-500">Coupon Code</p>
              <p className="mt-1 text-3xl font-black tracking-wider">{coupon}</p>
            </div>
            <p className="mt-4 text-center text-lg font-bold text-red-600">Expires in <CountdownTimer minutes={promotion.coupon_expiry_minutes || 20} /></p>
            <p className="mt-3 text-sm text-stone-600">{reward.terms}</p>
          </section>
        )}
      </section>
    </main>
  );
}

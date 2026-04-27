'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Promotion = {
  id: string;
  name: string;
  slug: string;
  restaurant_id: string;
  status: string;
};

type Restaurant = {
  id: string;
  name: string;
  slug: string;
};

type RewardRow = {
  id: string;
  label: string;
  description: string;
  terms: string | null;
  weight: number;
  active: boolean | null;
  display_order: number | null;
};

export default function RewardEditorPage() {
  const params = useParams();
  const promotionId = params.id as string;

  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [terms, setTerms] = useState('Standard terms apply.');
  const [weight, setWeight] = useState(10);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setRestaurantSlug(searchParams.get('slug'));
  }, []);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const promotionResult = await supabase
        .from('promotions')
        .select('id,name,slug,restaurant_id,status')
        .eq('id', promotionId)
        .single();

      if (promotionResult.error || !promotionResult.data) {
        setError('Promotion not found.');
        return;
      }

      const currentPromotion = promotionResult.data as Promotion;
      setPromotion(currentPromotion);

      const restaurantResult = await supabase
        .from('restaurants')
        .select('id,name,slug')
        .eq('id', currentPromotion.restaurant_id)
        .single();

      if (restaurantResult.data) setRestaurant(restaurantResult.data as Restaurant);

      const rewardsResult = await supabase
        .from('rewards')
        .select('id,label,description,terms,weight,active,display_order')
        .eq('promotion_id', promotionId)
        .order('display_order', { ascending: true });

      setRewards((rewardsResult.data || []) as RewardRow[]);
    }

    load();
  }, [promotionId]);

  async function refreshRewards() {
    const supabase = createClient();
    const rewardsResult = await supabase
      .from('rewards')
      .select('id,label,description,terms,weight,active,display_order')
      .eq('promotion_id', promotionId)
      .order('display_order', { ascending: true });

    setRewards((rewardsResult.data || []) as RewardRow[]);
  }

  async function addReward() {
    if (!promotion || !label.trim()) return;
    setSaving(true);
    setError('');

    const supabase = createClient();
    const insertResult = await supabase.from('rewards').insert({
      restaurant_id: promotion.restaurant_id,
      promotion_id: promotion.id,
      label: label.trim(),
      description: description.trim() || label.trim(),
      terms: terms.trim() || 'Standard terms apply.',
      weight,
      active: true,
      display_order: rewards.length,
    });

    if (insertResult.error) {
      setError(insertResult.error.message);
      setSaving(false);
      return;
    }

    setLabel('');
    setDescription('');
    setTerms('Standard terms apply.');
    setWeight(10);
    await refreshRewards();
    setSaving(false);
  }

  async function toggleReward(reward: RewardRow) {
    const supabase = createClient();
    await supabase.from('rewards').update({ active: reward.active === false }).eq('id', reward.id);
    await refreshRewards();
  }

  async function copyLink() {
    if (!restaurant || !promotion || typeof window === 'undefined') return;
    const link = `${window.location.origin}/play/${restaurant.slug}/${promotion.slug}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (error) return <div className="p-6">{error}</div>;
  if (!promotion) return <div className="p-6">Loading promotion...</div>;

  const playPath = restaurant && promotion ? `/play/${restaurant.slug}/${promotion.slug}` : '';

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-8 text-[#1F1F1F]">
      <section className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <a href={`/admin/promotions?slug=${restaurantSlug || restaurant?.slug || ''}`} className="text-sm font-black text-[#FF6B00]">Back to promotions</a>

        <h1 className="mt-4 text-3xl font-black text-[#FF6B00]">Edit Wheel Items</h1>
        <p className="mt-1 text-xl font-black">{promotion.name}</p>
        <p className="mt-2 text-sm text-stone-600">Add 6–10 rewards for the best mobile wheel experience.</p>

        {restaurant && (
          <div className="mt-4 rounded-2xl bg-orange-50 p-4 text-sm">
            <p className="font-bold text-stone-700">Customer promotion link</p>
            <p className="mt-1 break-all font-black text-[#FF6B00]">{typeof window !== 'undefined' ? window.location.origin : ''}{playPath}</p>
            <button onClick={copyLink} className="mt-3 w-full rounded-xl bg-[#FF6B00] px-4 py-2 font-black text-white">{copied ? 'Copied!' : 'Copy Link'}</button>
          </div>
        )}

        <div className="mt-6 space-y-3 rounded-2xl bg-stone-50 p-4">
          <h2 className="text-lg font-black">Add reward</h2>
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Wheel label, e.g. Free Lassi" className="w-full rounded-xl border px-3 py-2" />
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Customer reward text" className="w-full rounded-xl border px-3 py-2" />
          <input value={terms} onChange={(event) => setTerms(event.target.value)} placeholder="Terms" className="w-full rounded-xl border px-3 py-2" />
          <input type="number" min="1" value={weight} onChange={(event) => setWeight(Number(event.target.value))} className="w-full rounded-xl border px-3 py-2" />
          <button onClick={addReward} disabled={saving || !label.trim()} className="w-full rounded-xl bg-green-600 px-4 py-3 font-black text-white disabled:bg-stone-400">{saving ? 'Saving...' : 'Add Reward'}</button>
        </div>

        <div className="mt-6 space-y-3">
          <h2 className="text-xl font-black">Rewards ({rewards.length})</h2>
          {rewards.length < 2 && <p className="rounded-2xl bg-yellow-50 p-3 text-sm font-bold text-yellow-800">Add at least 2 active rewards before testing the wheel.</p>}
          {rewards.map((reward) => (
            <div key={reward.id} className="rounded-2xl bg-stone-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black">{reward.label}</p>
                  <p className="mt-1 text-sm text-stone-600">{reward.description}</p>
                  <p className="mt-1 text-xs font-bold text-stone-500">Weight: {reward.weight}</p>
                </div>
                <button onClick={() => toggleReward(reward)} className="rounded-full bg-white px-3 py-1 text-xs font-black">
                  {reward.active === false ? 'Inactive' : 'Active'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {restaurant && rewards.length >= 2 && (
          <a href={playPath} className="mt-6 block rounded-2xl bg-green-600 px-4 py-4 text-center font-black text-white">Test Promotion</a>
        )}
      </section>
    </main>
  );
}

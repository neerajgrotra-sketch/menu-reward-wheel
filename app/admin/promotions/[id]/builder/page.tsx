'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import SpinWheelPreview from '@/components/admin/SpinWheelPreview';

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  address_line1?: string | null;
  city?: string | null;
};

type Promotion = {
  id: string;
  restaurant_id: string;
  name: string;
  slug: string;
  game_type?: string | null;
  status: string;
  daily_redeem_limit?: number | null;
  max_spins?: number | null;
  stop_on_win?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

type Menu = {
  id: string;
  name: string;
  restaurant_id: string;
};

type MenuItem = {
  id: string;
  menu_id: string;
  name: string;
  price?: number | null;
};

type RewardType = 'free' | 'discount' | 'custom';
type WeightLabel = 'Common' | 'Normal' | 'Rare';

type BuilderReward = {
  temp_id: string;
  id?: string;
  promotion_id: string;
  restaurant_id: string;
  menu_item_id: string | null;
  custom_name: string | null;
  label: string;
  reward_type: RewardType;
  reward_value: number | null;
  daily_limit: number;
  weight_label: WeightLabel;
  weight: number;
};

const MIN_REWARDS = 6;
const MAX_REWARDS = 10;
const WEIGHTS: Record<WeightLabel, number> = { Common: 60, Normal: 30, Rare: 10 };

function tempId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getWeightLabel(weight?: number | null): WeightLabel {
  if (weight === 60) return 'Common';
  if (weight === 10) return 'Rare';
  return 'Normal';
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return '';
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
}

function weightedPick(rewards: BuilderReward[]) {
  const total = rewards.reduce((sum, reward) => sum + reward.weight, 0);
  let random = Math.random() * total;
  for (let i = 0; i < rewards.length; i += 1) {
    random -= rewards[i].weight;
    if (random <= 0) return i;
  }
  return Math.max(0, rewards.length - 1);
}

export default function PromotionBuilderPage() {
  const params = useParams();
  const promotionId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [rewards, setRewards] = useState<BuilderReward[]>([]);

  const [dailyRedeemLimit, setDailyRedeemLimit] = useState(50);
  const [maxSpins, setMaxSpins] = useState(3);
  const [stopOnWin, setStopOnWin] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const [testSpinning, setTestSpinning] = useState(false);
  const [testSelectedIndex, setTestSelectedIndex] = useState<number | null>(null);
  const [testResult, setTestResult] = useState('');
  const [copied, setCopied] = useState(false);

  const rewardStatus = rewards.length >= MIN_REWARDS ? `${rewards.length} / ${MAX_REWARDS} rewards added — minimum met ✅` : `${rewards.length} / ${MAX_REWARDS} rewards added — add ${MIN_REWARDS - rewards.length} more`;

  const validationErrors = useMemo(() => {
    const messages: string[] = [];
    if (rewards.length < MIN_REWARDS) messages.push(`Add at least ${MIN_REWARDS} rewards.`);
    if (rewards.length > MAX_REWARDS) messages.push(`Use no more than ${MAX_REWARDS} rewards.`);
    if (!dailyRedeemLimit || dailyRedeemLimit < 1) messages.push('Daily promotion limit is required.');
    if (!maxSpins || maxSpins < 1) messages.push('Max spins per customer is required.');
    if (!startsAt) messages.push('Start date/time is required.');
    if (!endsAt) messages.push('End date/time is required.');
    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) messages.push('End date/time must be after start date/time.');
    rewards.forEach((reward, index) => {
      if (!reward.label.trim()) messages.push(`Reward ${index + 1} needs a name.`);
      if (reward.reward_type === 'discount' && (!reward.reward_value || reward.reward_value < 1 || reward.reward_value > 100)) messages.push(`Reward ${index + 1} needs a discount from 1% to 100%.`);
      if (!reward.daily_limit || reward.daily_limit < 1) messages.push(`Reward ${index + 1} needs a daily limit.`);
    });
    return messages;
  }, [dailyRedeemLimit, endsAt, maxSpins, rewards, startsAt]);

  const launchReady = validationErrors.length === 0;

  useEffect(() => {
    async function loadBuilder() {
      setLoading(true);
      setError('');
      const supabase = createClient();

      const promotionResult = await supabase
        .from('promotions')
        .select('id,restaurant_id,name,slug,game_type,status,daily_redeem_limit,max_spins,stop_on_win,starts_at,ends_at')
        .eq('id', promotionId)
        .single();

      if (promotionResult.error || !promotionResult.data) {
        setError(promotionResult.error?.message || 'Promotion not found.');
        setLoading(false);
        return;
      }

      const currentPromotion = promotionResult.data as Promotion;
      setPromotion(currentPromotion);
      setDailyRedeemLimit(currentPromotion.daily_redeem_limit || 50);
      setMaxSpins(currentPromotion.max_spins || 3);
      setStopOnWin(currentPromotion.stop_on_win ?? true);
      setStartsAt(currentPromotion.starts_at ? currentPromotion.starts_at.slice(0, 16) : '');
      setEndsAt(currentPromotion.ends_at ? currentPromotion.ends_at.slice(0, 16) : '');

      const restaurantResult = await supabase
        .from('restaurants')
        .select('id,name,slug,address_line1,city')
        .eq('id', currentPromotion.restaurant_id)
        .single();

      if (restaurantResult.data) setRestaurant(restaurantResult.data as Restaurant);

      const menusResult = await supabase
        .from('menus')
        .select('id,name,restaurant_id')
        .eq('restaurant_id', currentPromotion.restaurant_id)
        .order('name', { ascending: true });

      const nextMenus = (menusResult.data || []) as Menu[];
      setMenus(nextMenus);
      if (nextMenus.length > 0) setSelectedMenuId(nextMenus[0].id);

      const rewardsResult = await supabase
        .from('promotion_rewards')
        .select('id,promotion_id,restaurant_id,menu_item_id,custom_name,reward_type,reward_value,daily_limit,weight')
        .eq('promotion_id', promotionId)
        .order('created_at', { ascending: true });

      const rawRewards = (rewardsResult.data || []) as any[];
      const itemIds = rawRewards.map((reward) => reward.menu_item_id).filter(Boolean);
      let itemNameById: Record<string, string> = {};
      if (itemIds.length > 0) {
        const itemResult = await supabase.from('menu_items').select('id,name').in('id', itemIds);
        itemNameById = Object.fromEntries(((itemResult.data || []) as { id: string; name: string }[]).map((item) => [item.id, item.name]));
      }

      setRewards(
        rawRewards.map((reward) => ({
          temp_id: tempId(),
          id: reward.id,
          promotion_id: reward.promotion_id,
          restaurant_id: reward.restaurant_id,
          menu_item_id: reward.menu_item_id,
          custom_name: reward.custom_name,
          label: reward.custom_name || itemNameById[reward.menu_item_id] || 'Reward',
          reward_type: reward.reward_type || 'discount',
          reward_value: reward.reward_value,
          daily_limit: reward.daily_limit || 10,
          weight_label: getWeightLabel(reward.weight),
          weight: reward.weight || 30,
        }))
      );

      setLoading(false);
    }

    if (promotionId) loadBuilder();
  }, [promotionId]);

  useEffect(() => {
    async function loadMenuItems() {
      if (!selectedMenuId) {
        setMenuItems([]);
        return;
      }
      const supabase = createClient();
      const itemsResult = await supabase
        .from('menu_items')
        .select('id,menu_id,name,price')
        .eq('menu_id', selectedMenuId)
        .order('name', { ascending: true });
      setMenuItems((itemsResult.data || []) as MenuItem[]);
    }
    loadMenuItems();
  }, [selectedMenuId]);

  function addMenuItem(item: MenuItem) {
    if (!promotion || !restaurant || rewards.length >= MAX_REWARDS) return;
    if (rewards.some((reward) => reward.menu_item_id === item.id)) return;
    setSaved(false);
    setRewards((current) => [
      ...current,
      {
        temp_id: tempId(),
        promotion_id: promotion.id,
        restaurant_id: restaurant.id,
        menu_item_id: item.id,
        custom_name: null,
        label: item.name,
        reward_type: 'discount',
        reward_value: 10,
        daily_limit: 10,
        weight_label: 'Normal',
        weight: WEIGHTS.Normal,
      },
    ]);
  }

  function addCustomReward() {
    if (!promotion || !restaurant || rewards.length >= MAX_REWARDS) return;
    setSaved(false);
    setRewards((current) => [
      ...current,
      {
        temp_id: tempId(),
        promotion_id: promotion.id,
        restaurant_id: restaurant.id,
        menu_item_id: null,
        custom_name: 'Custom Reward',
        label: 'Custom Reward',
        reward_type: 'custom',
        reward_value: null,
        daily_limit: 10,
        weight_label: 'Normal',
        weight: WEIGHTS.Normal,
      },
    ]);
  }

  function updateReward(tempRewardId: string, updates: Partial<BuilderReward>) {
    setSaved(false);
    setRewards((current) =>
      current.map((reward) => {
        if (reward.temp_id !== tempRewardId) return reward;
        const updated = { ...reward, ...updates };
        if (updates.weight_label) updated.weight = WEIGHTS[updates.weight_label];
        if (updated.menu_item_id === null) updated.custom_name = updated.label;
        if (updated.reward_type !== 'discount') updated.reward_value = null;
        return updated;
      })
    );
  }

  function removeReward(tempRewardId: string) {
    setSaved(false);
    setRewards((current) => current.filter((reward) => reward.temp_id !== tempRewardId));
  }

  async function saveDraft() {
    if (!promotion || !restaurant) return false;
    setSaving(true);
    setError('');
    setSaved(false);
    const supabase = createClient();

    const promotionResult = await supabase
      .from('promotions')
      .update({
        daily_redeem_limit: dailyRedeemLimit,
        max_spins: maxSpins,
        stop_on_win: stopOnWin,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        status: 'draft',
      })
      .eq('id', promotion.id);

    if (promotionResult.error) {
      setError(promotionResult.error.message);
      setSaving(false);
      return false;
    }

    const deleteResult = await supabase.from('promotion_rewards').delete().eq('promotion_id', promotion.id);
    if (deleteResult.error) {
      setError(deleteResult.error.message);
      setSaving(false);
      return false;
    }

    if (rewards.length > 0) {
      const insertResult = await supabase.from('promotion_rewards').insert(
        rewards.map((reward) => ({
          promotion_id: promotion.id,
          restaurant_id: restaurant.id,
          menu_item_id: reward.menu_item_id,
          custom_name: reward.menu_item_id ? null : reward.label,
          reward_type: reward.reward_type,
          reward_value: reward.reward_type === 'discount' ? reward.reward_value : null,
          daily_limit: reward.daily_limit,
          weight: reward.weight,
        }))
      );
      if (insertResult.error) {
        setError(insertResult.error.message);
        setSaving(false);
        return false;
      }
    }

    setPromotion({ ...promotion, status: 'draft' });
    setSaving(false);
    setSaved(true);
    return true;
  }

  async function launchPromotion() {
    if (!promotion || !launchReady) return;
    setLaunching(true);
    const draftSaved = await saveDraft();
    if (!draftSaved) {
      setLaunching(false);
      return;
    }
    const supabase = createClient();
    const launchResult = await supabase.from('promotions').update({ status: 'active' }).eq('id', promotion.id);
    if (launchResult.error) {
      setError(launchResult.error.message);
      setLaunching(false);
      return;
    }
    setPromotion({ ...promotion, status: 'active' });
    setLaunching(false);
  }

  function runTestSpin() {
    if (rewards.length === 0 || testSpinning) return;
    setTestResult('');
    setTestSelectedIndex(null);
    setTestSpinning(true);
    const selected = weightedPick(rewards);
    window.setTimeout(() => {
      setTestSelectedIndex(selected);
      setTestSpinning(false);
      setTestResult(rewards[selected]?.label || 'Reward');
    }, 1200);
  }

  async function copyCustomerLink() {
    if (!promotion || !restaurant) return;
    const link = `${window.location.origin}/play/${restaurant.slug}/${promotion.slug}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6 font-black text-stone-700">Loading builder...</main>;
  if (error && !promotion) return <main className="min-h-screen bg-[#FFF8F0] p-6 font-black text-red-700">{error}</main>;
  if (!promotion || !restaurant) return <main className="min-h-screen bg-[#FFF8F0] p-6 font-black text-red-700">Promotion could not be loaded.</main>;

  const address = [restaurant.address_line1, restaurant.city].filter(Boolean).join(', ') || 'Address not added';
  const playPath = `/play/${restaurant.slug}/${promotion.slug}`;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F] sm:px-6">
      <section className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <a href={`/admin/promotions?slug=${restaurant.slug}`} className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Back</a>
          <button onClick={copyCustomerLink} className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">{copied ? 'Copied!' : 'Copy Link'}</button>
        </div>

        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-5 text-white shadow-2xl shadow-orange-200 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_.9fr] lg:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-white/75">SpinBite builder</p>
              <h1 className="mt-3 text-4xl font-black leading-tight sm:text-6xl">{promotion.name}</h1>
              <div className="mt-5 rounded-3xl bg-white/15 p-4 backdrop-blur">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-white/70">Restaurant location</p>
                <p className="mt-1 text-2xl font-black">{restaurant.name}</p>
                <p className="mt-1 text-sm font-bold text-white/85">{address}</p>
                <p className="mt-1 break-all text-xs font-black text-white/70">{playPath}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#1F1F1F]">Status: {promotion.status}</span>
                <span className="rounded-full bg-white/20 px-4 py-2 text-sm font-black">Spin Wheel</span>
                <span className="rounded-full bg-white/20 px-4 py-2 text-sm font-black">Draft until launch</span>
              </div>
            </div>
            <div className="rounded-[2rem] bg-white/95 p-4 text-[#1F1F1F] shadow-2xl">
              <SpinWheelPreview rewards={rewards} spinning={testSpinning} selectedIndex={testSelectedIndex} />
            </div>
          </div>
        </section>

        {error && <div className="rounded-3xl bg-red-50 p-4 text-sm font-black text-red-700">{error}</div>}
        {saved && <div className="rounded-3xl bg-green-50 p-4 text-sm font-black text-green-700">Draft saved.</div>}

        <section className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] bg-white p-5 shadow-xl">
              <p className="text-sm font-black uppercase text-[#FF6B00]">Step 1: Select Menu</p>
              <select value={selectedMenuId} onChange={(event) => setSelectedMenuId(event.target.value)} className="mt-3 w-full rounded-2xl border border-stone-200 px-4 py-4 font-black outline-none focus:border-[#FF6B00]">
                {menus.length === 0 && <option value="">No menus found</option>}
                {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
              </select>
            </div>

            <div className="rounded-[2rem] bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black uppercase text-[#FF6B00]">Step 2: Add Rewards</p>
                  <p className="mt-2 text-sm font-bold text-stone-600">Choose 6–10 menu rewards. Add custom rewards only when needed.</p>
                </div>
                <button onClick={addCustomReward} disabled={rewards.length >= MAX_REWARDS} className="rounded-2xl bg-[#1F1F1F] px-4 py-3 text-sm font-black text-white disabled:bg-stone-300">Custom</button>
              </div>

              <div className="mt-4 rounded-2xl bg-orange-50 p-3 text-sm font-black text-[#FF6B00]">{rewardStatus}</div>
              <div className="mt-4 space-y-3">
                {menuItems.map((item) => {
                  const added = rewards.some((reward) => reward.menu_item_id === item.id);
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border border-stone-100 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black">{item.name}</p>
                        <p className="text-sm font-bold text-stone-500">{formatMoney(item.price)}</p>
                      </div>
                      <button onClick={() => addMenuItem(item)} disabled={added || rewards.length >= MAX_REWARDS} className="rounded-full bg-[#FF6B00] px-4 py-2 text-sm font-black text-white disabled:bg-stone-300">{added ? 'Added' : 'Add'}</button>
                    </div>
                  );
                })}
                {menuItems.length === 0 && <p className="rounded-2xl bg-stone-50 p-4 text-sm font-bold text-stone-500">No items found in this menu.</p>}
              </div>
            </div>

            <div className="rounded-[2rem] bg-white p-5 shadow-xl">
              <p className="text-sm font-black uppercase text-[#FF6B00]">Step 4: Test Mode</p>
              <p className="mt-2 rounded-2xl bg-yellow-50 p-3 text-sm font-black text-yellow-800">TEST MODE — no coupons issued.</p>
              <button onClick={runTestSpin} disabled={rewards.length === 0 || testSpinning} className="mt-4 w-full rounded-3xl bg-[#1F1F1F] px-5 py-5 text-xl font-black text-white disabled:bg-stone-300">{testSpinning ? 'Spinning...' : 'Run Test Spin'}</button>
              {testResult && <p className="mt-4 rounded-2xl bg-green-50 p-4 text-sm font-black text-green-700">Test result: {testResult}</p>}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] bg-white p-5 shadow-xl">
              <p className="text-sm font-black uppercase text-[#FF6B00]">Step 3: Configure Rewards</p>
              <div className="mt-4 space-y-4">
                {rewards.map((reward, index) => (
                  <div key={reward.temp_id} className="rounded-3xl bg-stone-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase text-stone-400">Segment {index + 1}</p>
                        <p className="text-xl font-black">{reward.label}</p>
                      </div>
                      <button onClick={() => removeReward(reward.temp_id)} className="rounded-full bg-white px-3 py-2 text-xs font-black text-red-600 shadow-sm">Remove</button>
                    </div>

                    {reward.menu_item_id === null && (
                      <input value={reward.label} onChange={(event) => updateReward(reward.temp_id, { label: event.target.value, custom_name: event.target.value })} className="mt-4 w-full rounded-2xl border border-stone-200 px-4 py-3 font-bold" />
                    )}

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-black text-stone-700">Reward Type
                        <select value={reward.reward_type} onChange={(event) => updateReward(reward.temp_id, { reward_type: event.target.value as RewardType })} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold">
                          <option value="free">Free item</option>
                          <option value="discount">% Discount</option>
                          <option value="custom">Custom</option>
                        </select>
                      </label>
                      {reward.reward_type === 'discount' && (
                        <label className="text-sm font-black text-stone-700">Discount %
                          <input type="number" min={1} max={100} value={reward.reward_value || ''} onChange={(event) => updateReward(reward.temp_id, { reward_value: Number(event.target.value) })} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" />
                        </label>
                      )}
                      <label className="text-sm font-black text-stone-700">Daily Limit
                        <input type="number" min={1} value={reward.daily_limit} onChange={(event) => updateReward(reward.temp_id, { daily_limit: Number(event.target.value) })} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" />
                      </label>
                      <label className="text-sm font-black text-stone-700">Weight
                        <select value={reward.weight_label} onChange={(event) => updateReward(reward.temp_id, { weight_label: event.target.value as WeightLabel })} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold">
                          <option value="Common">Common</option>
                          <option value="Normal">Normal</option>
                          <option value="Rare">Rare</option>
                        </select>
                      </label>
                    </div>
                  </div>
                ))}
                {rewards.length === 0 && <p className="rounded-2xl bg-stone-50 p-4 text-sm font-bold text-stone-500">Add rewards from the selected menu to configure the wheel.</p>}
              </div>
            </div>

            <div className="rounded-[2rem] bg-white p-5 shadow-xl">
              <p className="text-sm font-black uppercase text-[#FF6B00]">Step 5: Promotion Rules</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-black text-stone-700">Daily Promotion Limit
                  <input type="number" min={1} value={dailyRedeemLimit} onChange={(event) => { setSaved(false); setDailyRedeemLimit(Number(event.target.value)); }} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" />
                </label>
                <label className="text-sm font-black text-stone-700">Max Spins Per Customer
                  <input type="number" min={1} value={maxSpins} onChange={(event) => { setSaved(false); setMaxSpins(Number(event.target.value)); }} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" />
                </label>
                <label className="text-sm font-black text-stone-700">Start Date/Time
                  <input type="datetime-local" value={startsAt} onChange={(event) => { setSaved(false); setStartsAt(event.target.value); }} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" />
                </label>
                <label className="text-sm font-black text-stone-700">End Date/Time
                  <input type="datetime-local" value={endsAt} onChange={(event) => { setSaved(false); setEndsAt(event.target.value); }} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" />
                </label>
              </div>
              <label className="mt-4 flex items-center gap-3 rounded-2xl bg-stone-50 p-4 text-sm font-black">
                <input type="checkbox" checked={stopOnWin} onChange={(event) => { setSaved(false); setStopOnWin(event.target.checked); }} className="h-5 w-5" />
                Stop on win
              </label>
            </div>

            <div className="rounded-[2rem] bg-white p-5 shadow-xl">
              <p className="text-sm font-black uppercase text-[#FF6B00]">Step 6: Launch</p>
              {validationErrors.length > 0 ? (
                <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
                  <p className="font-black">Fix before launch:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">{validationErrors.map((message) => <li key={message}>{message}</li>)}</ul>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl bg-green-50 p-4 text-sm font-black text-green-700">Ready to launch.</div>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button onClick={saveDraft} disabled={saving || launching} className="rounded-3xl bg-white px-5 py-5 text-lg font-black text-[#FF6B00] shadow ring-1 ring-orange-100 disabled:bg-stone-200">{saving ? 'Saving...' : 'Save Draft'}</button>
                <button onClick={launchPromotion} disabled={!launchReady || saving || launching} className="rounded-3xl bg-green-600 px-5 py-5 text-lg font-black text-white shadow-xl disabled:bg-stone-300">{launching ? 'Launching...' : 'Launch Promotion'}</button>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

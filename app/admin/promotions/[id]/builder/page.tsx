'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import confetti from 'canvas-confetti';
import { createClient } from '@/lib/supabase/client';
import SpinWheelPreview from '@/components/admin/SpinWheelPreview';

type RewardType = 'free' | 'discount' | 'custom';
type WeightLabel = 'Common' | 'Normal' | 'Rare';

type Reward = {
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

type BuilderMenu = {
  id: string;
  name: string;
  menu_type?: string | null;
  restaurant_id: string;
  item_count?: number;
};

const MIN = 6;
const MAX = 10;
const WEIGHTS: Record<WeightLabel, number> = { Common: 60, Normal: 30, Rare: 10 };

const tempId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

const money = (value?: number | null) =>
  value == null
    ? ''
    : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);

const weightLabel = (weight?: number | null): WeightLabel => {
  if (weight === 60) return 'Common';
  if (weight === 10) return 'Rare';
  return 'Normal';
};

const menuKey = (menu: Partial<BuilderMenu>) => (menu.menu_type || menu.name || '').toLowerCase().trim();

function pickWeighted(list: Reward[]) {
  let random = Math.random() * list.reduce((sum, item) => sum + item.weight, 0);
  for (let i = 0; i < list.length; i += 1) {
    random -= list[i].weight;
    if (random <= 0) return i;
  }
  return list.length - 1;
}

function dedupeMenus(menus: BuilderMenu[]) {
  const byKey = new Map<string, BuilderMenu>();
  menus.forEach((menu) => {
    const key = menuKey(menu) || menu.id;
    const existing = byKey.get(key);
    if (!existing || (menu.item_count || 0) > (existing.item_count || 0)) byKey.set(key, menu);
  });
  return Array.from(byKey.values());
}

export default function PromotionBuilderPage() {
  const { id } = useParams() as { id: string };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchSuccess, setLaunchSuccess] = useState(false);
  const [menuNotice, setMenuNotice] = useState('');

  const [promotion, setPromotion] = useState<any>(null);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [menus, setMenus] = useState<BuilderMenu[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [menuId, setMenuId] = useState('');
  const [rewards, setRewards] = useState<Reward[]>([]);

  const [dailyLimit, setDailyLimit] = useState(50);
  const [maxSpins, setMaxSpins] = useState(3);
  const [couponExpiryMinutes, setCouponExpiryMinutes] = useState(20);
  const [stopOnWin, setStopOnWin] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      const supabase = createClient();

      const promotionResult = await supabase
        .from('promotions')
        .select('id,restaurant_id,name,slug,game_type,status,daily_redeem_limit,max_spins,coupon_expiry_minutes,stop_on_win,starts_at,ends_at')
        .eq('id', id)
        .single();

      if (promotionResult.error || !promotionResult.data) {
        setError(promotionResult.error?.message || 'Promotion not found.');
        setLoading(false);
        return;
      }

      const loadedPromotion = promotionResult.data;
      setPromotion(loadedPromotion);
      setLaunchSuccess(loadedPromotion.status === 'active');
      setDailyLimit(loadedPromotion.daily_redeem_limit || 50);
      setMaxSpins(loadedPromotion.max_spins || 3);
      setCouponExpiryMinutes(loadedPromotion.coupon_expiry_minutes || 20);
      setStopOnWin(loadedPromotion.stop_on_win ?? true);
      setStartsAt(loadedPromotion.starts_at ? loadedPromotion.starts_at.slice(0, 16) : '');
      setEndsAt(loadedPromotion.ends_at ? loadedPromotion.ends_at.slice(0, 16) : '');

      const restaurantResult = await supabase
        .from('restaurants')
        .select('id,name,slug,address_line1,city,owner_id')
        .eq('id', loadedPromotion.restaurant_id)
        .single();
      if (restaurantResult.data) setRestaurant(restaurantResult.data);

      const menuResult = await supabase
        .from('menus')
        .select('id,name,menu_type,restaurant_id')
        .eq('restaurant_id', loadedPromotion.restaurant_id)
        .order('name');

      const rawMenus = (menuResult.data || []) as BuilderMenu[];
      const itemData = await supabase.from('menu_items').select('id,menu_id').eq('restaurant_id', loadedPromotion.restaurant_id);
      const counts = new Map<string, number>();
      (itemData.data || []).forEach((item: any) => counts.set(item.menu_id, (counts.get(item.menu_id) || 0) + 1));
      const loadedMenus = dedupeMenus(rawMenus.map((menu) => ({ ...menu, item_count: counts.get(menu.id) || 0 })));
      setMenus(loadedMenus);
      if (loadedMenus[0]) setMenuId(loadedMenus[0].id);

      const rewardResult = await supabase
        .from('promotion_rewards')
        .select('id,promotion_id,restaurant_id,menu_item_id,custom_name,reward_type,reward_value,daily_limit,weight')
        .eq('promotion_id', id)
        .order('created_at', { ascending: false });

      const rawRewards = rewardResult.data || [];
      const menuItemIds = rawRewards.map((item: any) => item.menu_item_id).filter(Boolean);
      let namesById: Record<string, string> = {};

      if (menuItemIds.length) {
        const itemResult = await supabase.from('menu_items').select('id,name').in('id', menuItemIds);
        namesById = Object.fromEntries((itemResult.data || []).map((item: any) => [item.id, item.name]));
      }

      setRewards(
        rawRewards.map((item: any) => ({
          temp_id: tempId(),
          id: item.id,
          promotion_id: item.promotion_id,
          restaurant_id: item.restaurant_id,
          menu_item_id: item.menu_item_id,
          custom_name: item.custom_name,
          label: item.custom_name || namesById[item.menu_item_id] || 'Reward',
          reward_type: item.reward_type || 'discount',
          reward_value: item.reward_value,
          daily_limit: item.daily_limit || 10,
          weight_label: weightLabel(item.weight),
          weight: item.weight || 30,
        }))
      );

      setLoading(false);
    }

    if (id) load();
  }, [id]);

  useEffect(() => {
    async function loadItems() {
      setMenuNotice('');
      if (!menuId) {
        setMenuItems([]);
        return;
      }

      const supabase = createClient();
      const selectedMenu = menus.find((menu) => menu.id === menuId);
      const result = await supabase
        .from('menu_items')
        .select('id,menu_id,restaurant_id,name,price')
        .eq('menu_id', menuId)
        .order('name');

      if ((result.data || []).length > 0) {
        setMenuItems(result.data || []);
        return;
      }

      if (!restaurant || !selectedMenu) {
        setMenuItems([]);
        return;
      }

      const siblingRestaurants = await supabase
        .from('restaurants')
        .select('id,name,owner_id')
        .eq('owner_id', restaurant.owner_id)
        .eq('name', restaurant.name)
        .neq('id', restaurant.id);

      const siblingIds = (siblingRestaurants.data || []).map((item: any) => item.id);
      if (!siblingIds.length) {
        setMenuItems([]);
        return;
      }

      const siblingMenus = await supabase
        .from('menus')
        .select('id,name,menu_type,restaurant_id')
        .in('restaurant_id', siblingIds);

      const matchingSiblingMenuIds = ((siblingMenus.data || []) as BuilderMenu[])
        .filter((menu) => menuKey(menu) === menuKey(selectedMenu) || menu.name.toLowerCase().trim() === selectedMenu.name.toLowerCase().trim())
        .map((menu) => menu.id);

      if (!matchingSiblingMenuIds.length) {
        setMenuItems([]);
        return;
      }

      const siblingItems = await supabase
        .from('menu_items')
        .select('name,price')
        .in('menu_id', matchingSiblingMenuIds)
        .order('name');

      const sourceItems = siblingItems.data || [];
      if (!sourceItems.length) {
        setMenuItems([]);
        return;
      }

      const uniqueByName = new Map<string, any>();
      sourceItems.forEach((item: any) => {
        const key = item.name.toLowerCase().trim();
        if (!uniqueByName.has(key)) uniqueByName.set(key, item);
      });

      const insertResult = await supabase.from('menu_items').insert(
        Array.from(uniqueByName.values()).map((item: any) => ({
          name: item.name,
          price: item.price,
          menu_id: menuId,
          restaurant_id: restaurant.id,
        }))
      );

      if (insertResult.error) {
        setMenuItems([]);
        setMenuNotice('This location has an empty menu. Add menu items or copy the menu from another location.');
        return;
      }

      const copied = await supabase
        .from('menu_items')
        .select('id,menu_id,restaurant_id,name,price')
        .eq('menu_id', menuId)
        .order('name');

      setMenuItems(copied.data || []);
      setMenuNotice(`Copied ${(copied.data || []).length} menu items from another ${restaurant.name} location.`);
    }

    loadItems();
  }, [menuId, menus, restaurant]);

  const errors = useMemo(() => {
    const messages: string[] = [];
    if (rewards.length < MIN) messages.push(`Add at least ${MIN} rewards.`);
    if (rewards.length > MAX) messages.push(`Use no more than ${MAX} rewards.`);
    if (!dailyLimit || dailyLimit < 1) messages.push('Daily promotion limit is required.');
    if (!maxSpins || maxSpins < 1) messages.push('Max spins per customer is required.');
    if (!couponExpiryMinutes || couponExpiryMinutes < 1) messages.push('Coupon expiry time is required.');
    if (!startsAt) messages.push('Start date/time is required.');
    if (!endsAt) messages.push('End date/time is required.');
    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
      messages.push('End date/time must be after start date/time.');
    }

    rewards.forEach((reward, index) => {
      if (!reward.label.trim()) messages.push(`Reward ${index + 1} needs a name.`);
      if (reward.reward_type === 'discount' && (!reward.reward_value || reward.reward_value < 1 || reward.reward_value > 100)) {
        messages.push(`Reward ${index + 1} needs a valid discount.`);
      }
      if (!reward.daily_limit || reward.daily_limit < 1) messages.push(`Reward ${index + 1} needs a daily limit.`);
    });

    return messages;
  }, [rewards, dailyLimit, maxSpins, couponExpiryMinutes, startsAt, endsAt]);

  function markDirty() {
    setSaved(false);
    setLaunchSuccess(false);
    if (promotion?.status === 'active') setPromotion({ ...promotion, status: 'draft' });
  }

  function addItem(item: any) {
    if (!promotion || !restaurant || rewards.length >= MAX || rewards.some((reward) => reward.menu_item_id === item.id)) return;
    markDirty();
    setRewards((current) => [{ temp_id: tempId(), promotion_id: promotion.id, restaurant_id: restaurant.id, menu_item_id: item.id, custom_name: null, label: item.name, reward_type: 'discount', reward_value: 10, daily_limit: 10, weight_label: 'Normal', weight: 30 }, ...current]);
  }

  function addCustom() {
    if (!promotion || !restaurant || rewards.length >= MAX) return;
    markDirty();
    setRewards((current) => [{ temp_id: tempId(), promotion_id: promotion.id, restaurant_id: restaurant.id, menu_item_id: null, custom_name: 'Custom Reward', label: 'Custom Reward', reward_type: 'custom', reward_value: null, daily_limit: 10, weight_label: 'Normal', weight: 30 }, ...current]);
  }

  function updateReward(key: string, updates: Partial<Reward>) {
    markDirty();
    setRewards((current) => current.map((reward) => {
      if (reward.temp_id !== key) return reward;
      const updated = { ...reward, ...updates };
      if (updates.weight_label) updated.weight = WEIGHTS[updates.weight_label];
      if (!updated.menu_item_id) updated.custom_name = updated.label;
      if (updated.reward_type !== 'discount') updated.reward_value = null;
      return updated;
    }));
  }

  function removeReward(key: string) {
    markDirty();
    setRewards((current) => current.filter((reward) => reward.temp_id !== key));
  }

  async function saveDraft() {
    if (!promotion || !restaurant) return false;
    setSaving(true); setSaved(false); setLaunchSuccess(false); setError('');
    const supabase = createClient();
    const promotionUpdate = await supabase.from('promotions').update({ daily_redeem_limit: dailyLimit, max_spins: maxSpins, coupon_expiry_minutes: couponExpiryMinutes, stop_on_win: stopOnWin, starts_at: startsAt ? new Date(startsAt).toISOString() : null, ends_at: endsAt ? new Date(endsAt).toISOString() : null, status: 'draft' }).eq('id', promotion.id);
    if (promotionUpdate.error) { setError(promotionUpdate.error.message); setSaving(false); return false; }
    const deleteRewards = await supabase.from('promotion_rewards').delete().eq('promotion_id', promotion.id);
    if (deleteRewards.error) { setError(deleteRewards.error.message); setSaving(false); return false; }
    if (rewards.length) {
      const insertRewards = await supabase.from('promotion_rewards').insert(rewards.map((reward) => ({ promotion_id: promotion.id, restaurant_id: restaurant.id, menu_item_id: reward.menu_item_id, custom_name: reward.menu_item_id ? null : reward.label, reward_type: reward.reward_type, reward_value: reward.reward_type === 'discount' ? reward.reward_value : null, daily_limit: reward.daily_limit, weight: reward.weight })));
      if (insertRewards.error) { setError(insertRewards.error.message); setSaving(false); return false; }
    }
    setPromotion({ ...promotion, status: 'draft', coupon_expiry_minutes: couponExpiryMinutes }); setSaving(false); setSaved(true); return true;
  }

  async function launch() {
    if (errors.length || !promotion) return;
    setLaunching(true); setSaved(false); setLaunchSuccess(false); setError('');
    const draftSaved = await saveDraft();
    if (!draftSaved) { setLaunching(false); return; }
    const launchResult = await createClient().from('promotions').update({ status: 'active' }).eq('id', promotion.id);
    if (launchResult.error) { setError(launchResult.error.message); setLaunching(false); return; }
    setPromotion({ ...promotion, status: 'active', coupon_expiry_minutes: couponExpiryMinutes }); setSaved(false); setLaunchSuccess(true); setLaunching(false); confetti({ particleCount: 220, spread: 110, origin: { y: 0.58 } });
  }

  function testSpin() {
    if (!rewards.length || spinning) return;
    const index = pickWeighted(rewards);
    const segmentAngle = 360 / rewards.length;
    const finalRotation = rotation + 5 * 360 + (-(index * segmentAngle) - (rotation % 360));
    setResult(''); setSpinning(true); setRotation(finalRotation);
    setTimeout(() => { setSpinning(false); setResult(rewards[index]?.label || 'Reward'); confetti({ particleCount: 160, spread: 95, origin: { y: 0.62 } }); }, 2900);
  }

  async function copyLink() {
    const link = `${window.location.origin}/play/${restaurant.slug}/${promotion.slug}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6 font-black text-stone-700">Loading builder...</main>;
  if (!promotion || !restaurant) return <main className="min-h-screen bg-[#FFF8F0] p-6 font-black text-red-700">{error || 'Promotion could not be loaded.'}</main>;

  const address = [restaurant.address_line1, restaurant.city].filter(Boolean).join(', ') || 'Address not added';
  const play = `/play/${restaurant.slug}/${promotion.slug}`;
  const full = typeof window === 'undefined' ? play : `${window.location.origin}${play}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(full)}`;
  const rewardStatus = rewards.length >= MIN ? `${rewards.length} / ${MAX} rewards added — minimum met ✅` : `${rewards.length} / ${MAX} rewards added — add ${MIN - rewards.length} more`;
  const isLive = promotion.status === 'active';

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#FFF8F0] px-3 py-6 text-[#1F1F1F] sm:px-6">
      <section className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4"><a href={`/admin/promotions?slug=${restaurant.slug}`} className="rounded-full bg-white px-5 py-3 text-sm font-black text-[#FF6B00] shadow">Back</a><button onClick={copyLink} className="rounded-full bg-white px-5 py-3 text-sm font-black text-[#FF6B00] shadow">{copied ? 'Copied!' : 'Copy Link'}</button></div>
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-4 text-white shadow-2xl shadow-orange-200 sm:p-8"><div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_.82fr] lg:items-center"><div className="min-w-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-2xl">🎯</span><span className="text-2xl font-black leading-none">SpinBite</span></div><p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-white/75">Promotion Builder</p></div><span className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-black capitalize text-[#1F1F1F] shadow">{promotion.status}</span></div><h1 className="mt-5 break-words text-4xl font-black leading-tight sm:text-6xl">{promotion.name}</h1><div className="mt-5 rounded-3xl bg-white/15 p-4 backdrop-blur"><p className="text-xs font-black uppercase tracking-[0.16em] text-white/70">Restaurant location</p><p className="mt-1 break-words text-2xl font-black">{restaurant.name}</p><p className="mt-1 text-sm font-bold text-white/85">{address}</p><div className="mt-3 rounded-2xl bg-white/15 p-3"><p className="break-all text-xs font-black text-white/85">{full}</p><button onClick={copyLink} className="mt-2 w-full rounded-full bg-white px-4 py-2 text-xs font-black text-[#FF6B00]">{copied ? 'Copied!' : 'Copy Promotion Link'}</button></div></div></div><div className="min-w-0 rounded-[2rem] bg-white/90 p-3 text-[#1F1F1F] shadow-2xl ring-1 ring-white/50 sm:p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-stone-400">Live wheel</p>{result && <p className="text-sm font-black text-green-700">🎉 {result}</p>}</div><button onClick={testSpin} disabled={!rewards.length || spinning} className="rounded-full bg-[#1F1F1F] px-5 py-2 text-sm font-black text-white shadow-lg disabled:bg-stone-300">{spinning ? 'Spinning...' : 'Test'}</button></div><SpinWheelPreview rewards={rewards} rotation={rotation} spinning={spinning} /></div></div></section>
        {error && <div className="rounded-3xl bg-red-50 p-4 text-sm font-black text-red-700">{error}</div>}{saved && <div className="rounded-3xl bg-green-50 p-4 text-sm font-black text-green-700">Draft saved.</div>}{launchSuccess && <div className="rounded-3xl bg-green-50 p-4 text-sm font-black text-green-800">🎉 Promotion is live. The customer link and QR code are ready below.</div>}
        <div className="rounded-[2rem] bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Step 1: Select Menu</p><select value={menuId} onChange={(event) => setMenuId(event.target.value)} className="mt-3 w-full rounded-2xl border border-stone-200 px-4 py-4 font-black outline-none focus:border-[#FF6B00]"><option value="">Select a menu</option>{menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}{typeof menu.item_count === 'number' ? ` (${menu.item_count} items)` : ''}</option>)}</select>{menuNotice && <p className="mt-3 rounded-2xl bg-green-50 p-3 text-sm font-black text-green-700">{menuNotice}</p>}</div>
        <div className="rounded-[2rem] bg-white p-5 shadow-xl"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black uppercase text-[#FF6B00]">Step 2: Add Rewards</p><p className="mt-2 text-sm font-bold text-stone-600">Choose 6–10 menu rewards. Add custom rewards only when needed.</p></div><button onClick={addCustom} disabled={rewards.length >= MAX} className="rounded-2xl bg-[#1F1F1F] px-4 py-3 text-sm font-black text-white disabled:bg-stone-300">Custom</button></div><div className="mt-4 rounded-2xl bg-orange-50 p-3 text-sm font-black text-[#FF6B00]">{rewardStatus}</div><div className="mt-4 grid gap-3 md:grid-cols-2">{menuItems.map((item) => { const added = rewards.some((reward) => reward.menu_item_id === item.id); return <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border border-stone-100 p-4"><div className="min-w-0"><p className="truncate text-lg font-black">{item.name}</p><p className="text-sm font-bold text-stone-500">{money(item.price)}</p></div><button onClick={() => addItem(item)} disabled={added || rewards.length >= MAX} className="rounded-full bg-[#FF6B00] px-4 py-2 text-sm font-black text-white disabled:bg-stone-300">{added ? 'Added' : 'Add'}</button></div>; })}{!menuItems.length && <p className="rounded-2xl bg-stone-50 p-4 text-sm font-bold text-stone-500 md:col-span-2">No items found in this menu. If this is a new location, the builder will try to copy items from another matching restaurant location.</p>}</div></div>
        <div className="rounded-[2rem] bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Step 3: Configure Rewards</p><div className="mt-4 grid gap-4 lg:grid-cols-2">{rewards.map((reward, index) => <div key={reward.temp_id} className="rounded-3xl bg-stone-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-stone-400">Segment {index + 1}</p><p className="text-xl font-black">{reward.label}</p></div><button onClick={() => removeReward(reward.temp_id)} className="rounded-full bg-white px-3 py-2 text-xs font-black text-red-600 shadow-sm">Remove</button></div>{!reward.menu_item_id && <input value={reward.label} onChange={(event) => updateReward(reward.temp_id, { label: event.target.value, custom_name: event.target.value })} className="mt-4 w-full rounded-2xl border border-stone-200 px-4 py-3 font-bold" />}<div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-black text-stone-700">Reward Type<select value={reward.reward_type} onChange={(event) => updateReward(reward.temp_id, { reward_type: event.target.value as RewardType })} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold"><option value="free">Free item</option><option value="discount">% Discount</option><option value="custom">Custom</option></select></label>{reward.reward_type === 'discount' && <label className="text-sm font-black text-stone-700">Discount %<input type="number" min={1} max={100} value={reward.reward_value || ''} onChange={(event) => updateReward(reward.temp_id, { reward_value: Number(event.target.value) })} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" /></label>}<label className="text-sm font-black text-stone-700">Daily Limit<input type="number" min={1} value={reward.daily_limit} onChange={(event) => updateReward(reward.temp_id, { daily_limit: Number(event.target.value) })} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" /></label><label className="text-sm font-black text-stone-700">Weight<select value={reward.weight_label} onChange={(event) => updateReward(reward.temp_id, { weight_label: event.target.value as WeightLabel })} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold"><option value="Common">Common</option><option value="Normal">Normal</option><option value="Rare">Rare</option></select></label></div></div>)}{!rewards.length && <p className="rounded-2xl bg-stone-50 p-4 text-sm font-bold text-stone-500 lg:col-span-2">Add rewards from the selected menu to configure the wheel.</p>}</div></div>
        <div className="rounded-[2rem] bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Step 4: Promotion Rules</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-black text-stone-700">Daily Promotion Limit<input type="number" min={1} value={dailyLimit} onChange={(event) => { markDirty(); setDailyLimit(Number(event.target.value)); }} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" /></label><label className="text-sm font-black text-stone-700">Max Spins Per Customer<input type="number" min={1} value={maxSpins} onChange={(event) => { markDirty(); setMaxSpins(Number(event.target.value)); }} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" /></label><label className="text-sm font-black text-stone-700">Coupon Expiry (minutes)<input type="number" min={1} value={couponExpiryMinutes} onChange={(event) => { markDirty(); setCouponExpiryMinutes(Number(event.target.value)); }} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" /></label><label className="text-sm font-black text-stone-700">Start Date/Time<input type="datetime-local" value={startsAt} onChange={(event) => { markDirty(); setStartsAt(event.target.value); }} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" /></label><label className="text-sm font-black text-stone-700">End Date/Time<input type="datetime-local" value={endsAt} onChange={(event) => { markDirty(); setEndsAt(event.target.value); }} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" /></label></div><label className="mt-4 flex items-center gap-3 rounded-2xl bg-stone-50 p-4 text-sm font-black"><input type="checkbox" checked={stopOnWin} onChange={(event) => { markDirty(); setStopOnWin(event.target.checked); }} className="h-5 w-5" />Stop on win</label></div>
        <div className="rounded-[2rem] bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Step 5: Launch</p>{isLive ? <div className="mt-4 rounded-2xl bg-green-50 p-4 text-sm font-black text-green-700">Live now. Customers can play from the link or QR code below.</div> : errors.length ? <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700"><p className="font-black">Fix before launch:</p><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((message) => <li key={message}>{message}</li>)}</ul></div> : <div className="mt-4 rounded-2xl bg-green-50 p-4 text-sm font-black text-green-700">Ready to launch.</div>}<div className="mt-4 grid gap-3 sm:grid-cols-2"><button onClick={saveDraft} disabled={saving || launching} className="rounded-3xl bg-white px-5 py-5 text-lg font-black text-[#FF6B00] shadow ring-1 ring-orange-100 disabled:bg-stone-200">{saving ? 'Saving...' : 'Save Draft'}</button><button onClick={launch} disabled={!!errors.length || saving || launching} className="rounded-3xl bg-green-600 px-5 py-5 text-lg font-black text-white shadow-xl disabled:bg-stone-300">{launching ? 'Launching...' : isLive ? 'Re-Launch Promotion' : 'Launch Promotion'}</button></div>{isLive && <div className="mt-6 rounded-3xl border border-green-100 bg-green-50 p-5 text-center"><p className="text-2xl font-black text-green-800">Promotion is live</p><p className="mt-2 break-all text-sm font-bold text-green-700">{full}</p><div className="mt-4 inline-block rounded-3xl bg-white p-4 shadow"><img src={qrUrl} alt="Promotion QR code" className="h-56 w-56" /></div><button onClick={copyLink} className="mt-4 w-full rounded-2xl bg-[#1F1F1F] px-5 py-4 text-sm font-black text-white">{copied ? 'Copied!' : 'Copy Live Link'}</button></div>}</div>
      </section>
    </main>
  );
}

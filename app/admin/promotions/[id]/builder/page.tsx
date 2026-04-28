'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import confetti from 'canvas-confetti';
import { createClient } from '@/lib/supabase/client';
import SpinWheelPreview, { getWeightedSliceMidpoint } from '@/components/admin/SpinWheelPreview';

type RewardType = 'free' | 'discount' | 'custom';
type WeightLabel = 'Common' | 'Normal' | 'Rare';
type Reward = { temp_id: string; id?: string; promotion_id: string; restaurant_id: string; menu_item_id: string | null; custom_name: string | null; label: string; reward_type: RewardType; reward_value: number | null; daily_limit: number; weight_label: WeightLabel; weight: number };

const MIN = 6;
const MAX = 10;
const WEIGHTS: Record<WeightLabel, number> = { Common: 60, Normal: 30, Rare: 10 };
const tid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const money = (v?: number | null) => (v == null ? '' : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(v));
const weightLabel = (w?: number | null): WeightLabel => (w === 60 ? 'Common' : w === 10 ? 'Rare' : 'Normal');
function pick(list: Reward[]) { let r = Math.random() * list.reduce((s, x) => s + x.weight, 0); for (let i = 0; i < list.length; i++) { r -= list[i].weight; if (r <= 0) return i; } return list.length - 1; }

export default function PromotionBuilderPage() {
  const { id } = useParams() as { id: string };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [promotion, setPromotion] = useState<any>(null);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [menus, setMenus] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [menuId, setMenuId] = useState('');
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [dailyLimit, setDailyLimit] = useState(50);
  const [maxSpins, setMaxSpins] = useState(3);
  const [stopOnWin, setStopOnWin] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true); setError('');
      const supabase = createClient();
      const pr = await supabase.from('promotions').select('id,restaurant_id,name,slug,game_type,status,daily_redeem_limit,max_spins,stop_on_win,starts_at,ends_at').eq('id', id).single();
      if (pr.error || !pr.data) { setError(pr.error?.message || 'Promotion not found.'); setLoading(false); return; }
      const p = pr.data; setPromotion(p); setDailyLimit(p.daily_redeem_limit || 50); setMaxSpins(p.max_spins || 3); setStopOnWin(p.stop_on_win ?? true); setStartsAt(p.starts_at ? p.starts_at.slice(0, 16) : ''); setEndsAt(p.ends_at ? p.ends_at.slice(0, 16) : '');
      const rr = await supabase.from('restaurants').select('id,name,slug,address_line1,city').eq('id', p.restaurant_id).single(); if (rr.data) setRestaurant(rr.data);
      const mr = await supabase.from('menus').select('id,name,restaurant_id').eq('restaurant_id', p.restaurant_id).order('name'); const ms = mr.data || []; setMenus(ms); if (ms[0]) setMenuId(ms[0].id);
      const rw = await supabase.from('promotion_rewards').select('id,promotion_id,restaurant_id,menu_item_id,custom_name,reward_type,reward_value,daily_limit,weight').eq('promotion_id', id).order('created_at', { ascending: false });
      const raw = rw.data || []; const ids = raw.map((x: any) => x.menu_item_id).filter(Boolean); let names: Record<string, string> = {};
      if (ids.length) { const ir = await supabase.from('menu_items').select('id,name').in('id', ids); names = Object.fromEntries((ir.data || []).map((x: any) => [x.id, x.name])); }
      setRewards(raw.map((x: any) => ({ temp_id: tid(), id: x.id, promotion_id: x.promotion_id, restaurant_id: x.restaurant_id, menu_item_id: x.menu_item_id, custom_name: x.custom_name, label: x.custom_name || names[x.menu_item_id] || 'Reward', reward_type: x.reward_type || 'discount', reward_value: x.reward_value, daily_limit: x.daily_limit || 10, weight_label: weightLabel(x.weight), weight: x.weight || 30 })));
      setLoading(false);
    }
    if (id) load();
  }, [id]);

  useEffect(() => {
    async function loadItems() { if (!menuId) { setMenuItems([]); return; } const r = await createClient().from('menu_items').select('id,menu_id,name,price').eq('menu_id', menuId).order('name'); setMenuItems(r.data || []); }
    loadItems();
  }, [menuId]);

  const errors = useMemo(() => {
    const e: string[] = [];
    if (rewards.length < MIN) e.push(`Add at least ${MIN} rewards.`);
    if (rewards.length > MAX) e.push(`Use no more than ${MAX} rewards.`);
    if (!dailyLimit || dailyLimit < 1) e.push('Daily promotion limit is required.');
    if (!maxSpins || maxSpins < 1) e.push('Max spins per customer is required.');
    if (!startsAt) e.push('Start date/time is required.');
    if (!endsAt) e.push('End date/time is required.');
    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) e.push('End date/time must be after start date/time.');
    rewards.forEach((r, i) => { if (!r.label.trim()) e.push(`Reward ${i + 1} needs a name.`); if (r.reward_type === 'discount' && (!r.reward_value || r.reward_value < 1 || r.reward_value > 100)) e.push(`Reward ${i + 1} needs a valid discount.`); if (!r.daily_limit || r.daily_limit < 1) e.push(`Reward ${i + 1} needs a daily limit.`); });
    return e;
  }, [rewards, dailyLimit, maxSpins, startsAt, endsAt]);

  function addItem(item: any) { if (!promotion || !restaurant || rewards.length >= MAX || rewards.some((r) => r.menu_item_id === item.id)) return; setSaved(false); setRewards((a) => [{ temp_id: tid(), promotion_id: promotion.id, restaurant_id: restaurant.id, menu_item_id: item.id, custom_name: null, label: item.name, reward_type: 'discount', reward_value: 10, daily_limit: 10, weight_label: 'Normal', weight: 30 }, ...a]); }
  function addCustom() { if (!promotion || !restaurant || rewards.length >= MAX) return; setSaved(false); setRewards((a) => [{ temp_id: tid(), promotion_id: promotion.id, restaurant_id: restaurant.id, menu_item_id: null, custom_name: 'Custom Reward', label: 'Custom Reward', reward_type: 'custom', reward_value: null, daily_limit: 10, weight_label: 'Normal', weight: 30 }, ...a]); }
  function updateReward(k: string, u: Partial<Reward>) { setSaved(false); setRewards((a) => a.map((r) => { if (r.temp_id !== k) return r; const n = { ...r, ...u }; if (u.weight_label) n.weight = WEIGHTS[u.weight_label]; if (!n.menu_item_id) n.custom_name = n.label; if (n.reward_type !== 'discount') n.reward_value = null; return n; })); }
  function removeReward(k: string) { setSaved(false); setRewards((a) => a.filter((r) => r.temp_id !== k)); }

  async function saveDraft() {
    if (!promotion || !restaurant) return false;
    setSaving(true); setSaved(false); setError('');
    const supabase = createClient();
    const p = await supabase.from('promotions').update({ daily_redeem_limit: dailyLimit, max_spins: maxSpins, stop_on_win: stopOnWin, starts_at: startsAt ? new Date(startsAt).toISOString() : null, ends_at: endsAt ? new Date(endsAt).toISOString() : null, status: 'draft' }).eq('id', promotion.id);
    if (p.error) { setError(p.error.message); setSaving(false); return false; }
    const d = await supabase.from('promotion_rewards').delete().eq('promotion_id', promotion.id); if (d.error) { setError(d.error.message); setSaving(false); return false; }
    if (rewards.length) { const ins = await supabase.from('promotion_rewards').insert(rewards.map((r) => ({ promotion_id: promotion.id, restaurant_id: restaurant.id, menu_item_id: r.menu_item_id, custom_name: r.menu_item_id ? null : r.label, reward_type: r.reward_type, reward_value: r.reward_type === 'discount' ? r.reward_value : null, daily_limit: r.daily_limit, weight: r.weight }))); if (ins.error) { setError(ins.error.message); setSaving(false); return false; } }
    setPromotion({ ...promotion, status: 'draft' }); setSaving(false); setSaved(true); return true;
  }
  async function launch() { if (errors.length || !promotion) return; setLaunching(true); const ok = await saveDraft(); if (!ok) { setLaunching(false); return; } const r = await createClient().from('promotions').update({ status: 'active' }).eq('id', promotion.id); if (r.error) setError(r.error.message); else setPromotion({ ...promotion, status: 'active' }); setLaunching(false); }
  function testSpin() { if (!rewards.length || spinning) return; const idx = pick(rewards); const midpoint = getWeightedSliceMidpoint(rewards, idx); const final = rotation + 5 * 360 + (-midpoint - (rotation % 360)); setResult(''); setSpinning(true); setRotation(final); setTimeout(() => { setSpinning(false); setResult(rewards[idx]?.label || 'Reward'); confetti({ particleCount: 160, spread: 95, origin: { y: 0.62 } }); }, 2900); }
  async function copyLink() { const link = `${window.location.origin}/play/${restaurant.slug}/${promotion.slug}`; await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6 font-black text-stone-700">Loading builder...</main>;
  if (!promotion || !restaurant) return <main className="min-h-screen bg-[#FFF8F0] p-6 font-black text-red-700">{error || 'Promotion could not be loaded.'}</main>;
  const address = [restaurant.address_line1, restaurant.city].filter(Boolean).join(', ') || 'Address not added';
  const play = `/play/${restaurant.slug}/${promotion.slug}`;
  const full = typeof window === 'undefined' ? play : `${window.location.origin}${play}`;
  const rewardStatus = rewards.length >= MIN ? `${rewards.length} / ${MAX} rewards added — minimum met ✅` : `${rewards.length} / ${MAX} rewards added — add ${MIN - rewards.length} more`;

  return <main className="min-h-screen overflow-x-hidden bg-[#FFF8F0] px-3 py-6 text-[#1F1F1F] sm:px-6"><section className="mx-auto max-w-6xl space-y-6">
    <div className="flex items-center justify-between gap-4"><a href={`/admin/promotions?slug=${restaurant.slug}`} className="rounded-full bg-white px-5 py-3 text-sm font-black text-[#FF6B00] shadow">Back</a><button onClick={copyLink} className="rounded-full bg-white px-5 py-3 text-sm font-black text-[#FF6B00] shadow">{copied ? 'Copied!' : 'Copy Link'}</button></div>
    <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-4 text-white shadow-2xl shadow-orange-200 sm:p-8"><div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_.82fr] lg:items-center"><div className="min-w-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-2xl">🎯</span><span className="text-2xl font-black leading-none">SpinBite</span></div><p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-white/75">Promotion Builder</p></div><span className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-black capitalize text-[#1F1F1F] shadow">{promotion.status}</span></div><h1 className="mt-5 break-words text-4xl font-black leading-tight sm:text-6xl">{promotion.name}</h1><div className="mt-5 rounded-3xl bg-white/15 p-4 backdrop-blur"><p className="text-xs font-black uppercase tracking-[0.16em] text-white/70">Restaurant location</p><p className="mt-1 break-words text-2xl font-black">{restaurant.name}</p><p className="mt-1 text-sm font-bold text-white/85">{address}</p><div className="mt-3 rounded-2xl bg-white/15 p-3"><p className="break-all text-xs font-black text-white/85">{full}</p><button onClick={copyLink} className="mt-2 w-full rounded-full bg-white px-4 py-2 text-xs font-black text-[#FF6B00]">{copied ? 'Copied!' : 'Copy Promotion Link'}</button></div></div></div><div className="min-w-0 rounded-[2rem] bg-white/90 p-3 text-[#1F1F1F] shadow-2xl ring-1 ring-white/50 sm:p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-stone-400">Live wheel</p>{result && <p className="text-sm font-black text-green-700">🎉 {result}</p>}</div><button onClick={testSpin} disabled={!rewards.length || spinning} className="rounded-full bg-[#1F1F1F] px-5 py-2 text-sm font-black text-white shadow-lg disabled:bg-stone-300">{spinning ? 'Spinning...' : 'Test'}</button></div><SpinWheelPreview rewards={rewards} rotation={rotation} spinning={spinning} /></div></div></section>
    {error && <div className="rounded-3xl bg-red-50 p-4 text-sm font-black text-red-700">{error}</div>}{saved && <div className="rounded-3xl bg-green-50 p-4 text-sm font-black text-green-700">Draft saved.</div>}
    <div className="rounded-[2rem] bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Step 1: Select Menu</p><select value={menuId} onChange={(e) => setMenuId(e.target.value)} className="mt-3 w-full rounded-2xl border border-stone-200 px-4 py-4 font-black outline-none focus:border-[#FF6B00]">{menus.length === 0 && <option value="">No menus found</option>}{menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
    <div className="rounded-[2rem] bg-white p-5 shadow-xl"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black uppercase text-[#FF6B00]">Step 2: Add Rewards</p><p className="mt-2 text-sm font-bold text-stone-600">Choose 6–10 menu rewards. Add custom rewards only when needed.</p></div><button onClick={addCustom} disabled={rewards.length >= MAX} className="rounded-2xl bg-[#1F1F1F] px-4 py-3 text-sm font-black text-white disabled:bg-stone-300">Custom</button></div><div className="mt-4 rounded-2xl bg-orange-50 p-3 text-sm font-black text-[#FF6B00]">{rewardStatus}</div><div className="mt-4 grid gap-3 md:grid-cols-2">{menuItems.map((item) => { const added = rewards.some((r) => r.menu_item_id === item.id); return <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border border-stone-100 p-4"><div className="min-w-0"><p className="truncate text-lg font-black">{item.name}</p><p className="text-sm font-bold text-stone-500">{money(item.price)}</p></div><button onClick={() => addItem(item)} disabled={added || rewards.length >= MAX} className="rounded-full bg-[#FF6B00] px-4 py-2 text-sm font-black text-white disabled:bg-stone-300">{added ? 'Added' : 'Add'}</button></div>; })}{!menuItems.length && <p className="rounded-2xl bg-stone-50 p-4 text-sm font-bold text-stone-500 md:col-span-2">No items found in this menu.</p>}</div></div>
    <div className="rounded-[2rem] bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Step 3: Configure Rewards</p><div className="mt-4 grid gap-4 lg:grid-cols-2">{rewards.map((r, i) => <div key={r.temp_id} className="rounded-3xl bg-stone-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-stone-400">Segment {i + 1}</p><p className="text-xl font-black">{r.label}</p></div><button onClick={() => removeReward(r.temp_id)} className="rounded-full bg-white px-3 py-2 text-xs font-black text-red-600 shadow-sm">Remove</button></div>{!r.menu_item_id && <input value={r.label} onChange={(e) => updateReward(r.temp_id, { label: e.target.value, custom_name: e.target.value })} className="mt-4 w-full rounded-2xl border border-stone-200 px-4 py-3 font-bold" />}<div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-black text-stone-700">Reward Type<select value={r.reward_type} onChange={(e) => updateReward(r.temp_id, { reward_type: e.target.value as RewardType })} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold"><option value="free">Free item</option><option value="discount">% Discount</option><option value="custom">Custom</option></select></label>{r.reward_type === 'discount' && <label className="text-sm font-black text-stone-700">Discount %<input type="number" min={1} max={100} value={r.reward_value || ''} onChange={(e) => updateReward(r.temp_id, { reward_value: Number(e.target.value) })} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" /></label>}<label className="text-sm font-black text-stone-700">Daily Limit<input type="number" min={1} value={r.daily_limit} onChange={(e) => updateReward(r.temp_id, { daily_limit: Number(e.target.value) })} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" /></label><label className="text-sm font-black text-stone-700">Weight<select value={r.weight_label} onChange={(e) => updateReward(r.temp_id, { weight_label: e.target.value as WeightLabel })} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold"><option value="Common">Common</option><option value="Normal">Normal</option><option value="Rare">Rare</option></select></label></div></div>)}{!rewards.length && <p className="rounded-2xl bg-stone-50 p-4 text-sm font-bold text-stone-500 lg:col-span-2">Add rewards from the selected menu to configure the wheel.</p>}</div></div>
    <div id="test-mode" className="scroll-mt-6 rounded-[2rem] bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Step 4: Test Mode</p><p className="mt-2 rounded-2xl bg-yellow-50 p-3 text-sm font-black text-yellow-800">TEST MODE — no coupons issued.</p><button onClick={testSpin} disabled={!rewards.length || spinning} className="mt-4 w-full rounded-3xl bg-[#1F1F1F] px-5 py-5 text-xl font-black text-white disabled:bg-stone-300">{spinning ? 'Spinning...' : 'Run Test Spin'}</button>{result && <p className="mt-4 rounded-2xl bg-green-50 p-4 text-sm font-black text-green-700">🎉 Test result: {result}</p>}</div>
    <div className="rounded-[2rem] bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Step 5: Promotion Rules</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-black text-stone-700">Daily Promotion Limit<input type="number" min={1} value={dailyLimit} onChange={(e) => { setSaved(false); setDailyLimit(Number(e.target.value)); }} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" /></label><label className="text-sm font-black text-stone-700">Max Spins Per Customer<input type="number" min={1} value={maxSpins} onChange={(e) => { setSaved(false); setMaxSpins(Number(e.target.value)); }} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" /></label><label className="text-sm font-black text-stone-700">Start Date/Time<input type="datetime-local" value={startsAt} onChange={(e) => { setSaved(false); setStartsAt(e.target.value); }} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" /></label><label className="text-sm font-black text-stone-700">End Date/Time<input type="datetime-local" value={endsAt} onChange={(e) => { setSaved(false); setEndsAt(e.target.value); }} className="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-3 font-bold" /></label></div><label className="mt-4 flex items-center gap-3 rounded-2xl bg-stone-50 p-4 text-sm font-black"><input type="checkbox" checked={stopOnWin} onChange={(e) => { setSaved(false); setStopOnWin(e.target.checked); }} className="h-5 w-5" />Stop on win</label></div>
    <div className="rounded-[2rem] bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Step 6: Launch</p>{errors.length ? <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700"><p className="font-black">Fix before launch:</p><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((m) => <li key={m}>{m}</li>)}</ul></div> : <div className="mt-4 rounded-2xl bg-green-50 p-4 text-sm font-black text-green-700">Ready to launch.</div>}<div className="mt-4 grid gap-3 sm:grid-cols-2"><button onClick={saveDraft} disabled={saving || launching} className="rounded-3xl bg-white px-5 py-5 text-lg font-black text-[#FF6B00] shadow ring-1 ring-orange-100 disabled:bg-stone-200">{saving ? 'Saving...' : 'Save Draft'}</button><button onClick={launch} disabled={!!errors.length || saving || launching} className="rounded-3xl bg-green-600 px-5 py-5 text-lg font-black text-white shadow-xl disabled:bg-stone-300">{launching ? 'Launching...' : 'Launch Promotion'}</button></div></div>
  </section></main>;
}

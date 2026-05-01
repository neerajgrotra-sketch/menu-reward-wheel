'use client';

import { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { createClient } from '@/lib/supabase/client';
import { loadSiteContentMap } from '@/lib/site-content-client';

type Restaurant = { id: string; name: string; slug: string; address_line1?: string | null; city?: string | null; phone?: string | null; current_promotion_id?: string | null };
type Promotion = { id: string; name: string; slug: string; status: string; created_at: string; restaurant_id: string; starts_at?: string | null; ends_at?: string | null };
type CountsByPromotion = Record<string, { issued: number; redeemed: number }>;
type Filter = 'active' | 'draft' | 'ended' | 'all';

const fallbackCopy = {
  eyebrow: 'Promotions',
  create_headline: 'Start a new campaign draft.',
  create_subheadline: 'Choose a restaurant location, name the campaign, select the game, then build rewards and publish.',
  manage_headline: 'Operate active and ended campaigns.',
  manage_subheadline: 'Edit, end, copy links, print posters, and track redemption performance.',
  create_tab_label: 'Create Promotion',
  manage_tab_label: 'Manage Promotions',
  select_location_label: 'Step 1: Select Restaurant Location',
  name_promotion_label: 'Step 2: Name Promotion',
  select_game_label: 'Step 3: Select Game Type',
  create_button_label: 'Create Promotion',
  no_drafts_title: 'No drafts in progress',
  no_drafts_copy: 'Create a new draft above.',
};

function toSlug(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function address(r?: Restaurant | null) { return [r?.address_line1, r?.city].filter(Boolean).join(', ') || 'Address not added'; }
function locationLabel(r: Restaurant) { return `${r.name} — ${address(r)}`; }
function statusOf(p: Promotion) { return p.status === 'active' && p.ends_at && new Date(p.ends_at) < new Date() ? 'ended' : (p.status || 'draft'); }
function fmt(value?: string | null) { return value ? new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'No end date set'; }

function MiniPrizeWheel() {
  return <div className="relative flex h-16 w-16 shrink-0 items-center justify-center"><style jsx>{`@keyframes spinPause{0%{transform:rotate(0deg)}55%{transform:rotate(760deg)}70%{transform:rotate(760deg)}100%{transform:rotate(1080deg)}}`}</style><div className="absolute -right-1 top-1/2 z-20 -translate-y-1/2 text-lg">◀</div><div className="h-16 w-16 rounded-full border-4 border-white shadow-lg" style={{ animation: 'spinPause 3.2s cubic-bezier(.18,.8,.25,1) infinite', background: 'conic-gradient(#FF6B00 0deg 45deg,#FFD166 45deg 90deg,#00C853 90deg 135deg,#E63939 135deg 180deg,#FF8A00 180deg 225deg,#FFF0C2 225deg 270deg,#2DD4BF 270deg 315deg,#F97316 315deg 360deg)' }} /><div className="absolute z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#1F1F1F] text-[10px] font-black text-white shadow">SPIN</div></div>;
}

export default function PromotionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [copy, setCopy] = useState(fallbackCopy);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('');
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [counts, setCounts] = useState<CountsByPromotion>({});
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'create' | 'manage'>('manage');
  const [filter, setFilter] = useState<Filter>('active');

  const selectedRestaurant = restaurants.find((r) => r.id === selectedRestaurantId) || null;

  async function refreshRestaurants(currentRestaurantId?: string) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return [] as Restaurant[];
    const result = await supabase.from('restaurants').select('id,name,slug,address_line1,city,phone,current_promotion_id').eq('owner_id', userData.user.id).order('created_at', { ascending: false });
    if (result.error) { setError(result.error.message); return [] as Restaurant[]; }
    const owned = (result.data || []) as Restaurant[];
    setRestaurants(owned);
    if (currentRestaurantId && owned.some((r) => r.id === currentRestaurantId)) setSelectedRestaurantId(currentRestaurantId);
    return owned;
  }

  async function loadPromotions(restaurantId: string) {
    await refreshRestaurants(restaurantId);
    const result = await supabase.from('promotions').select('id,name,slug,status,created_at,restaurant_id,starts_at,ends_at').eq('restaurant_id', restaurantId).order('created_at', { ascending: false });
    if (result.error) { setError(result.error.message); return; }
    const loaded = (result.data || []) as Promotion[];
    setPromotions(loaded);
    if (!loaded.length) { setCounts({}); return; }
    const ids = loaded.map((p) => p.id);
    const couponData = await supabase.from('coupon_redemptions').select('promotion_id,status').in('promotion_id', ids);
    const next: CountsByPromotion = {};
    (couponData.data || []).forEach((row: any) => { if (!next[row.promotion_id]) next[row.promotion_id] = { issued: 0, redeemed: 0 }; next[row.promotion_id].issued += 1; if (row.status === 'redeemed') next[row.promotion_id].redeemed += 1; });
    setCounts(next);
  }

  useEffect(() => {
    async function load() {
      const loadedCopy = await loadSiteContentMap(supabase, 'admin_promotions', fallbackCopy);
      setCopy(loadedCopy as typeof fallbackCopy);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { window.location.href = '/auth'; return; }
      const params = new URLSearchParams(window.location.search);
      const requestedMode = params.get('mode');
      const requestedSlug = params.get('slug');
      if (requestedMode === 'create' || requestedMode === 'manage') setMode(requestedMode);
      const result = await supabase.from('restaurants').select('id,name,slug,address_line1,city,phone,current_promotion_id').eq('owner_id', userData.user.id).order('created_at', { ascending: false });
      if (result.error) { setError(result.error.message); return; }
      const owned = (result.data || []) as Restaurant[];
      setRestaurants(owned);
      const preselected = requestedSlug ? owned.find((r) => r.slug === requestedSlug) : null;
      setSelectedRestaurantId((preselected || owned[0])?.id || '');
    }
    load();
  }, [supabase]);

  useEffect(() => { if (selectedRestaurantId) loadPromotions(selectedRestaurantId); else setPromotions([]); }, [selectedRestaurantId]);

  async function addPromotion() {
    if (!selectedRestaurant || !name.trim()) return;
    setSaving(true); setError('');
    const slug = `${toSlug(name)}-${Date.now().toString().slice(-4)}`;
    const response = await supabase.from('promotions').insert({ restaurant_id: selectedRestaurant.id, name: name.trim(), slug, status: 'draft', game_type: 'wheel' }).select('id').single();
    if (response.error || !response.data) { setError(response.error?.message || 'Could not create promotion.'); setSaving(false); return; }
    window.location.href = `/admin/promotions/${response.data.id}/builder`;
  }

  async function deletePromotion(event: React.MouseEvent, p: Promotion) {
    event.preventDefault(); event.stopPropagation();
    if (statusOf(p) !== 'draft') return;
    if (!window.confirm(`Delete draft ${p.name}?`)) return;
    setDeletingId(p.id);
    await supabase.from('promotion_rewards').delete().eq('promotion_id', p.id);
    const result = await supabase.from('promotions').delete().eq('id', p.id);
    if (result.error) setError(result.error.message);
    if (selectedRestaurantId) await loadPromotions(selectedRestaurantId);
    setDeletingId(null);
  }

  async function copyPlayLink(event: React.MouseEvent, p: Promotion) {
    event.preventDefault(); event.stopPropagation();
    if (!selectedRestaurant) return;
    const permanentLink = selectedRestaurant.current_promotion_id === p.id ? `${window.location.origin}/r/${selectedRestaurant.slug}` : `${window.location.origin}/play/${selectedRestaurant.slug}/${p.slug}`;
    await navigator.clipboard.writeText(permanentLink);
    setCopiedId(p.id); setTimeout(() => setCopiedId(null), 1500);
  }

  async function endPromotion(event: React.MouseEvent, p: Promotion) {
    event.preventDefault(); event.stopPropagation();
    if (statusOf(p) !== 'active') return;
    if (!window.confirm(`End ${p.name} now? Customers will no longer be able to play this promotion.`)) return;
    setEndingId(p.id); setError('');
    const endedAt = new Date().toISOString();
    const result = await supabase.from('promotions').update({ ends_at: endedAt }).eq('id', p.id);
    if (result.error) { setError(result.error.message); setEndingId(null); return; }
    if (selectedRestaurantId) await loadPromotions(selectedRestaurantId);
    setFilter('ended'); setEndingId(null); confetti({ particleCount: 180, spread: 110, origin: { y: 0.62 } });
  }

  const statusCounts = promotions.reduce<Record<Filter, number>>((acc, p) => { const s = statusOf(p) as Filter; acc[s] += 1; acc.all += 1; return acc; }, { active: 0, draft: 0, ended: 0, all: 0 });
  const visiblePromotions = mode === 'create' ? promotions.filter((p) => statusOf(p) === 'draft') : promotions.filter((p) => filter === 'all' || statusOf(p) === filter);
  const canCreate = Boolean(selectedRestaurant && name.trim() && !saving);

  return <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]"><section className="mx-auto max-w-5xl">
    <div className="flex items-center justify-between gap-4"><div><h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1><p className="mt-1 text-sm font-bold text-stone-500">{mode === 'create' ? copy.create_tab_label : copy.manage_tab_label}</p></div><a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Dashboard</a></div>
    <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200"><p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">{copy.eyebrow}</p><h2 className="mt-3 text-4xl font-black leading-tight">{mode === 'create' ? copy.create_headline : copy.manage_headline}</h2><p className="mt-3 text-sm font-semibold text-white/85">{mode === 'create' ? copy.create_subheadline : copy.manage_subheadline}</p></div>
    <div className="mt-5 grid grid-cols-2 gap-3 rounded-3xl bg-white p-2 shadow-xl"><button onClick={() => setMode('create')} className={`rounded-2xl px-4 py-3 text-sm font-black ${mode === 'create' ? 'bg-green-600 text-white' : 'bg-white text-stone-500'}`}>{copy.create_tab_label}</button><button onClick={() => setMode('manage')} className={`rounded-2xl px-4 py-3 text-sm font-black ${mode === 'manage' ? 'bg-[#1F1F1F] text-white' : 'bg-white text-stone-500'}`}>{copy.manage_tab_label}</button></div>
    <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">{mode === 'create' ? copy.select_location_label : 'Restaurant Location'}</p><select value={selectedRestaurantId} onChange={(e) => setSelectedRestaurantId(e.target.value)} className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 font-black outline-none focus:border-[#FF6B00]"><option value="">Select restaurant/location...</option>{restaurants.map((r) => <option key={r.id} value={r.id}>{locationLabel(r)}</option>)}</select>{selectedRestaurant && <div className="mt-4 rounded-2xl bg-orange-50 p-4"><p className="text-xl font-black">{selectedRestaurant.name}</p><p className="mt-1 text-sm font-bold text-stone-600">{address(selectedRestaurant)}</p><p className="mt-1 text-xs font-bold text-stone-500">/{selectedRestaurant.slug}</p>{selectedRestaurant.current_promotion_id && <p className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-xs font-black text-green-700">Permanent QR: /r/{selectedRestaurant.slug}</p>}</div>}</div>
    {mode === 'create' && <><div className="mt-5 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">{copy.name_promotion_label}</p><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Halloween, Lunch Rush, Weekend Spin..." className="mt-3 w-full rounded-2xl border border-stone-200 px-4 py-4 font-semibold outline-none focus:border-[#FF6B00]" /></div><div className="mt-5 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">{copy.select_game_label}</p><button onClick={() => undefined} className="mt-3 w-full rounded-3xl border-2 border-green-600 bg-green-50 p-5 text-left"><div className="flex items-start gap-4"><MiniPrizeWheel /><div><p className="text-2xl font-black">Spin Wheel</p><p className="mt-1 text-sm font-bold text-stone-600">Customers scan a QR code, spin a branded prize wheel, and win configured rewards.</p><p className="mt-2 text-xs font-black uppercase text-green-700">Available now</p></div></div></button></div><div className="mt-5 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Step 4: {copy.create_button_label}</p><button onClick={addPromotion} disabled={!canCreate} className="mt-3 w-full rounded-3xl bg-green-600 px-5 py-5 text-xl font-black text-white shadow-xl disabled:bg-stone-400">{saving ? 'Creating...' : copy.create_button_label}</button></div></>}
    {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
    <div className="mt-5 space-y-4"><div className="rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">{mode === 'create' ? 'Drafts in progress' : 'Managed promotions'}</p><p className="mt-2 text-sm font-bold text-stone-500">{mode === 'create' ? 'Drafts appear here while they are still being built. Published campaigns move to Manage Promotions.' : 'Active shows currently playable campaigns. Only one promotion can be live on the permanent QR for this location.'}</p>{mode === 'manage' && <div className="mt-4 grid grid-cols-4 gap-2 rounded-2xl bg-stone-50 p-2">{(['active','draft','ended','all'] as Filter[]).map((f) => <button key={f} onClick={() => setFilter(f)} className={`rounded-xl px-2 py-3 text-xs font-black ${filter === f ? 'bg-[#1F1F1F] text-white shadow' : 'bg-white text-stone-600'}`}>{f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}<br />{statusCounts[f]}</button>)}</div>}</div>{selectedRestaurant && visiblePromotions.length === 0 && <div className="rounded-3xl bg-white p-6 shadow-xl"><p className="text-2xl font-black">{mode === 'create' ? copy.no_drafts_title : `No ${filter} promotions`}</p><p className="mt-2 text-sm font-semibold text-stone-600">{mode === 'create' ? copy.no_drafts_copy : 'Switch filters to view other statuses.'}</p></div>}{selectedRestaurant && visiblePromotions.map((p) => { const s = statusOf(p); const metric = counts[p.id] || { issued: 0, redeemed: 0 }; const rate = metric.issued ? Math.round((metric.redeemed / metric.issued) * 100) : 0; const isLiveOnQr = selectedRestaurant.current_promotion_id === p.id && s === 'active'; const linkText = isLiveOnQr ? `/r/${selectedRestaurant.slug}` : `/play/${selectedRestaurant.slug}/${p.slug}`; return <div key={p.id} className="rounded-3xl bg-white p-5 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h3 className="text-3xl font-black">{p.name}</h3><div className="mt-2 flex flex-wrap gap-2"><p className={`inline-block rounded-full px-3 py-1 text-xs font-black uppercase ${isLiveOnQr ? 'bg-green-600 text-white' : s === 'active' ? 'bg-green-50 text-green-700' : s === 'ended' ? 'bg-stone-100 text-stone-600' : 'bg-orange-50 text-[#FF6B00]'}`}>{isLiveOnQr ? 'Live on QR' : s}</p>{s === 'active' && !isLiveOnQr && <p className="inline-block rounded-full bg-yellow-50 px-3 py-1 text-xs font-black uppercase text-yellow-700">Active, not QR</p>}</div></div><a href={`/admin/promotions/${p.id}/builder`} className="rounded-full bg-orange-50 px-4 py-2 text-center text-sm font-black text-[#FF6B00]">{s === 'draft' ? 'Build' : 'Edit'}</a></div>{mode === 'manage' && <><div className="mt-4 rounded-2xl bg-orange-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-[#FF6B00]">Restaurant Location</p><p className="mt-1 text-xl font-black">{selectedRestaurant.name}</p><p className="mt-1 text-sm font-bold text-stone-600">{address(selectedRestaurant)}</p><p className="mt-3 text-xs font-black uppercase tracking-wide text-stone-500">Promotion Expiry</p><p className="mt-1 text-sm font-black text-stone-800">{fmt(p.ends_at)}</p></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-2xl bg-stone-50 p-3"><p className="text-xl font-black">{metric.issued}</p><p className="text-xs font-bold text-stone-500">Issued</p></div><div className="rounded-2xl bg-stone-50 p-3"><p className="text-xl font-black">{metric.redeemed}</p><p className="text-xs font-bold text-stone-500">Redeemed</p></div><div className="rounded-2xl bg-stone-50 p-3"><p className="text-xl font-black">{rate}%</p><p className="text-xs font-bold text-stone-500">Rate</p></div></>}<p className="mt-4 break-all text-sm font-black text-[#FF6B00]">{linkText}</p><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={(event) => copyPlayLink(event, p)} className="rounded-2xl bg-[#1F1F1F] px-4 py-3 text-sm font-black text-white">{copiedId === p.id ? 'Copied!' : isLiveOnQr ? 'Copy Permanent QR Link' : 'Copy Direct Link'}</button><a href={`/admin/promotions/${p.id}/print`} target="_blank" className="rounded-2xl bg-green-600 px-4 py-3 text-center text-sm font-black text-white">Print Kit</a>{s === 'draft' ? <button onClick={(event) => deletePromotion(event, p)} disabled={deletingId === p.id} className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600">{deletingId === p.id ? 'Deleting...' : 'Delete Draft'}</button> : s === 'active' ? <button onClick={(event) => endPromotion(event, p)} disabled={endingId === p.id} className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600">{endingId === p.id ? 'Ending...' : 'End Promotion'}</button> : <span className="rounded-2xl bg-stone-100 px-4 py-3 text-center text-sm font-black text-stone-500">Promotion Ended</span>}</div></div>; })}</div>
  </section></main>;
}

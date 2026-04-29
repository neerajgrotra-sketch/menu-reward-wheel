'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Restaurant = { id: string; name: string; slug: string; address_line1?: string | null; city?: string | null; phone?: string | null };
type Promotion = { id: string; name: string; slug: string; status: string; created_at: string; restaurant_id: string; starts_at?: string | null; ends_at?: string | null };
type CountsByPromotion = Record<string, { issued: number; redeemed: number }>;

function toSlug(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function locationLabel(restaurant: Restaurant) { const address = [restaurant.address_line1, restaurant.city].filter(Boolean).join(', '); return address ? `${restaurant.name} — ${address}` : `${restaurant.name} — /${restaurant.slug}`; }
function effectiveStatus(promotion: Promotion) { if (promotion.status === 'active' && promotion.ends_at && new Date(promotion.ends_at) < new Date()) return 'ended'; return promotion.status || 'draft'; }

function MiniPrizeWheel() {
  return <div className="relative flex h-16 w-16 shrink-0 items-center justify-center"><style jsx>{`@keyframes spinPause{0%{transform:rotate(0deg)}55%{transform:rotate(760deg)}70%{transform:rotate(760deg)}100%{transform:rotate(1080deg)}}`}</style><div className="absolute -right-1 top-1/2 z-20 -translate-y-1/2 text-lg">◀</div><div className="h-16 w-16 rounded-full border-4 border-white shadow-lg" style={{ animation: 'spinPause 3.2s cubic-bezier(.18,.8,.25,1) infinite', background: 'conic-gradient(#FF6B00 0deg 45deg,#FFD166 45deg 90deg,#00C853 90deg 135deg,#E63939 135deg 180deg,#FF8A00 180deg 225deg,#FFF0C2 225deg 270deg,#2DD4BF 270deg 315deg,#F97316 315deg 360deg)' }} /><div className="absolute z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#1F1F1F] text-[10px] font-black text-white shadow">SPIN</div></div>;
}

export default function PromotionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('');
  const [selectedGame, setSelectedGame] = useState('wheel');
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [counts, setCounts] = useState<CountsByPromotion>({});
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'create' | 'manage'>('manage');

  const selectedRestaurant = restaurants.find((item) => item.id === selectedRestaurantId) || null;

  async function loadPromotions(restaurantId: string) {
    const { data, error: promotionError } = await supabase.from('promotions').select('id,name,slug,status,created_at,restaurant_id,starts_at,ends_at').eq('restaurant_id', restaurantId).order('created_at', { ascending: false });
    if (promotionError) { setError(promotionError.message); return; }
    const loaded = (data || []) as Promotion[];
    setPromotions(loaded);
    if (loaded.length) {
      const ids = loaded.map((item) => item.id);
      const couponData = await supabase.from('coupon_redemptions').select('promotion_id,status').in('promotion_id', ids);
      const next: CountsByPromotion = {};
      (couponData.data || []).forEach((row: any) => { if (!next[row.promotion_id]) next[row.promotion_id] = { issued: 0, redeemed: 0 }; next[row.promotion_id].issued += 1; if (row.status === 'redeemed') next[row.promotion_id].redeemed += 1; });
      setCounts(next);
    } else setCounts({});
  }

  useEffect(() => {
    async function loadRestaurants() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) { window.location.href = '/auth'; return; }
      const params = new URLSearchParams(window.location.search);
      const requestedSlug = params.get('slug');
      const requestedMode = params.get('mode');
      if (requestedMode === 'create' || requestedMode === 'manage') setMode(requestedMode);
      const { data, error: restaurantError } = await supabase.from('restaurants').select('id,name,slug,address_line1,city,phone').eq('owner_id', user.id).order('created_at', { ascending: false });
      if (restaurantError) { setError(restaurantError.message); return; }
      const ownedRestaurants = (data || []) as Restaurant[];
      setRestaurants(ownedRestaurants);
      const preselected = requestedSlug ? ownedRestaurants.find((item) => item.slug === requestedSlug) : null;
      if (preselected) setSelectedRestaurantId(preselected.id);
      else if (ownedRestaurants[0]) setSelectedRestaurantId(ownedRestaurants[0].id);
    }
    loadRestaurants();
  }, [supabase]);

  useEffect(() => { if (!selectedRestaurantId) { setPromotions([]); return; } loadPromotions(selectedRestaurantId); }, [selectedRestaurantId]);

  async function addPromotion() {
    if (!selectedRestaurant || !name.trim() || !selectedGame) return;
    setSaving(true); setError('');
    const promotionSlug = `${toSlug(name)}-${Date.now().toString().slice(-4)}`;
    const insertResponse = await supabase.from('promotions').insert({ restaurant_id: selectedRestaurant.id, name: name.trim(), slug: promotionSlug, status: 'draft', game_type: selectedGame }).select('id').single();
    if (insertResponse.error || !insertResponse.data) { setError(insertResponse.error?.message || 'Could not create promotion.'); setSaving(false); return; }
    window.location.href = `/admin/promotions/${insertResponse.data.id}/builder`;
  }

  async function deletePromotion(event: React.MouseEvent, promotion: Promotion) {
    event.preventDefault(); event.stopPropagation();
    if (effectiveStatus(promotion) !== 'draft') { window.alert('Only draft promotions can be deleted. Active and ended promotions should be archived later for audit history.'); return; }
    const confirmed = window.confirm(`Delete draft ${promotion.name}? This will remove this promotion and its rewards.`);
    if (!confirmed) return;
    setDeletingId(promotion.id); setError('');
    const rewardDelete = await supabase.from('promotion_rewards').delete().eq('promotion_id', promotion.id);
    if (rewardDelete.error) { setError(rewardDelete.error.message); setDeletingId(null); return; }
    const promotionDelete = await supabase.from('promotions').delete().eq('id', promotion.id);
    if (promotionDelete.error) { setError(promotionDelete.error.message); setDeletingId(null); return; }
    if (selectedRestaurantId) await loadPromotions(selectedRestaurantId);
    setDeletingId(null);
  }

  async function copyPlayLink(event: React.MouseEvent, promotion: Promotion) {
    event.preventDefault(); event.stopPropagation();
    if (!selectedRestaurant) return;
    const link = `${window.location.origin}/play/${selectedRestaurant.slug}/${promotion.slug}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(promotion.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const canCreate = Boolean(selectedRestaurant && name.trim() && selectedGame && !saving);
  const draftPromotions = promotions.filter((item) => effectiveStatus(item) === 'draft');
  const managedPromotions = promotions.filter((item) => effectiveStatus(item) !== 'draft');
  const listToShow = mode === 'create' ? draftPromotions : managedPromotions;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]"><section className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between gap-4"><div><h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1><p className="mt-1 text-sm font-bold text-stone-500">{mode === 'create' ? 'Create promotion' : 'Manage promotions'}</p></div><a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Dashboard</a></div>
      <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200"><p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Promotions</p><h2 className="mt-3 text-4xl font-black leading-tight">{mode === 'create' ? 'Start a new campaign draft.' : 'Operate active and ended campaigns.'}</h2><p className="mt-3 text-sm font-semibold text-white/85">{mode === 'create' ? 'Choose a restaurant, name the campaign, select the game, then build rewards and publish.' : 'Edit, relaunch, copy links, and track redemption performance for campaigns after they leave the creation flow.'}</p></div>
      <div className="mt-5 grid grid-cols-2 gap-3 rounded-3xl bg-white p-2 shadow-xl"><button onClick={() => setMode('create')} className={`rounded-2xl px-4 py-3 text-sm font-black ${mode === 'create' ? 'bg-green-600 text-white' : 'bg-white text-stone-500'}`}>Create Promotion</button><button onClick={() => setMode('manage')} className={`rounded-2xl px-4 py-3 text-sm font-black ${mode === 'manage' ? 'bg-[#1F1F1F] text-white' : 'bg-white text-stone-500'}`}>Manage Promotions</button></div>
      <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Restaurant Location</p><select value={selectedRestaurantId} onChange={(event) => setSelectedRestaurantId(event.target.value)} className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 font-black outline-none focus:border-[#FF6B00]"><option value="">Select restaurant/location...</option>{restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{locationLabel(restaurant)}</option>)}</select>{selectedRestaurant && <div className="mt-4 rounded-2xl bg-orange-50 p-4"><p className="text-xl font-black">{selectedRestaurant.name}</p><p className="mt-1 text-sm font-bold text-stone-600">{[selectedRestaurant.address_line1, selectedRestaurant.city].filter(Boolean).join(', ') || 'Address not added'}</p><p className="mt-1 text-xs font-bold text-stone-500">/{selectedRestaurant.slug}</p></div>}</div>
      {mode === 'create' && <><div className="mt-5 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Step 1: Name Promotion</p><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Halloween, Lunch Rush, Weekend Spin..." className="mt-3 w-full rounded-2xl border border-stone-200 px-4 py-4 font-semibold outline-none focus:border-[#FF6B00]" /></div><div className="mt-5 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Step 2: Select Game Type</p><button onClick={() => setSelectedGame('wheel')} className={`mt-3 w-full rounded-3xl border-2 p-5 text-left transition ${selectedGame === 'wheel' ? 'border-green-600 bg-green-50' : 'border-stone-200 bg-white'}`}><div className="flex items-start gap-4"><MiniPrizeWheel /><div><p className="text-2xl font-black">Spin Wheel</p><p className="mt-1 text-sm font-bold text-stone-600">Customers scan a QR code, spin a branded prize wheel, and win configured rewards.</p><p className="mt-2 text-xs font-black uppercase text-green-700">Available now</p></div></div></button></div><div className="mt-5 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Step 3: Create Promotion</p><button onClick={addPromotion} disabled={!canCreate} className="mt-3 w-full rounded-3xl bg-green-600 px-5 py-5 text-xl font-black text-white shadow-xl disabled:bg-stone-400">{saving ? 'Creating...' : 'Create Promotion'}</button></div></>}
      {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
      <div className="mt-5 space-y-4"><div className="rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">{mode === 'create' ? 'Drafts in progress' : 'Managed promotions'}</p><p className="mt-2 text-sm font-bold text-stone-500">{mode === 'create' ? 'Drafts appear here while they are still being built. Published campaigns move to Manage Promotions.' : 'Active and ended campaigns stay here for operations, reporting, and relaunching.'}</p></div>{selectedRestaurant && listToShow.length === 0 && <div className="rounded-3xl bg-white p-6 shadow-xl"><p className="text-2xl font-black">{mode === 'create' ? 'No drafts in progress' : 'No managed promotions yet'}</p><p className="mt-2 text-sm font-semibold text-stone-600">{mode === 'create' ? 'Create a new draft above.' : 'Launch a draft first, then it will appear here.'}</p></div>}{selectedRestaurant && listToShow.map((promotion) => { const status = effectiveStatus(promotion); const metric = counts[promotion.id] || { issued: 0, redeemed: 0 }; const rate = metric.issued ? Math.round((metric.redeemed / metric.issued) * 100) : 0; return <a key={promotion.id} href={`/admin/promotions/${promotion.id}/builder`} className="block rounded-3xl bg-white p-5 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h3 className="text-3xl font-black">{promotion.name}</h3><p className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-black uppercase ${status === 'active' ? 'bg-green-50 text-green-700' : status === 'ended' ? 'bg-stone-100 text-stone-600' : 'bg-orange-50 text-[#FF6B00]'}`}>{status}</p></div><span className="rounded-full bg-orange-50 px-4 py-2 text-center text-sm font-black text-[#FF6B00]">{status === 'draft' ? 'Build' : 'Edit'}</span></div>{mode === 'manage' && <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-2xl bg-stone-50 p-3"><p className="text-xl font-black">{metric.issued}</p><p className="text-xs font-bold text-stone-500">Issued</p></div><div className="rounded-2xl bg-stone-50 p-3"><p className="text-xl font-black">{metric.redeemed}</p><p className="text-xs font-bold text-stone-500">Redeemed</p></div><div className="rounded-2xl bg-stone-50 p-3"><p className="text-xl font-black">{rate}%</p><p className="text-xs font-bold text-stone-500">Rate</p></div></div>}<p className="mt-4 break-all text-sm font-black text-[#FF6B00]">/play/{selectedRestaurant.slug}/{promotion.slug}</p><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={(event) => copyPlayLink(event, promotion)} className="rounded-2xl bg-[#1F1F1F] px-4 py-3 text-sm font-black text-white">{copiedId === promotion.id ? 'Copied!' : 'Copy Link'}</button>{status === 'draft' ? <button onClick={(event) => deletePromotion(event, promotion)} disabled={deletingId === promotion.id} className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600">{deletingId === promotion.id ? 'Deleting...' : 'Delete Draft'}</button> : <span className="rounded-2xl bg-green-50 px-4 py-3 text-center text-sm font-black text-green-700">Relaunch via Edit</span>}</div></a>; })}</div>
    </section></main>
  );
}

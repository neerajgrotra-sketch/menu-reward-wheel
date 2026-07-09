'use client';

import { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { createClient } from '@/lib/supabase/client';
import { loadSiteContentMap } from '@/lib/site-content-client';
import { getGameMeta } from '@/lib/games/game-registry';
import { getGameVisual } from '@/components/game-visuals/GameVisual';
import { UI_LAYERS } from '@/lib/ui-layers';

type Restaurant = { id: string; name: string; slug: string; address_line1?: string | null; city?: string | null; phone?: string | null };
type Promotion = { id: string; name: string; slug: string; status: string; created_at: string; restaurant_id: string; starts_at?: string | null; ends_at?: string | null };
type CountsByPromotion = Record<string, { issued: number; redeemed: number }>;
type Filter = 'active' | 'pending' | 'draft' | 'ended' | 'all';
type PerformanceCoupon = { id: string; coupon_code: string; issued_at: string | null; redeemed_at: string | null; expires_at: string | null; raw_status: string; display_status: 'active' | 'expired' | 'redeemed'; item_won: string; discount_type: string };
type PromotionPerformance = { promotion: { id: string; name: string; slug: string; status: string; starts_at?: string | null; ends_at?: string | null; coupon_expiry_minutes: number }; restaurant: { id: string; name: string; slug: string; address: string }; summary: { issued: number; redeemed: number; active: number; expired: number; redemptionRate: number }; rewardsBreakdown: Record<string, number>; coupons: PerformanceCoupon[]; limit: number };

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
function statusOf(p: Promotion): Filter {
  const now = new Date();
  if (p.status === 'draft') return 'draft';
  if (p.ends_at && new Date(p.ends_at) <= now) return 'ended';
  if (p.status === 'active' && p.starts_at && new Date(p.starts_at) > now) return 'pending';
  if (p.status === 'active') return 'active';
  return 'draft';
}
function fmt(value?: string | null) { return value ? new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not set'; }
function fmtCompact(value?: string | null) { return value ? new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '—'; }
function filterLabel(f: Filter) { return f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1); }

function GameCard({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`mt-3 w-full rounded-3xl border-2 p-5 text-left transition active:scale-[0.99] ${selected ? 'border-green-600 bg-green-50 shadow' : 'border-stone-100 bg-stone-50'}`}>{children}</button>;
}

function statusBadgeClass(status: string) {
  if (status === 'redeemed') return 'bg-green-50 text-green-700';
  if (status === 'expired') return 'bg-stone-100 text-stone-600';
  return 'bg-orange-50 text-[#FF6B00]';
}

function promotionBadgeClass(status: Filter) {
  if (status === 'active') return 'bg-green-50 text-green-700';
  if (status === 'pending') return 'bg-yellow-50 text-yellow-700';
  if (status === 'ended') return 'bg-stone-100 text-stone-600';
  return 'bg-orange-50 text-[#FF6B00]';
}

export default function PromotionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [copy, setCopy] = useState(fallbackCopy);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('');
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [counts, setCounts] = useState<CountsByPromotion>({});
  const [countsBySlug, setCountsBySlug] = useState<CountsByPromotion>({});
  const [metricsError, setMetricsError] = useState('');
  const [metricsInfo, setMetricsInfo] = useState('');
  const [name, setName] = useState('');
  const [gameType, setGameType] = useState<string>('spin_wheel');
  const [availableGames, setAvailableGames] = useState<{ id: string; name: string; status: string }[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'create' | 'manage'>('manage');
  const [filter, setFilter] = useState<Filter>('active');
  const [performance, setPerformance] = useState<PromotionPerformance | null>(null);
  const [loadingPerformanceId, setLoadingPerformanceId] = useState<string | null>(null);
  const [performanceError, setPerformanceError] = useState('');

  const selectedRestaurant = restaurants.find((r) => r.id === selectedRestaurantId) || null;

  async function loadPromotionMetrics() {
    setMetricsError('');
    const response = await fetch('/api/admin/promotion-metrics', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMetricsError(payload?.error || 'Could not load promotion metrics.');
      return;
    }
    setCounts(payload.metrics || {});
    setCountsBySlug(payload.metricsBySlug || {});
    if (typeof payload.couponCount === 'number') setMetricsInfo(`${payload.couponCount} coupon records loaded into metrics.`);
  }

  async function loadPromotionPerformance(promotionId: string) {
    setPerformanceError('');
    setLoadingPerformanceId(promotionId);
    const response = await fetch(`/api/admin/promotion-performance?promotionId=${encodeURIComponent(promotionId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    setLoadingPerformanceId(null);
    if (!response.ok) {
      setPerformanceError(payload?.error || 'Could not load promotion performance.');
      return;
    }
    setPerformance(payload as PromotionPerformance);
  }

  async function loadPromotions(restaurantId: string) {
    const result = await supabase.from('promotions').select('id,name,slug,status,created_at,restaurant_id,starts_at,ends_at').eq('restaurant_id', restaurantId).order('created_at', { ascending: false });
    if (result.error) { setError(result.error.message); return; }
    const loaded = (result.data || []) as Promotion[];
    setPromotions(loaded);
    if (!loaded.length) { setCounts({}); setCountsBySlug({}); return; }
    await loadPromotionMetrics();
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
      const result = await supabase.from('restaurants').select('id,name,slug,address_line1,city,phone').eq('owner_id', userData.user.id).is('deleted_at', null).order('created_at', { ascending: false });
      if (result.error) { setError(result.error.message); return; }
      const owned = (result.data || []) as Restaurant[];
      setRestaurants(owned);
      const preselected = requestedSlug ? owned.find((r) => r.slug === requestedSlug) : null;
      setSelectedRestaurantId((preselected || owned[0])?.id || '');
      // Load active games from the games table — canonical availability authority.
      const { data: gamesData } = await supabase.from('games').select('id,name,status').eq('status', 'active').order('name');
      const activeGames = (gamesData ?? []) as { id: string; name: string; status: string }[];
      setAvailableGames(activeGames);
      if (activeGames.length > 0) setGameType(activeGames[0].id);
    }
    load();
  }, [supabase]);

  useEffect(() => { if (selectedRestaurantId) loadPromotions(selectedRestaurantId); else setPromotions([]); }, [selectedRestaurantId]);

  async function addPromotion() {
    if (!selectedRestaurant || !name.trim()) return;
    setSaving(true); setError('');
    const slug = `${toSlug(name)}-${Date.now().toString().slice(-4)}`;
    const response = await supabase.from('promotions').insert({ restaurant_id: selectedRestaurant.id, name: name.trim(), slug, status: 'draft', game_type: gameType }).select('id').single();
    if (response.error || !response.data) { setError(response.error?.message || 'Could not create promotion.'); setSaving(false); return; }
    // Write the primary game assignment immediately so promotion_game_assignments is authoritative from creation.
    await supabase.from('promotion_game_assignments').insert({ promotion_id: response.data.id, game_type: gameType, weight: 1, enabled: true, is_primary: true });
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
    await navigator.clipboard.writeText(`${window.location.origin}/play/${selectedRestaurant.slug}/${p.slug}`);
    setCopiedId(p.id); setTimeout(() => setCopiedId(null), 1500);
  }

  async function endPromotion(event: React.MouseEvent, p: Promotion) {
    event.preventDefault(); event.stopPropagation();
    const currentStatus = statusOf(p);
    if (currentStatus !== 'active' && currentStatus !== 'pending') return;
    if (!window.confirm(`End ${p.name} now? Customers will no longer be able to play this promotion.`)) return;
    setEndingId(p.id); setError('');
    const endedAt = new Date().toISOString();
    const result = await supabase.from('promotions').update({ ends_at: endedAt }).eq('id', p.id);
    if (result.error) { setError(result.error.message); setEndingId(null); return; }
    setPromotions((current) => current.map((item) => item.id === p.id ? { ...item, ends_at: endedAt } : item));
    await loadPromotionMetrics();
    setFilter('ended'); setEndingId(null); confetti({ particleCount: 180, spread: 110, origin: { y: 0.62 } });
  }

  const statusCounts = promotions.reduce<Record<Filter, number>>((acc, p) => { const s = statusOf(p); acc[s] += 1; acc.all += 1; return acc; }, { active: 0, pending: 0, draft: 0, ended: 0, all: 0 });
  const visiblePromotions = mode === 'create' ? promotions.filter((p) => statusOf(p) === 'draft') : promotions.filter((p) => filter === 'all' || statusOf(p) === filter);
  const canCreate = Boolean(selectedRestaurant && name.trim() && gameType && !saving);

  return <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]"><section className="mx-auto max-w-5xl">
    <div className="flex items-center justify-between gap-4"><div><h1 className="text-3xl font-black text-[#FF6B00]">{mode === 'create' ? copy.create_tab_label : copy.manage_tab_label}</h1></div><a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Dashboard</a></div>
    <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200"><p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">{copy.eyebrow}</p><h2 className="mt-3 text-4xl font-black leading-tight">{mode === 'create' ? copy.create_headline : copy.manage_headline}</h2><p className="mt-3 text-sm font-semibold text-white/85">{mode === 'create' ? copy.create_subheadline : copy.manage_subheadline}</p></div>
    <div className="mt-5 grid grid-cols-2 gap-3 rounded-3xl bg-white p-2 shadow-xl"><button onClick={() => setMode('create')} className={`rounded-2xl px-4 py-3 text-sm font-black ${mode === 'create' ? 'bg-green-600 text-white' : 'bg-white text-stone-500'}`}>{copy.create_tab_label}</button><button onClick={() => setMode('manage')} className={`rounded-2xl px-4 py-3 text-sm font-black ${mode === 'manage' ? 'bg-[#1F1F1F] text-white' : 'bg-white text-stone-500'}`}>{copy.manage_tab_label}</button></div>
    <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">{mode === 'create' ? copy.select_location_label : 'Restaurant Location'}</p><select value={selectedRestaurantId} onChange={(e) => setSelectedRestaurantId(e.target.value)} className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 font-black outline-none focus:border-[#FF6B00]"><option value="">Select restaurant/location...</option>{restaurants.map((r) => <option key={r.id} value={r.id}>{locationLabel(r)}</option>)}</select>{selectedRestaurant && <div className="mt-4 rounded-2xl bg-orange-50 p-4"><p className="text-xl font-black">{selectedRestaurant.name}</p><p className="mt-1 text-sm font-bold text-stone-600">{address(selectedRestaurant)}</p><p className="mt-1 text-xs font-bold text-stone-500">/{selectedRestaurant.slug}</p></div>}</div>
    {mode === 'create' && <><div className="mt-5 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">{copy.name_promotion_label}</p><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Halloween, Lunch Rush, Weekend Spin..." className="mt-3 w-full rounded-2xl border border-stone-200 px-4 py-4 font-semibold outline-none focus:border-[#FF6B00]" /></div><div className="mt-5 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">{copy.select_game_label}</p>{availableGames.map((game) => { const meta = getGameMeta(game.id); return <GameCard key={game.id} selected={gameType === game.id} onClick={() => setGameType(game.id)}><div className="flex items-start gap-4">{getGameVisual(game.id, 64).visual}<div><p className="text-2xl font-black">{game.name}</p><p className="mt-1 text-sm font-bold text-stone-600">{meta.description}</p><p className="mt-2 text-xs font-black uppercase text-green-700">Available now</p></div></div></GameCard>; })}{availableGames.length === 0 && <p className="mt-3 rounded-2xl bg-stone-50 p-4 text-sm font-bold text-stone-500">Loading available games...</p>}</div><div className="mt-5 rounded-3xl bg-white p-5 shadow-xl"><p className="text-sm font-black uppercase text-[#FF6B00]">Step 4: {copy.create_button_label}</p><button onClick={addPromotion} disabled={!canCreate} className="mt-3 w-full rounded-3xl bg-green-600 px-5 py-5 text-xl font-black text-white shadow-xl disabled:bg-stone-400">{saving ? 'Creating...' : copy.create_button_label}</button></div></>}
    {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
    {metricsError && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">Metrics error: {metricsError}</p>}
    {performanceError && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">Performance error: {performanceError}</p>}
    <div className="mt-5 space-y-4"><div className="rounded-3xl bg-white p-5 shadow-xl"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black uppercase text-[#FF6B00]">{mode === 'create' ? 'Drafts in progress' : 'Managed promotions'}</p><p className="mt-2 text-sm font-bold text-stone-500">{mode === 'create' ? 'Drafts appear here while they are still being built. Published campaigns move to Manage Promotions.' : 'Default view shows live active promotions. Pending campaigns have a future start time and are not playable yet.'}</p>{metricsInfo && <p className="mt-2 text-xs font-black text-stone-400">{metricsInfo}</p>}</div><button onClick={loadPromotionMetrics} className="rounded-full bg-stone-100 px-4 py-3 text-xs font-black text-stone-700">Refresh Metrics</button></div>{mode === 'manage' && <div className="mt-4 grid grid-cols-5 gap-2 rounded-2xl bg-stone-50 p-2">{(['active','pending','draft','ended','all'] as Filter[]).map((f) => <button key={f} onClick={() => setFilter(f)} className={`rounded-xl px-2 py-3 text-xs font-black ${filter === f ? 'bg-[#1F1F1F] text-white shadow' : 'bg-white text-stone-600'}`}>{filterLabel(f)}<br />{statusCounts[f]}</button>)}</div>}</div>{selectedRestaurant && visiblePromotions.length === 0 && <div className="rounded-3xl bg-white p-6 shadow-xl"><p className="text-2xl font-black">{mode === 'create' ? copy.no_drafts_title : `No ${filter} promotions`}</p><p className="mt-2 text-sm font-semibold text-stone-600">{mode === 'create' ? copy.no_drafts_copy : 'Switch filters to view other statuses.'}</p></div>}{selectedRestaurant && visiblePromotions.map((p) => { const s = statusOf(p); const metric = counts[p.id] || countsBySlug[p.slug] || { issued: 0, redeemed: 0 }; const rate = metric.issued ? Math.round((metric.redeemed / metric.issued) * 100) : 0; const playHref = `/play/${selectedRestaurant.slug}/${p.slug}`; const loadingPerformance = loadingPerformanceId === p.id; return <div key={p.id} className="rounded-3xl bg-white p-5 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h3 className="text-3xl font-black">{p.name}</h3><p className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-black uppercase ${promotionBadgeClass(s)}`}>{s}</p>{s === 'pending' && <p className="mt-2 rounded-2xl bg-yellow-50 p-3 text-xs font-black text-yellow-800">This campaign is scheduled for the future and is not playable yet.</p>}</div><a href={`/admin/promotions/${p.id}/builder`} className="rounded-full bg-orange-50 px-4 py-2 text-center text-sm font-black text-[#FF6B00]">{s === 'draft' ? 'Build' : 'Edit'}</a></div>{mode === 'manage' && <><div className="mt-4 rounded-2xl bg-orange-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-[#FF6B00]">Restaurant Location</p><p className="mt-1 text-xl font-black">{selectedRestaurant.name}</p><p className="mt-1 text-sm font-bold text-stone-600">{address(selectedRestaurant)}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="text-xs font-black uppercase tracking-wide text-stone-500">Promotion Start</p><p className="mt-1 text-sm font-black text-stone-800">{fmt(p.starts_at)}</p></div><div><p className="text-xs font-black uppercase tracking-wide text-stone-500">Promotion Expiry</p><p className="mt-1 text-sm font-black text-stone-800">{fmt(p.ends_at)}</p></div></div></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><button onClick={() => loadPromotionPerformance(p.id)} className="rounded-2xl bg-stone-50 p-3 text-[#1F1F1F] transition hover:bg-orange-50 active:scale-[0.98]"><p className="text-xl font-black">{loadingPerformance ? '...' : metric.issued}</p><p className="text-xs font-bold text-stone-500">Issued</p><p className="mt-1 text-[10px] font-black uppercase text-[#FF6B00]">Details</p></button><button onClick={() => loadPromotionPerformance(p.id)} className="rounded-2xl bg-stone-50 p-3 text-[#1F1F1F] transition hover:bg-orange-50 active:scale-[0.98]"><p className="text-xl font-black">{loadingPerformance ? '...' : metric.redeemed}</p><p className="text-xs font-bold text-stone-500">Redeemed</p><p className="mt-1 text-[10px] font-black uppercase text-[#FF6B00]">Details</p></button><button onClick={() => loadPromotionPerformance(p.id)} className="rounded-2xl bg-stone-50 p-3 text-[#1F1F1F] transition hover:bg-orange-50 active:scale-[0.98]"><p className="text-xl font-black">{loadingPerformance ? '...' : `${rate}%`}</p><p className="text-xs font-bold text-stone-500">Rate</p><p className="mt-1 text-[10px] font-black uppercase text-[#FF6B00]">Details</p></button></div></>}<p className="mt-4 break-all text-sm font-black text-[#FF6B00]">{playHref}</p><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={(event) => copyPlayLink(event, p)} className="rounded-2xl bg-[#1F1F1F] px-4 py-3 text-sm font-black text-white">{copiedId === p.id ? 'Copied!' : 'Copy Link'}</button>{s === 'active' && <a href={playHref} target="_blank" rel="noreferrer" className="rounded-2xl bg-[#FF6B00] px-4 py-3 text-center text-sm font-black text-white">Open Promotion</a>}<a href={`/admin/promotions/${p.id}/print`} target="_blank" className="rounded-2xl bg-green-600 px-4 py-3 text-center text-sm font-black text-white">Print Kit</a>{s === 'draft' ? <button onClick={(event) => deletePromotion(event, p)} disabled={deletingId === p.id} className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600">{deletingId === p.id ? 'Deleting...' : 'Delete Draft'}</button> : (s === 'active' || s === 'pending') ? <button onClick={(event) => endPromotion(event, p)} disabled={endingId === p.id} className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600">{endingId === p.id ? 'Ending...' : 'End Promotion'}</button> : <span className="rounded-2xl bg-stone-100 px-4 py-3 text-center text-sm font-black text-stone-500">Promotion Ended</span>}</div></div>; })}</div>
  </section>
  {performance && <div style={{ zIndex: UI_LAYERS.modal }} className="fixed inset-0 flex items-end justify-center bg-black/40 px-3 py-4 sm:items-center"><section className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#FF6B00]">Promotion Performance</p><h2 className="mt-1 text-3xl font-black">{performance.promotion.name}</h2><p className="mt-1 text-sm font-bold text-stone-500">{performance.restaurant.name} — {performance.restaurant.address || 'Address not added'}</p></div><button onClick={() => setPerformance(null)} className="rounded-full bg-stone-100 px-4 py-3 text-sm font-black text-stone-700">Close</button></div><div className="mt-5 grid grid-cols-4 gap-2 text-center"><div className="rounded-2xl bg-orange-50 p-3"><p className="text-2xl font-black">{performance.summary.issued}</p><p className="text-xs font-bold text-stone-500">Issued</p></div><div className="rounded-2xl bg-green-50 p-3"><p className="text-2xl font-black">{performance.summary.redeemed}</p><p className="text-xs font-bold text-stone-500">Redeemed</p></div><div className="rounded-2xl bg-stone-50 p-3"><p className="text-2xl font-black">{performance.summary.active}</p><p className="text-xs font-bold text-stone-500">Active</p></div><div className="rounded-2xl bg-stone-50 p-3"><p className="text-2xl font-black">{performance.summary.expired}</p><p className="text-xs font-bold text-stone-500">Expired</p></div></div><div className="mt-4 rounded-3xl bg-[#1F1F1F] p-4 text-white"><p className="text-sm font-black uppercase tracking-wide text-white/60">Redemption Rate</p><p className="mt-1 text-4xl font-black">{performance.summary.redemptionRate}%</p><p className="mt-1 text-sm font-bold text-white/60">Coupons expire after {performance.promotion.coupon_expiry_minutes} minutes.</p></div><div className="mt-4 rounded-3xl bg-orange-50 p-4"><p className="text-sm font-black uppercase text-[#FF6B00]">Reward Breakdown</p><div className="mt-3 space-y-2">{Object.entries(performance.rewardsBreakdown).length === 0 && <p className="text-sm font-bold text-stone-500">No coupons issued yet.</p>}{Object.entries(performance.rewardsBreakdown).map(([reward, count]) => <div key={reward} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3"><p className="text-sm font-black text-stone-700">{reward}</p><p className="rounded-full bg-[#FF6B00] px-3 py-1 text-sm font-black text-white">{count}</p></div>)}</div></div><div className="mt-4"><p className="text-sm font-black uppercase text-[#FF6B00]">Issued Coupon Ledger</p><div className="mt-3 space-y-3">{performance.coupons.length === 0 && <div className="rounded-3xl bg-stone-50 p-5"><p className="text-lg font-black">No issued coupons yet</p><p className="mt-1 text-sm font-bold text-stone-500">When customers play this promotion, issued coupons will appear here.</p></div>}{performance.coupons.map((coupon) => <article key={coupon.id} className="rounded-3xl border border-stone-100 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xl font-black">{coupon.coupon_code || 'No code'}</p><p className="mt-1 text-sm font-bold text-stone-500">{coupon.item_won} — {coupon.discount_type}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${statusBadgeClass(coupon.display_status)}`}>{coupon.display_status}</span></div><div className="mt-3 grid gap-2 text-xs font-bold text-stone-500 sm:grid-cols-3"><p>Issued: {fmtCompact(coupon.issued_at)}</p><p>Expires: {fmtCompact(coupon.expires_at)}</p><p>Redeemed: {fmtCompact(coupon.redeemed_at)}</p></div></article>)}</div>{performance.coupons.length >= performance.limit && <p className="mt-3 rounded-2xl bg-yellow-50 p-3 text-xs font-bold text-yellow-800">Showing latest {performance.limit} coupons for performance.</p>}</div></section></div>}
  </main>;
}

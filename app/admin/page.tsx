'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { loadSiteContentMap } from '@/lib/site-content-client';

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  brand_color: string | null;
  owner_name?: string | null;
};

type MetricCounts = {
  restaurants: number;
  activePromotions: number;
  totalPromotions: number;
  issuedCoupons: number;
  redeemedCoupons: number;
};

const welcomeMessages = [
  'Ready to make today’s orders more exciting?',
  'Let’s build a promotion that gets guests smiling.',
  'What promotion are we launching today?',
  'Let’s turn menu attention into real sales.',
];

const fallbackCopy = {
  eyebrow: 'Today’s workspace',
  headline_fallback: 'Ready to make today’s orders more exciting?',
  subheadline: 'Build promotions, publish QR-ready games, validate coupons, and start turning attention into orders.',
  create_promotion_title: 'Create Promotion',
  create_promotion_copy: 'Start a brand-new campaign draft and build a reward wheel.',
  manage_promotions_title: 'Manage Promotions',
  manage_promotions_copy: 'Edit drafts, monitor active campaigns, end promotions, and copy QR links.',
  validate_coupons_title: 'Validate Coupons',
  validate_coupons_copy: 'Scan or enter customer coupon codes at the counter.',
  menus_title: 'Menus',
  menus_copy: 'Build breakfast, lunch, dinner, and special menus for promotions.',
  restaurants_title: 'Manage Restaurants',
  restaurants_copy: 'Add locations and update restaurant profiles.',
};

export default function AdminPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [counts, setCounts] = useState<MetricCounts>({ restaurants: 0, activePromotions: 0, totalPromotions: 0, issuedCoupons: 0, redeemedCoupons: 0 });
  const [copy, setCopy] = useState(fallbackCopy);
  const [message, setMessage] = useState(welcomeMessages[0]);
  const [loading, setLoading] = useState(true);
  const [metricsError, setMetricsError] = useState('');

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function load() {
      const loadedCopy = await loadSiteContentMap(supabase, 'admin', fallbackCopy);
      setCopy(loadedCopy as typeof fallbackCopy);
      setMessage((loadedCopy.headline_fallback as string) || welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)]);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) { window.location.href = '/auth'; return; }
      const requestedSlug = new URLSearchParams(window.location.search).get('slug');
      const { data } = await supabase.from('restaurants').select('id,name,slug,brand_color,owner_name').eq('owner_id', user.id).order('created_at', { ascending: false });
      const ownedRestaurants = (data || []) as Restaurant[];
      if (ownedRestaurants.length === 0) { window.location.href = '/admin/restaurants'; return; }
      const matched = requestedSlug ? ownedRestaurants.find((item) => item.slug === requestedSlug) : ownedRestaurants[0];
      const selected = matched || ownedRestaurants[0];
      setRestaurants(ownedRestaurants);
      setSelectedSlug(selected.slug);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const restaurant = restaurants.find((item) => item.slug === selectedSlug) || restaurants[0];

  useEffect(() => {
    async function loadCounts() {
      if (restaurants.length === 0) return;
      setMetricsError('');

      const response = await fetch('/api/admin/dashboard-metrics', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMetricsError(payload?.error || 'Could not load dashboard metrics.');
        return;
      }

      setCounts({
        restaurants: payload.restaurants || 0,
        activePromotions: payload.activePromotions || 0,
        totalPromotions: payload.totalPromotions || 0,
        issuedCoupons: payload.issuedCoupons || 0,
        redeemedCoupons: payload.redeemedCoupons || 0,
      });
    }
    loadCounts();
  }, [restaurants]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6 text-[#1F1F1F]">Loading dashboard...</main>;
  if (!restaurant) return <main className="min-h-screen bg-[#FFF8F0] p-6 text-[#1F1F1F]">No restaurant selected.</main>;

  const redemptionRate = counts.issuedCoupons > 0 ? Math.round((counts.redeemedCoupons / counts.issuedCoupons) * 100) : 0;
  const actionTiles = [
    { title: copy.create_promotion_title, copy: copy.create_promotion_copy, href: `/admin/promotions?slug=${restaurant.slug}&mode=create`, icon: '🎯', primary: true },
    { title: copy.manage_promotions_title, copy: copy.manage_promotions_copy, href: `/admin/promotions?slug=${restaurant.slug}&mode=manage`, icon: '📊', primary: false },
    { title: 'Issued Coupons', copy: 'Review coupon codes, reward details, issue times, expiry status, and redemptions.', href: '/admin/coupons', icon: '🎟️', primary: false },
    { title: copy.validate_coupons_title, copy: copy.validate_coupons_copy, href: '/admin/validate', icon: '✅', primary: false },
    { title: copy.menus_title, copy: copy.menus_copy, href: '/admin/menus', icon: '🍽️', primary: false },
    { title: 'Dining Intelligence', copy: 'Monitor active dining sessions, table metrics, and spending intelligence in real time.', href: '/admin/sessions', icon: '📡', primary: false },
    { title: copy.restaurants_title, copy: copy.restaurants_copy, href: '/admin/restaurants', icon: '🏪', primary: false },
  ];

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4"><div><h1 className="text-3xl font-black text-[#FF6B00]">Restaurant command center</h1></div><button onClick={logout} className="rounded-full bg-red-500 px-5 py-3 text-sm font-black text-white shadow-lg">Logout</button></div>
        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200"><p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">{copy.eyebrow}</p><h2 className="mt-3 text-4xl font-black leading-tight">{message}</h2><p className="mt-3 text-sm font-semibold text-white/85">{copy.subheadline}</p></div>
        <div className="mt-5 rounded-3xl bg-white p-4 shadow"><p className="text-xs font-black uppercase tracking-wide text-[#FF6B00]">Dashboard totals</p><p className="mt-1 text-sm font-bold text-stone-500">Metrics include all restaurant locations in this account.</p>{metricsError && <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-black text-red-700">{metricsError}</p>}<a href="/admin/coupons" className="mt-4 block rounded-2xl bg-[#1F1F1F] px-5 py-4 text-center text-sm font-black text-white shadow-lg">View Issued Coupon Details</a></div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5"><div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black">{counts.restaurants}</p><p className="text-xs font-bold text-stone-500">Restaurants</p></div><div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black">{counts.activePromotions}</p><p className="text-xs font-bold text-stone-500">Active Promos</p></div><a href="/admin/coupons" className="rounded-3xl bg-white p-4 text-center shadow transition hover:-translate-y-1 hover:shadow-xl"><p className="text-3xl font-black">{counts.issuedCoupons}</p><p className="text-xs font-bold text-stone-500">Issued</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-[#FF6B00]">View details</p></a><div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black">{counts.redeemedCoupons}</p><p className="text-xs font-bold text-stone-500">Redeemed</p></div><div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black">{redemptionRate}%</p><p className="text-xs font-bold text-stone-500">Redemption</p></div></div>
        <div className="mt-5 grid gap-4 md:grid-cols-6">{actionTiles.map((tile) => <a key={tile.title} href={tile.href} className={`rounded-3xl p-5 shadow-xl transition hover:-translate-y-1 ${tile.primary ? 'bg-green-600 text-white' : 'bg-white text-[#1F1F1F]'}`}><div className="text-4xl">{tile.icon}</div><h3 className="mt-4 text-2xl font-black">{tile.title}</h3><p className={`mt-2 text-sm font-semibold leading-6 ${tile.primary ? 'text-white/85' : 'text-stone-600'}`}>{tile.copy}</p></a>)}</div>
      </section>
    </main>
  );
}

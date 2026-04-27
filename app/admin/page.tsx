'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  brand_color: string | null;
  owner_name?: string | null;
};

type MetricCounts = {
  menus: number;
  promotions: number;
  rewards: number;
};

const welcomeMessages = [
  'Ready to make today’s orders more exciting?',
  'Let’s build a promotion that gets guests smiling.',
  'What promotion are we launching today?',
  'Let’s turn menu attention into real sales.',
];

export default function AdminPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [counts, setCounts] = useState<MetricCounts>({ menus: 0, promotions: 0, rewards: 0 });
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [message, setMessage] = useState(welcomeMessages[0]);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function load() {
      setNow(new Date());
      setMessage(welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)]);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        window.location.href = '/auth';
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const requestedSlug = params.get('slug');

      const { data } = await supabase
        .from('restaurants')
        .select('id,name,slug,brand_color,owner_name')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      const ownedRestaurants = (data || []) as Restaurant[];

      if (ownedRestaurants.length === 0) {
        window.location.href = '/admin/restaurants';
        return;
      }

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
      if (!restaurant) return;

      const menuCount = await supabase.from('menus').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurant.id);
      const promotionCount = await supabase.from('promotions').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurant.id);
      const rewardCount = await supabase.from('rewards').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurant.id);

      setCounts({
        menus: menuCount.count || 0,
        promotions: promotionCount.count || 0,
        rewards: rewardCount.count || 0,
      });
    }

    loadCounts();
  }, [restaurant, supabase]);

  function updateSelectedRestaurant(nextSlug: string) {
    setSelectedSlug(nextSlug);
    window.history.replaceState(null, '', `/admin?slug=${nextSlug}`);
  }

  async function copyPromotionHubLink() {
    if (!restaurant || typeof window === 'undefined') return;
    const link = `${window.location.origin}/admin/promotions?slug=${restaurant.slug}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (loading) {
    return <main className="min-h-screen bg-[#FFF8F0] p-6 text-[#1F1F1F]">Loading dashboard...</main>;
  }

  if (!restaurant) {
    return <main className="min-h-screen bg-[#FFF8F0] p-6 text-[#1F1F1F]">No restaurant selected.</main>;
  }

  const actionTiles = [
    { title: 'Restaurants', copy: 'Add locations and manage restaurant profiles.', href: '/admin/restaurants', icon: '🏪' },
    { title: 'Menus', copy: 'Create breakfast, lunch, dinner, and special menus.', href: `/admin/menu?slug=${restaurant.slug}`, icon: '🍽️' },
    { title: 'Promotions', copy: 'Build wheels, rewards, and customer campaigns.', href: `/admin/promotions?slug=${restaurant.slug}`, icon: '🎯' },
  ];

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
            <p className="mt-1 text-sm font-bold text-stone-500">Restaurant command center</p>
          </div>
          <div className="text-right text-xs font-black text-stone-500">
            {now && <><p>{now.toLocaleDateString()}</p><p>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></>}
          </div>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Today’s workspace</p>
          <h2 className="mt-3 text-4xl font-black leading-tight">{message}</h2>
          <p className="mt-3 text-sm font-semibold text-white/85">Choose a restaurant, build menu-backed promotions, and publish QR-ready customer experiences.</p>

          <label className="mt-6 block text-sm font-black text-white/90">Selected restaurant</label>
          <select value={selectedSlug} onChange={(event) => updateSelectedRestaurant(event.target.value)} className="mt-2 w-full rounded-2xl border-0 bg-white px-4 py-4 text-lg font-black text-[#1F1F1F] outline-none">
            {restaurants.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
          </select>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black">{counts.menus}</p><p className="text-xs font-bold text-stone-500">Menus</p></div>
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black">{counts.promotions}</p><p className="text-xs font-bold text-stone-500">Promos</p></div>
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black">{counts.rewards}</p><p className="text-xs font-bold text-stone-500">Rewards</p></div>
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase text-[#FF6B00]">Active restaurant</p>
              <h3 className="mt-1 text-2xl font-black">{restaurant.name}</h3>
              <p className="mt-1 break-all text-sm font-semibold text-stone-500">{restaurant.slug}</p>
            </div>
            <a href={`/admin/promotions?slug=${restaurant.slug}`} className="rounded-full bg-green-600 px-4 py-2 text-sm font-black text-white">Create</a>
          </div>
          <button onClick={copyPromotionHubLink} className="mt-4 w-full rounded-2xl bg-[#FF6B00] px-4 py-3 font-black text-white">
            {copied ? 'Copied!' : 'Copy Promotion Workspace Link'}
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {actionTiles.map((tile) => (
            <a key={tile.title} href={tile.href} className="rounded-3xl bg-white p-5 shadow-xl transition hover:-translate-y-1">
              <div className="text-4xl">{tile.icon}</div>
              <h3 className="mt-4 text-2xl font-black">{tile.title}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">{tile.copy}</p>
            </a>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <a href={`/admin/promotions?slug=${restaurant.slug}`} className="rounded-3xl bg-green-600 p-5 text-center text-xl font-black text-white shadow-xl">Build / Test Promotion</a>
          <button onClick={logout} className="rounded-3xl bg-red-500 p-5 text-xl font-black text-white shadow-xl">Logout</button>
        </div>
      </section>
    </main>
  );
}

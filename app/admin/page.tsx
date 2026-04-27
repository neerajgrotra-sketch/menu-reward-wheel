'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  brand_color: string | null;
  owner_name?: string | null;
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
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [message, setMessage] = useState(welcomeMessages[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setNow(new Date());
      setMessage(welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)]);

      const supabase = createClient();
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

      const matched = requestedSlug
        ? ownedRestaurants.find((item) => item.slug === requestedSlug)
        : ownedRestaurants[0];

      setRestaurants(ownedRestaurants);
      setSelectedSlug((matched || ownedRestaurants[0]).slug);
      setLoading(false);
    }

    load();
  }, []);

  const restaurant = restaurants.find((item) => item.slug === selectedSlug) || restaurants[0];

  function updateSelectedRestaurant(nextSlug: string) {
    setSelectedSlug(nextSlug);
    const nextUrl = `/admin?slug=${nextSlug}`;
    window.history.replaceState(null, '', nextUrl);
  }

  async function copyPromotionHubLink() {
    if (!restaurant || typeof window === 'undefined') return;
    const link = `${window.location.origin}/admin/promotions?slug=${restaurant.slug}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (loading) return <div className="p-6">Loading dashboard...</div>;
  if (!restaurant) return <div className="p-6">No restaurant selected.</div>;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
          {now && <p className="text-right text-xs font-bold text-gray-500">{now.toLocaleDateString()}<br />{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
        </div>

        <h2 className="mt-4 text-2xl font-black">Dashboard 👋</h2>
        <p className="mt-2 text-sm font-semibold text-gray-600">{message}</p>

        <label className="mt-5 block text-sm font-black text-gray-700">Selected restaurant</label>
        <select value={selectedSlug} onChange={(event) => updateSelectedRestaurant(event.target.value)} className="mt-2 w-full rounded-2xl border px-4 py-3 font-black outline-none focus:border-[#FF6B00]">
          {restaurants.map((item) => (
            <option key={item.id} value={item.slug}>{item.name}</option>
          ))}
        </select>

        <div className="mt-4 rounded-xl bg-orange-50 p-3 text-sm">
          <p className="font-bold text-gray-700">Promotion workspace</p>
          <p className="mt-1 text-xs text-gray-500">Create and test customer-facing promotion links from this restaurant.</p>
          <button onClick={copyPromotionHubLink} className="mt-3 w-full rounded-xl bg-[#FF6B00] px-4 py-2 font-black text-white">
            {copied ? 'Copied!' : 'Copy Promotion Workspace Link'}
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <a href="/admin/restaurants" className="block rounded-xl bg-gray-200 p-3 text-center font-bold">Restaurants</a>
          <a href={`/admin/menu?slug=${restaurant.slug}`} className="block rounded-xl bg-gray-200 p-3 text-center font-bold">Menus</a>
          <a href={`/admin/promotions?slug=${restaurant.slug}`} className="block rounded-xl bg-gray-200 p-3 text-center font-bold">Promotions</a>
          <a href={`/admin/promotions?slug=${restaurant.slug}`} className="block rounded-xl bg-green-600 p-3 text-center font-bold text-white">Test Promotion</a>
        </div>

        <button onClick={logout} className="mt-6 w-full rounded-xl bg-red-500 p-3 font-bold text-white">Logout</button>
      </div>
    </main>
  );
}

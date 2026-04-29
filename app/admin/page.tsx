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

export default function AdminPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [counts, setCounts] = useState<MetricCounts>({ restaurants: 0, activePromotions: 0, totalPromotions: 0, issuedCoupons: 0, redeemedCoupons: 0 });
  const [message, setMessage] = useState(welcomeMessages[0]);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function load() {
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

      const activePromotionCount = await supabase
        .from('promotions')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurant.id)
        .eq('status', 'active');

      const totalPromotionCount = await supabase
        .from('promotions')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurant.id);

      const issuedCouponCount = await supabase
        .from('coupon_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurant.id);

      const redeemedCouponCount = await supabase
        .from('coupon_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurant.id)
        .eq('status', 'redeemed');

      setCounts({
        restaurants: restaurants.length,
        activePromotions: activePromotionCount.count || 0,
        totalPromotions: totalPromotionCount.count || 0,
        issuedCoupons: issuedCouponCount.count || 0,
        redeemedCoupons: redeemedCouponCount.count || 0,
      });
    }

    loadCounts();
  }, [restaurant, restaurants.length, supabase]);

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

  const redemptionRate = counts.issuedCoupons > 0 ? Math.round((counts.redeemedCoupons / counts.issuedCoupons) * 100) : 0;

  const actionTiles = [
    { title: 'Create Promotion', copy: 'Launch a new campaign and build a reward wheel.', href: `/admin/promotions?slug=${restaurant.slug}`, icon: '🎯', primary: true },
    { title: 'Validate Coupons', copy: 'Scan or enter customer coupon codes at the counter.', href: '/admin/validate', icon: '✅', primary: false },
    { title: 'Menus', copy: 'Build breakfast, lunch, dinner, and special menus for promotions.', href: `/admin/menu?slug=${restaurant.slug}`, icon: '🍽️', primary: false },
    { title: 'Manage Restaurants', copy: 'Add locations and update restaurant profiles.', href: '/admin/restaurants', icon: '🏪', primary: false },
  ];

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
            <p className="mt-1 text-sm font-bold text-stone-500">Restaurant command center</p>
          </div>
          <button onClick={logout} className="rounded-full bg-red-500 px-5 py-3 text-sm font-black text-white shadow-lg">
            Logout
          </button>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Today’s workspace</p>
          <h2 className="mt-3 text-4xl font-black leading-tight">{message}</h2>
          <p className="mt-3 text-sm font-semibold text-white/85">
            Build promotions, publish QR-ready games, validate coupons, and start turning attention into orders.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black">{counts.restaurants}</p><p className="text-xs font-bold text-stone-500">Restaurants</p></div>
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black">{counts.activePromotions}</p><p className="text-xs font-bold text-stone-500">Active Promos</p></div>
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black">{counts.issuedCoupons}</p><p className="text-xs font-bold text-stone-500">Issued</p></div>
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black">{counts.redeemedCoupons}</p><p className="text-xs font-bold text-stone-500">Redeemed</p></div>
          <div className="rounded-3xl bg-white p-4 text-center shadow"><p className="text-3xl font-black">{redemptionRate}%</p><p className="text-xs font-bold text-stone-500">Redemption</p></div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          {actionTiles.map((tile) => (
            <a key={tile.title} href={tile.href} className={`rounded-3xl p-5 shadow-xl transition hover:-translate-y-1 ${tile.primary ? 'bg-green-600 text-white' : 'bg-white text-[#1F1F1F]'}`}>
              <div className="text-4xl">{tile.icon}</div>
              <h3 className="mt-4 text-2xl font-black">{tile.title}</h3>
              <p className={`mt-2 text-sm font-semibold leading-6 ${tile.primary ? 'text-white/85' : 'text-stone-600'}`}>{tile.copy}</p>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

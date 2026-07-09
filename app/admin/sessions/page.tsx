'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Realtime is a signal to re-check truth, not truth itself (Rule 41) — every
// postgres_changes event just triggers a refetch of the summary endpoint,
// and the poll below is the fallback in case a channel silently drops.
const SUMMARY_POLL_MS = 45_000;

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  hero_image_url: string | null;
  logo_url: string | null;
  address_line1: string | null;
  city: string | null;
  province_state: string | null;
};

type RestaurantSummary = {
  activeSessions: number;
  currentGuests: number;
  activeOrders: number;
  activeTables: number;
};

function address(r: Restaurant): string {
  return [r.address_line1, r.city, r.province_state].filter(Boolean).join(', ') || 'Address not added';
}

function RestaurantTile({ restaurant, summary }: { restaurant: Restaurant; summary: RestaurantSummary }) {
  return (
    <a
      href={`/admin/sessions/${restaurant.id}`}
      className="block overflow-hidden rounded-3xl bg-white shadow-xl transition hover:-translate-y-1 hover:shadow-2xl"
    >
      {/* Hero zone — restaurant's own cover photo, brand gradient fallback (never a stock placeholder) */}
      <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-orange-200 via-amber-100 to-red-100">
        {restaurant.hero_image_url && (
          <img
            src={restaurant.hero_image_url}
            alt={`${restaurant.name} cover`}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      {/* Info card — logo straddles hero/card boundary, matches restaurant profile card geometry */}
      <div className="relative -mt-8 rounded-t-3xl bg-white px-5 pb-5 pt-5 shadow-xl">
        <div className="absolute -top-10 left-5">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-stone-100">
            {restaurant.logo_url ? (
              <img src={restaurant.logo_url} alt={`${restaurant.name} logo`} className="h-full w-full object-contain" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-2xl">🍽️</span>
            )}
          </div>
        </div>

        <div className="mt-9">
          <h3 className="truncate text-xl font-black text-[#1F1F1F]">{restaurant.name}</h3>
          <p className="mt-1 truncate text-sm font-semibold text-stone-500">📍 {address(restaurant)}</p>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <div className="rounded-2xl bg-stone-50 p-3 text-center">
            <p className="text-lg font-black text-stone-900">{summary.activeTables}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Active Tables</p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-3 text-center">
            <p className="text-lg font-black text-stone-900">{summary.activeSessions}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Active Sessions</p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-3 text-center">
            <p className="text-lg font-black text-stone-900">{summary.currentGuests}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Guests</p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-3 text-center">
            <p className="text-lg font-black text-stone-900">{summary.activeOrders}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Active Orders</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-[#FF6B00] px-4 py-3 text-center text-sm font-black text-white">
          View Live Sessions
        </div>
      </div>
    </a>
  );
}

export default function DiningIntelligencePage() {
  const supabase = useMemo(() => createClient(), []);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [summaries, setSummaries] = useState<Record<string, RestaurantSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSummary = useCallback(async () => {
    const res = await fetch('/api/admin/sessions/summary', { cache: 'no-store' });
    const payload = await res.json().catch(() => ({}));
    if (res.ok) setSummaries(payload.summary || {});
  }, []);

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { window.location.href = '/auth'; return; }

      const result = await supabase
        .from('restaurants')
        .select('id,name,slug,hero_image_url,logo_url,address_line1,city,province_state')
        .eq('owner_id', userData.user.id)
        .is('deleted_at', null)
        .order('name');

      if (result.error) { setError(result.error.message); setLoading(false); return; }
      setRestaurants((result.data || []) as Restaurant[]);

      await loadSummary();
      setLoading(false);
    }
    load();
  }, [supabase, loadSummary]);

  // Live refresh — a session becoming active/completed/abandoned or an order
  // changing status should update the tiles without a manual reload. Scoped
  // per restaurant_id because visit_sessions/orders only allow owner SELECT
  // (Rule 40), and postgres_changes filters can't express "in restaurantIds".
  useEffect(() => {
    if (restaurants.length === 0) return;

    const channel = supabase.channel('dining-intelligence-summary');
    for (const r of restaurants) {
      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'visit_sessions', filter: `restaurant_id=eq.${r.id}` },
          () => { void loadSummary(); },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${r.id}` },
          () => { void loadSummary(); },
        );
    }
    channel.subscribe();

    const pollId = setInterval(() => { void loadSummary(); }, SUMMARY_POLL_MS);

    return () => {
      clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, [restaurants, supabase, loadSummary]);

  const emptySummary: RestaurantSummary = { activeSessions: 0, currentGuests: 0, activeOrders: 0, activeTables: 0 };

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">Dining Intelligence</h1>
          </div>
          <a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">
            Dashboard
          </a>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Live Dining Intelligence</p>
          <h2 className="mt-3 text-4xl font-black leading-tight">
            Track every active table and customer session across your restaurants in real time.
          </h2>
        </div>

        {error && (
          <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>
        )}

        {loading && (
          <p className="mt-6 text-sm font-semibold text-stone-400">Loading restaurants…</p>
        )}

        {!loading && !error && restaurants.length === 0 && (
          <div className="mt-6 rounded-3xl bg-white p-6 shadow-xl">
            <p className="text-2xl font-black">No restaurants yet</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">
              Add your first restaurant to start tracking live dining sessions.
            </p>
            <a
              href="/admin/restaurants"
              className="mt-4 inline-block rounded-full bg-[#FF6B00] px-5 py-3 text-sm font-black text-white shadow"
            >
              + Add Restaurant
            </a>
          </div>
        )}

        {!loading && restaurants.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {restaurants.map((r) => (
              <RestaurantTile key={r.id} restaurant={r} summary={summaries[r.id] || emptySummary} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

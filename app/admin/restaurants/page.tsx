'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Restaurant } from '@/components/admin/restaurants/types';
import { RestaurantDirectoryTile, EMPTY_TILE_SUMMARY } from '@/components/admin/restaurants/RestaurantDirectoryTile';
import type { RestaurantTileSummary } from '@/components/admin/restaurants/RestaurantDirectoryTile';
import { AddRestaurantTile } from '@/components/admin/restaurants/AddRestaurantTile';

type FilterId = 'all' | 'ordering' | 'promotion' | 'active';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all',       label: 'All Restaurants'   },
  { id: 'ordering',  label: 'Ordering Enabled'  },
  { id: 'promotion', label: 'Promotion Enabled' },
  { id: 'active',    label: 'Active Locations'  },
];

export default function RestaurantsDirectoryPage() {
  const supabase = useMemo(() => createClient(), []);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [summaries, setSummaries] = useState<Record<string, RestaurantTileSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');

  const loadSummary = useCallback(async () => {
    const res = await fetch('/api/admin/restaurants/summary', { cache: 'no-store' });
    const payload = await res.json().catch(() => ({}));
    if (res.ok) setSummaries(payload.summary || {});
  }, []);

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { window.location.href = '/auth'; return; }

      const result = await supabase
        .from('restaurants')
        .select('*')
        .eq('owner_id', userData.user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (result.error) { setError(result.error.message); setLoading(false); return; }
      setRestaurants((result.data || []) as Restaurant[]);

      await loadSummary();
      setLoading(false);
    }
    load();
  }, [supabase, loadSummary]);

  const visibleRestaurants = restaurants.filter((r) => {
    const summary = summaries[r.id] || EMPTY_TILE_SUMMARY;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matches = r.name.toLowerCase().includes(q) || (r.city || '').toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (filter === 'ordering' && !summary.orderingEnabled) return false;
    if (filter === 'promotion' && summary.activePromotionsCount === 0) return false;
    if (filter === 'active' && summary.activeSessionsCount === 0) return false;
    return true;
  });

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">Restaurant Directory</h1>
          </div>
          <a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">
            Dashboard
          </a>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Restaurant Directory</p>
          <h2 className="mt-3 text-4xl font-black leading-tight">
            Manage all restaurant locations, branding, menus, promotions, tables and customer experience.
          </h2>
        </div>

        <div className="mt-5 rounded-3xl bg-white p-2 shadow-xl">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search restaurants by name or city…"
            className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#FF6B00]"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors ${
                filter === f.id ? 'bg-[#1F1F1F] text-white shadow' : 'bg-white text-stone-600 shadow-sm'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}

        {loading && <p className="mt-6 text-sm font-semibold text-stone-400">Loading restaurants…</p>}

        {!loading && !error && restaurants.length === 0 && (
          <div className="mt-6 rounded-3xl bg-white p-6 shadow-xl">
            <p className="text-2xl font-black">No restaurants yet</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">
              Add your first restaurant to begin creating menus, promotions, QR campaigns, and branded experiences.
            </p>
            <a href="/setup" className="mt-4 inline-block rounded-full bg-[#FF6B00] px-5 py-3 text-sm font-black text-white shadow">
              + Add Restaurant
            </a>
          </div>
        )}

        {!loading && restaurants.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleRestaurants.map((r) => (
              <RestaurantDirectoryTile key={r.id} restaurant={r} summary={summaries[r.id] || EMPTY_TILE_SUMMARY} />
            ))}
            <AddRestaurantTile />
          </div>
        )}

        {!loading && restaurants.length > 0 && visibleRestaurants.length === 0 && (
          <p className="mt-6 text-center text-sm font-semibold text-stone-400">No restaurants match your search or filter.</p>
        )}
      </section>
    </main>
  );
}

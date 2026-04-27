'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  phone?: string | null;
  address_line1?: string | null;
  city?: string | null;
  cuisine_type?: string | null;
};

export default function RestaurantsPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const supabase = createClient();

  async function loadRestaurants() {
    const { data: sessionData } = await supabase.auth.getUser();
    const user = sessionData.user;

    if (!user) {
      window.location.href = '/auth';
      return;
    }

    const { data } = await supabase
      .from('restaurants')
      .select('id,name,slug,phone,address_line1,city,cuisine_type')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    setRestaurants((data || []) as Restaurant[]);
    setLoading(false);
  }

  useEffect(() => {
    loadRestaurants();
  }, []);

  async function copyLink(restaurant: Restaurant) {
    const link = `${window.location.origin}/admin/promotions?slug=${restaurant.slug}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(restaurant.id);
    setTimeout(() => setCopiedId(null), 1600);
  }

  async function deleteRestaurant(restaurant: Restaurant) {
    const confirmed = window.confirm(`Delete ${restaurant.name}? This will remove this restaurant and its related menus/promotions.`);
    if (!confirmed) return;

    setDeletingId(restaurant.id);
    setError('');

    const { error } = await supabase.rpc('delete_restaurant_cascade', {
      target_restaurant_id: restaurant.id,
    });

    if (error) {
      setError(error.message);
      setDeletingId(null);
      return;
    }

    await loadRestaurants();
    setDeletingId(null);
  }

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6">Loading restaurants...</main>;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
            <p className="mt-1 text-sm font-bold text-stone-500">Restaurant locations</p>
          </div>
          <a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Dashboard</a>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Manage Restaurants</p>
          <h2 className="mt-3 text-4xl font-black leading-tight">Add and manage your restaurant locations.</h2>
        </div>

        <a href="/setup" className="mt-5 block rounded-3xl bg-green-600 p-5 text-center text-xl font-black text-white shadow-xl">
          + Add Restaurant
        </a>

        {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}

        <div className="mt-5 space-y-4">
          {restaurants.map((restaurant) => {
            return (
              <article key={restaurant.id} className="overflow-hidden rounded-3xl bg-white shadow-xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-3xl font-black">{restaurant.name}</h3>
                    <p className="mt-1 text-sm font-bold text-stone-500">/{restaurant.slug}</p>
                  </div>
                  <button onClick={() => deleteRestaurant(restaurant)} disabled={deletingId === restaurant.id} className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600">
                    {deletingId === restaurant.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

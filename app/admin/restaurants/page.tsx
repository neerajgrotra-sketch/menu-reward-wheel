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
    await supabase.from('restaurants').delete().eq('id', restaurant.id);
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
          <p className="mt-3 text-sm font-semibold text-white/85">
            Each restaurant can have its own menus, promotions, QR links, and reward wheels. Start by adding a restaurant, then build menus and promotions for that location.
          </p>
        </div>

        <a href="/setup" className="mt-5 block rounded-3xl bg-green-600 p-5 text-center text-xl font-black text-white shadow-xl">
          + Add Restaurant
        </a>

        <div className="mt-5 space-y-4">
          {restaurants.length === 0 && (
            <div className="rounded-3xl bg-white p-6 shadow-xl">
              <p className="text-2xl font-black">No restaurants yet</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">
                Add your first restaurant to begin creating menus, promotions, QR campaigns, and customer reward wheels.
              </p>
            </div>
          )}

          {restaurants.map((restaurant, index) => {
            const address = [restaurant.address_line1, restaurant.city].filter(Boolean).join(', ');
            const promotionLink = `/admin/promotions?slug=${restaurant.slug}`;

            return (
              <article key={restaurant.id} className="overflow-hidden rounded-3xl bg-white shadow-xl">
                <div className="h-32 bg-gradient-to-br from-orange-200 via-amber-100 to-red-100 px-5 py-4">
                  <div className="flex h-full items-start justify-between">
                    <div className="rounded-2xl bg-white/80 px-3 py-2 text-sm font-black text-[#FF6B00] shadow">
                      Location #{index + 1}
                    </div>
                    <div className="text-4xl">🍽️</div>
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-3xl font-black">{restaurant.name}</h3>
                      <p className="mt-1 break-all text-sm font-bold text-stone-500">/{restaurant.slug}</p>
                    </div>
                    <button onClick={() => deleteRestaurant(restaurant)} disabled={deletingId === restaurant.id} className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600">
                      {deletingId === restaurant.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm font-semibold text-stone-600">
                    <p>📍 {address || 'Address not added yet'}</p>
                    <p>☎️ {restaurant.phone || 'Phone not added yet'}</p>
                    <p>🍛 {restaurant.cuisine_type || 'Cuisine not added yet'}</p>
                  </div>

                  <div className="mt-4 rounded-2xl bg-stone-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-stone-500">Current promotion workspace link</p>
                    <p className="mt-1 break-all text-sm font-black text-[#FF6B00]">{promotionLink}</p>
                    <button onClick={() => copyLink(restaurant)} className="mt-3 w-full rounded-2xl bg-[#FF6B00] px-4 py-3 font-black text-white">
                      {copiedId === restaurant.id ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <a href={`/admin?slug=${restaurant.slug}`} className="rounded-2xl bg-stone-200 px-4 py-3 text-center font-black">Open</a>
                    <a href={`/admin/promotions?slug=${restaurant.slug}`} className="rounded-2xl bg-green-600 px-4 py-3 text-center font-black text-white">Promotions</a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

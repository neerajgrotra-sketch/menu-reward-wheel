'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Restaurant = {
  id: string;
  name: string;
  slug: string;
};

export default function RestaurantsPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getUser();
      const user = sessionData.user;

      if (!user) {
        window.location.href = '/auth';
        return;
      }

      const { data } = await supabase
        .from('restaurants')
        .select('id,name,slug')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      setRestaurants((data || []) as Restaurant[]);
      setLoading(false);
    }

    load();
  }, []);

  if (loading) return <div className="p-6">Loading restaurants...</div>;

  return (
    <main className="min-h-screen bg-[#FFF8F0] p-6">
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-black text-[#FF6B00]">Your Restaurants</h1>
        <p className="mt-2 text-sm text-gray-600">Select a restaurant or create a new one.</p>

        <div className="mt-6 space-y-3">
          {restaurants.map((restaurant) => (
            <a key={restaurant.id} href={`/admin?slug=${restaurant.slug}`} className="block rounded-2xl bg-white p-4 shadow">
              <p className="font-black">{restaurant.name}</p>
              <p className="text-sm text-gray-500">/play/{restaurant.slug}</p>
            </a>
          ))}

          {restaurants.length === 0 && <p className="rounded-2xl bg-white p-4 text-sm text-gray-500 shadow">No restaurants yet.</p>}
        </div>

        <a href="/setup" className="mt-6 block w-full rounded-xl bg-green-600 p-4 text-center font-black text-white">
          + Add Restaurant
        </a>
      </div>
    </main>
  );
}

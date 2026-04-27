'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function RestaurantsPage() {
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('restaurants').select('*');
      setRestaurants(data || []);
    }
    load();
  }, []);

  return (
    <main className="min-h-screen bg-[#FFF8F0] p-6">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-black text-[#FF6B00]">Your Restaurants</h1>

        <div className="mt-6 space-y-3">
          {restaurants.map(r => (
            <a
              key={r.id}
              href={`/admin?slug=${r.slug}`}
              className="block rounded-2xl bg-white p-4 shadow"
            >
              <p className="font-black">{r.name}</p>
              <p className="text-sm text-gray-500">/play/{r.slug}</p>
            </a>
          ))}
        </div>

        <a
          href="/setup"
          className="mt-6 block w-full rounded-xl bg-green-600 p-4 text-center font-black text-white"
        >
          + Add Restaurant
        </a>
      </div>
    </main>
  );
}

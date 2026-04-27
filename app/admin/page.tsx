'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function AdminPage() {
  const params = useSearchParams();
  const slug = params.get('slug');
  const [restaurant, setRestaurant] = useState<any>(null);

  useEffect(() => {
    async function load() {
      if (!slug) return;
      const supabase = createClient();
      const { data } = await supabase.from('restaurants').select('*').eq('slug', slug).single();
      setRestaurant(data);
    }
    load();
  }, [slug]);

  if (!restaurant) {
    return <div className="p-6">Loading restaurant...</div>;
  }

  return (
    <main className="min-h-screen bg-orange-50 p-6 text-stone-950">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <h1 className="text-2xl font-black">{restaurant.name}</h1>
        <p className="mt-2 text-sm">/play/{restaurant.slug}</p>

        <div className="mt-6 space-y-3">
          <a href={`/admin/menu?slug=${restaurant.slug}`} className="block rounded-2xl bg-stone-100 px-4 py-3 font-bold">
            Build Menu
          </a>
          <a href={`/admin/promotions?slug=${restaurant.slug}`} className="block rounded-2xl bg-stone-100 px-4 py-3 font-bold">
            Create Promotions
          </a>
          <a href={`/play/${restaurant.slug}`} className="block rounded-2xl bg-green-600 px-4 py-3 text-center font-bold text-white">
            Test Wheel
          </a>
        </div>
      </div>
    </main>
  );
}

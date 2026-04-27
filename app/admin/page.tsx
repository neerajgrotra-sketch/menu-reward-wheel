'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  brand_color: string | null;
  owner_name?: string;
};

export default function AdminPage() {
  const [slug, setSlug] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setSlug(searchParams.get('slug'));
  }, []);

  useEffect(() => {
    async function load() {
      if (!slug) return;
      const supabase = createClient();
      const { data } = await supabase.from('restaurants').select('*').eq('slug', slug).single();
      setRestaurant(data as Restaurant | null);
    }

    load();
  }, [slug]);

  if (!restaurant) return <div className="p-6">Loading...</div>;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <h1 className="text-2xl font-black text-[#FF6B00]">🎯 SpinBite</h1>

        <h2 className="mt-4 text-xl font-black">
          Hello {restaurant.owner_name || 'there'} 👋
        </h2>

        <p className="mt-2 text-sm text-gray-600">
          Welcome to <strong>{restaurant.name}</strong>
        </p>

        <div className="mt-4 rounded-xl bg-orange-50 p-3 text-sm">
          Customer game link:
          <div className="font-bold text-[#FF6B00] break-all">
            {typeof window !== 'undefined' && window.location.origin}/play/{restaurant.slug}
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <a href={`/admin/restaurant?slug=${restaurant.slug}`} className="block rounded-xl bg-gray-200 p-3 text-center font-bold">
            My Restaurant
          </a>

          <a href={`/admin/menu?slug=${restaurant.slug}`} className="block rounded-xl bg-gray-200 p-3 text-center font-bold">
            My Restaurant Menu
          </a>

          <a href={`/admin/promotions?slug=${restaurant.slug}`} className="block rounded-xl bg-gray-200 p-3 text-center font-bold">
            Create Promotion
          </a>

          <a href={`/play/${restaurant.slug}`} className="block rounded-xl bg-green-600 p-3 text-center font-bold text-white">
            Test Wheel
          </a>
        </div>

        <button onClick={()=>window.location.href='/'} className="mt-6 w-full rounded-xl bg-red-500 p-3 text-white font-bold">
          Logout
        </button>
      </div>
    </main>
  );
}

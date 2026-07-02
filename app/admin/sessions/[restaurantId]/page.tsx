'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SessionsDashboard } from '@/components/admin/sessions/SessionsDashboard';

type Restaurant = {
  id: string;
  name: string;
  address_line1: string | null;
  city: string | null;
  province_state: string | null;
};

function address(r: Restaurant | null) {
  if (!r) return '';
  return [r.address_line1, r.city, r.province_state].filter(Boolean).join(', ') || 'Address not added';
}

export default function RestaurantSessionsPage({ params }: { params: { restaurantId: string } }) {
  const { restaurantId } = params;
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { window.location.href = '/auth'; return; }

      const { data } = await supabase
        .from('restaurants')
        .select('id,name,address_line1,city,province_state')
        .eq('id', restaurantId)
        .eq('owner_id', userData.user.id)
        .maybeSingle();

      if (!data) { setNotFound(true); setLoading(false); return; }
      setRestaurant(data as Restaurant);
      setLoading(false);
    }
    load();
  }, [restaurantId]);

  useEffect(() => {
    if (notFound) window.location.href = '/admin/sessions';
  }, [notFound]);

  if (notFound) return null;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-5xl">
        <a href="/admin/sessions" className="text-sm font-black text-[#FF6B00]">
          ← Back to Dining Intelligence
        </a>

        {loading ? (
          <p className="mt-4 text-sm font-semibold text-stone-400">Loading…</p>
        ) : (
          <>
            <div className="mt-3">
              <h1 className="text-3xl font-black text-stone-900">{restaurant?.name}</h1>
              <p className="mt-1 text-sm font-semibold text-stone-500">📍 {address(restaurant)}</p>
            </div>

            <div className="mt-6">
              <SessionsDashboard restaurantId={restaurantId} />
            </div>
          </>
        )}
      </section>
    </main>
  );
}

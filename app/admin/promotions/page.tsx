'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Restaurant = { id: string; name: string; slug: string };
type Promotion = { id: string; name: string; slug: string; status: string; created_at: string };

function toSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function PromotionsPage() {
  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRestaurantSlug(params.get('slug'));
  }, []);

  useEffect(() => {
    async function loadData() {
      if (!restaurantSlug) return;
      const supabase = createClient();
      const restaurantResponse = await supabase.from('restaurants').select('id,name,slug').eq('slug', restaurantSlug).single();
      if (restaurantResponse.error || !restaurantResponse.data) {
        setError('Restaurant not found.');
        return;
      }
      const currentRestaurant = restaurantResponse.data as Restaurant;
      setRestaurant(currentRestaurant);
      const promotionResponse = await supabase.from('promotions').select('id,name,slug,status,created_at').eq('restaurant_id', currentRestaurant.id).order('created_at', { ascending: false });
      setPromotions((promotionResponse.data || []) as Promotion[]);
    }

    loadData();
  }, [restaurantSlug]);

  async function addPromotion() {
    if (!restaurant || !name.trim()) return;
    setSaving(true);
    setError('');
    const supabase = createClient();
    const insertResponse = await supabase.from('promotions').insert({ restaurant_id: restaurant.id, name: name.trim(), slug: toSlug(name), status: 'draft' });
    if (insertResponse.error) {
      setError(insertResponse.error.message);
      setSaving(false);
      return;
    }
    const promotionResponse = await supabase.from('promotions').select('id,name,slug,status,created_at').eq('restaurant_id', restaurant.id).order('created_at', { ascending: false });
    setPromotions((promotionResponse.data || []) as Promotion[]);
    setName('');
    setSaving(false);
  }

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-8 text-[#1F1F1F]">
      <section className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <a href={`/admin?slug=${restaurantSlug || ''}`} className="text-sm font-black text-[#FF6B00]">Back to dashboard</a>
        <h1 className="mt-4 text-3xl font-black text-[#FF6B00]">Create Promotion</h1>
        <p className="mt-2 text-sm text-stone-600">Create promotions for {restaurant?.name || 'your restaurant'}.</p>

        <div className="mt-6 flex gap-2">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Promotion name" className="flex-1 rounded-xl border px-3 py-2" />
          <button onClick={addPromotion} disabled={saving || !name.trim()} className="rounded-xl bg-green-600 px-4 py-2 font-bold text-white disabled:bg-stone-400">{saving ? '...' : 'Add'}</button>
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

        <div className="mt-6 space-y-3">
          {promotions.length === 0 && <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">No promotions yet.</p>}
          {promotions.map((promotion) => (
            <div key={promotion.id} className="rounded-xl bg-stone-100 p-4">
              <p className="font-black">{promotion.name}</p>
              <p className="mt-1 text-xs font-bold uppercase text-stone-500">{promotion.status}</p>
              <p className="mt-2 break-all text-xs font-bold text-[#FF6B00]">/play/{restaurant?.slug}/{promotion.slug}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

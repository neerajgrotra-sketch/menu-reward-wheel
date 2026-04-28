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

  async function loadData(slug: string) {
    const supabase = createClient();
    const restaurantResponse = await supabase.from('restaurants').select('id,name,slug').eq('slug', slug).single();
    if (restaurantResponse.error || !restaurantResponse.data) {
      setError('Restaurant not found.');
      return;
    }
    const currentRestaurant = restaurantResponse.data as Restaurant;
    setRestaurant(currentRestaurant);
    const promotionResponse = await supabase.from('promotions').select('id,name,slug,status,created_at').eq('restaurant_id', currentRestaurant.id).order('created_at', { ascending: false });
    setPromotions((promotionResponse.data || []) as Promotion[]);
  }

  useEffect(() => {
    if (restaurantSlug) loadData(restaurantSlug);
  }, [restaurantSlug]);

  async function addPromotion() {
    if (!restaurant || !name.trim()) return;
    setSaving(true);
    setError('');
    const supabase = createClient();
    const promotionSlug = `${toSlug(name)}-${Date.now().toString().slice(-4)}`;
    const insertResponse = await supabase
      .from('promotions')
      .insert({ restaurant_id: restaurant.id, name: name.trim(), slug: promotionSlug, status: 'draft', game_type: 'wheel' })
      .select('id')
      .single();
    if (insertResponse.error || !insertResponse.data) {
      setError(insertResponse.error?.message || 'Could not create promotion.');
      setSaving(false);
      return;
    }
    window.location.href = `/admin/promotions/${insertResponse.data.id}`;
  }

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div><h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1><p className="mt-1 text-sm font-bold text-stone-500">Promotion manager</p></div>
          <a href={`/admin?slug=${restaurantSlug || ''}`} className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Dashboard</a>
        </div>
        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Promotions</p>
          <h2 className="mt-3 text-4xl font-black leading-tight">Create campaigns that turn diners into players.</h2>
          <p className="mt-3 text-sm font-semibold text-white/85">Build rewards, test the wheel, publish a customer link, and control redemption rules.</p>
          {restaurant && <p className="mt-4 rounded-2xl bg-white/15 p-3 text-sm font-black">Restaurant: {restaurant.name}</p>}
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
          <p className="text-sm font-black uppercase text-[#FF6B00]">Create Promotion</p>
          <div className="mt-3 flex gap-2">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Halloween, Lunch Rush, Weekend Spin..." className="min-w-0 flex-1 rounded-2xl border border-stone-200 px-4 py-3 font-semibold outline-none focus:border-[#FF6B00]" />
            <button onClick={addPromotion} disabled={saving || !name.trim()} className="rounded-2xl bg-green-600 px-5 py-3 text-xl font-black text-white disabled:bg-stone-400">+</button>
          </div>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}

        <div className="mt-5 space-y-4">
          {promotions.length === 0 && <div className="rounded-3xl bg-white p-6 shadow-xl"><p className="text-2xl font-black">No promotions yet</p><p className="mt-2 text-sm font-semibold text-stone-600">Create your first promotion, then add rewards and publish the game link.</p></div>}
          {promotions.map((promotion) => (
            <a key={promotion.id} href={`/admin/promotions/${promotion.id}`} className="block rounded-3xl bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div><h3 className="text-3xl font-black">{promotion.name}</h3><p className="mt-1 text-sm font-black uppercase text-stone-500">{promotion.status}</p></div>
                <span className="rounded-full bg-orange-50 px-4 py-2 text-sm font-black text-[#FF6B00]">Build</span>
              </div>
              <p className="mt-4 break-all text-sm font-black text-[#FF6B00]">/play/{restaurant?.slug}/{promotion.slug}</p>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

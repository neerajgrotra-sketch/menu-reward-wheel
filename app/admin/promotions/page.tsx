'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  address_line1?: string | null;
  city?: string | null;
  phone?: string | null;
};

type Promotion = { id: string; name: string; slug: string; status: string; created_at: string; restaurant_id: string };

function toSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function locationLabel(restaurant: Restaurant) {
  const address = [restaurant.address_line1, restaurant.city].filter(Boolean).join(', ');
  return address ? `${restaurant.name} — ${address}` : `${restaurant.name} — /${restaurant.slug}`;
}

export default function PromotionsPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('');
  const [selectedGame, setSelectedGame] = useState('wheel');
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selectedRestaurant = restaurants.find((item) => item.id === selectedRestaurantId) || null;

  async function loadPromotions(restaurantId: string) {
    const supabase = createClient();
    const { data, error: promotionError } = await supabase
      .from('promotions')
      .select('id,name,slug,status,created_at,restaurant_id')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (promotionError) {
      setError(promotionError.message);
      return;
    }

    setPromotions((data || []) as Promotion[]);
  }

  useEffect(() => {
    async function loadRestaurants() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        window.location.href = '/auth';
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const requestedSlug = params.get('slug');

      const { data, error: restaurantError } = await supabase
        .from('restaurants')
        .select('id,name,slug,address_line1,city,phone')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (restaurantError) {
        setError(restaurantError.message);
        return;
      }

      const ownedRestaurants = (data || []) as Restaurant[];
      setRestaurants(ownedRestaurants);

      const preselected = requestedSlug
        ? ownedRestaurants.find((item) => item.slug === requestedSlug)
        : null;

      if (preselected) {
        setSelectedRestaurantId(preselected.id);
      }
    }

    loadRestaurants();
  }, []);

  useEffect(() => {
    if (!selectedRestaurantId) {
      setPromotions([]);
      return;
    }
    loadPromotions(selectedRestaurantId);
  }, [selectedRestaurantId]);

  async function addPromotion() {
    if (!selectedRestaurant || !name.trim() || !selectedGame) return;
    setSaving(true);
    setError('');
    const supabase = createClient();
    const promotionSlug = `${toSlug(name)}-${Date.now().toString().slice(-4)}`;
    const insertResponse = await supabase
      .from('promotions')
      .insert({ restaurant_id: selectedRestaurant.id, name: name.trim(), slug: promotionSlug, status: 'draft', game_type: selectedGame })
      .select('id')
      .single();

    if (insertResponse.error || !insertResponse.data) {
      setError(insertResponse.error?.message || 'Could not create promotion.');
      setSaving(false);
      return;
    }

    window.location.href = `/admin/promotions/${insertResponse.data.id}`;
  }

  async function deletePromotion(event: React.MouseEvent, promotion: Promotion) {
    event.preventDefault();
    event.stopPropagation();

    const confirmed = window.confirm(`Delete ${promotion.name}? This will remove this promotion and its rewards.`);
    if (!confirmed) return;

    setDeletingId(promotion.id);
    setError('');

    const supabase = createClient();
    const rewardDelete = await supabase.from('promotion_rewards').delete().eq('promotion_id', promotion.id);
    if (rewardDelete.error) {
      setError(rewardDelete.error.message);
      setDeletingId(null);
      return;
    }

    const promotionDelete = await supabase.from('promotions').delete().eq('id', promotion.id);
    if (promotionDelete.error) {
      setError(promotionDelete.error.message);
      setDeletingId(null);
      return;
    }

    if (selectedRestaurantId) await loadPromotions(selectedRestaurantId);
    setDeletingId(null);
  }

  const canCreate = Boolean(selectedRestaurant && name.trim() && selectedGame && !saving);

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div><h1 className="text-3xl font-black text-[#FF6B00]">🎯 SpinBite</h1><p className="mt-1 text-sm font-bold text-stone-500">Promotion manager</p></div>
          <a href="/admin" className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">Dashboard</a>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Promotions</p>
          <h2 className="mt-3 text-4xl font-black leading-tight">Create campaigns that turn diners into players.</h2>
          <p className="mt-3 text-sm font-semibold text-white/85">Choose the restaurant, name the campaign, select the game, then build rewards and publish.</p>
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
          <p className="text-sm font-black uppercase text-[#FF6B00]">Step 1: Select Restaurant Location</p>
          <select value={selectedRestaurantId} onChange={(event) => setSelectedRestaurantId(event.target.value)} className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 font-black outline-none focus:border-[#FF6B00]">
            <option value="">Select restaurant/location...</option>
            {restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{locationLabel(restaurant)}</option>)}
          </select>
          {selectedRestaurant && (
            <div className="mt-4 rounded-2xl bg-orange-50 p-4">
              <p className="text-xl font-black">{selectedRestaurant.name}</p>
              <p className="mt-1 text-sm font-bold text-stone-600">{[selectedRestaurant.address_line1, selectedRestaurant.city].filter(Boolean).join(', ') || 'Address not added'}</p>
              <p className="mt-1 text-xs font-bold text-stone-500">/{selectedRestaurant.slug}</p>
            </div>
          )}
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
          <p className="text-sm font-black uppercase text-[#FF6B00]">Step 2: Name Promotion</p>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Halloween, Lunch Rush, Weekend Spin..." className="mt-3 w-full rounded-2xl border border-stone-200 px-4 py-4 font-semibold outline-none focus:border-[#FF6B00]" />
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
          <p className="text-sm font-black uppercase text-[#FF6B00]">Step 3: Select Game Type</p>
          <button onClick={() => setSelectedGame('wheel')} className={`mt-3 w-full rounded-3xl border-2 p-5 text-left transition ${selectedGame === 'wheel' ? 'border-green-600 bg-green-50' : 'border-stone-200 bg-white'}`}>
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FF6B00] text-3xl text-white">🎡</div>
              <div>
                <p className="text-2xl font-black">Spin Wheel</p>
                <p className="mt-1 text-sm font-bold text-stone-600">Customers scan a QR code, spin a branded wheel, and win configured rewards like free items, discounts, or custom offers.</p>
                <p className="mt-2 text-xs font-black uppercase text-green-700">Available now</p>
              </div>
            </div>
          </button>
          <div className="mt-3 rounded-3xl border border-dashed border-stone-300 p-5 opacity-60">
            <p className="text-xl font-black">More games coming soon</p>
            <p className="mt-1 text-sm font-bold text-stone-600">Scratch cards, menu quests, daily bite challenges, and other game formats can use the same reward engine later.</p>
          </div>
        </div>

        <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
          <p className="text-sm font-black uppercase text-[#FF6B00]">Step 4: Create Promotion</p>
          <button onClick={addPromotion} disabled={!canCreate} className="mt-3 w-full rounded-3xl bg-green-600 px-5 py-5 text-xl font-black text-white shadow-xl disabled:bg-stone-400">
            {saving ? 'Creating...' : 'Create Promotion & Start Building'}
          </button>
          {!selectedRestaurant && <p className="mt-3 text-sm font-bold text-stone-500">Select a restaurant location before creating a promotion.</p>}
          {selectedRestaurant && !name.trim() && <p className="mt-3 text-sm font-bold text-stone-500">Enter a promotion name.</p>}
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}

        <div className="mt-5 space-y-4">
          {!selectedRestaurant && <div className="rounded-3xl bg-white p-6 shadow-xl"><p className="text-2xl font-black">Select a location to view promotions</p><p className="mt-2 text-sm font-semibold text-stone-600">Promotions are location-specific so duplicate restaurant names do not get mixed up.</p></div>}
          {selectedRestaurant && promotions.length === 0 && <div className="rounded-3xl bg-white p-6 shadow-xl"><p className="text-2xl font-black">No promotions yet</p><p className="mt-2 text-sm font-semibold text-stone-600">Create your first promotion for this location, then add rewards and publish the game link.</p></div>}
          {selectedRestaurant && promotions.map((promotion) => (
            <a key={promotion.id} href={`/admin/promotions/${promotion.id}`} className="block rounded-3xl bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div><h3 className="text-3xl font-black">{promotion.name}</h3><p className="mt-1 text-sm font-black uppercase text-stone-500">{promotion.status}</p></div>
                <div className="flex flex-col gap-2">
                  <span className="rounded-full bg-orange-50 px-4 py-2 text-center text-sm font-black text-[#FF6B00]">Build</span>
                  <button onClick={(event) => deletePromotion(event, promotion)} disabled={deletingId === promotion.id} className="rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-600">
                    {deletingId === promotion.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
              <p className="mt-4 break-all text-sm font-black text-[#FF6B00]">/play/{selectedRestaurant.slug}/{promotion.slug}</p>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

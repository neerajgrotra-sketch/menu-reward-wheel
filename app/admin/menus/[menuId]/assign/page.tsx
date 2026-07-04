'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Restaurant = { id: string; name: string; slug: string; address_line1?: string | null; city?: string | null };

function restaurantAddress(restaurant: Restaurant) {
  return [restaurant.address_line1, restaurant.city].filter(Boolean).join(', ') || 'Address not added';
}

export default function AssignMenuLocationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams();
  const menuId = params.menuId as string;

  const [menuName, setMenuName] = useState('');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  // Map of restaurant_id -> assignment row id, for restaurants currently assigned.
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) { window.location.href = '/auth'; return; }

      const menuResult = await supabase.from('menus').select('id,name,owner_id').eq('id', menuId).single();
      if (menuResult.error || !menuResult.data || menuResult.data.owner_id !== user.id) {
        window.location.href = '/admin/menus';
        return;
      }
      setMenuName(menuResult.data.name);

      const [restaurantsResult, assignmentsResult] = await Promise.all([
        supabase.from('restaurants').select('id,name,slug,address_line1,city').eq('owner_id', user.id).order('created_at', { ascending: false }),
        supabase.from('restaurant_menu_assignments').select('id,restaurant_id').eq('menu_id', menuId).eq('active', true),
      ]);
      if (restaurantsResult.error) { setError(restaurantsResult.error.message); setLoading(false); return; }

      setRestaurants((restaurantsResult.data || []) as Restaurant[]);
      const map: Record<string, string> = {};
      (assignmentsResult.data || []).forEach((a: any) => { map[a.restaurant_id] = a.id; });
      setAssignments(map);
      setLoading(false);
    }
    if (menuId) init();
  }, [supabase, menuId]);

  async function toggle(restaurantId: string) {
    setSavingId(restaurantId);
    setError('');
    const existingAssignmentId = assignments[restaurantId];

    if (existingAssignmentId) {
      const result = await supabase.from('restaurant_menu_assignments').update({ active: false }).eq('id', existingAssignmentId);
      if (result.error) { setError(result.error.message); setSavingId(null); return; }
      setAssignments((prev) => {
        const next = { ...prev };
        delete next[restaurantId];
        return next;
      });
    } else {
      // Upsert, not insert: a prior unassign leaves the row behind with active=false
      // (soft delete, to preserve history), so a plain insert would collide with the
      // unique(restaurant_id, menu_id) constraint on reassignment.
      const result = await supabase
        .from('restaurant_menu_assignments')
        .upsert(
          { restaurant_id: restaurantId, menu_id: menuId, active: true },
          { onConflict: 'restaurant_id,menu_id' }
        )
        .select('id')
        .single();
      if (result.error) { setError(result.error.message); setSavingId(null); return; }
      setAssignments((prev) => ({ ...prev, [restaurantId]: result.data.id }));
    }
    setSavingId(null);
    setNotice('Saved ✓');
    setTimeout(() => setNotice(''), 1500);
  }

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6">Loading...</main>;

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F]">
      <section className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-black text-[#FF6B00]">Assign Locations</h1>
          <a href={`/admin/menus/${menuId}`} className="rounded-full bg-white px-4 py-3 text-sm font-black text-[#FF6B00] shadow">
            Back to Menu
          </a>
        </div>

        <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-6 text-white shadow-2xl shadow-orange-200">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">Menu</p>
          <h2 className="mt-3 text-3xl font-black leading-tight">{menuName}</h2>
          <p className="mt-3 text-sm font-semibold text-white/85">
            Choose which restaurant locations serve this menu. The same menu can be assigned to multiple locations.
          </p>
        </div>

        {notice && <p className="mt-5 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-700">{notice}</p>}
        {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}

        <div className="mt-5 space-y-3">
          {restaurants.length === 0 && (
            <div className="rounded-3xl bg-white p-6 shadow-xl">
              <p className="text-sm font-semibold text-stone-600">
                No restaurants yet — add one at <a href="/admin/restaurants" className="font-black text-[#FF6B00]">Restaurants</a> first.
              </p>
            </div>
          )}
          {restaurants.map((restaurant) => {
            const checked = !!assignments[restaurant.id];
            return (
              <label
                key={restaurant.id}
                className="flex cursor-pointer items-center gap-4 rounded-3xl bg-white p-5 shadow-xl"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={savingId === restaurant.id}
                  onChange={() => toggle(restaurant.id)}
                  className="h-6 w-6 accent-[#FF6B00]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-black">{restaurant.name}</p>
                  <p className="truncate text-sm font-bold text-stone-600">{restaurantAddress(restaurant)}</p>
                </div>
              </label>
            );
          })}
        </div>
      </section>
    </main>
  );
}

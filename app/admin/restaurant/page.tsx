'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Restaurant = {
  id: string;
  name: string;
};

export default function RestaurantSettingsPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [orderingEnabled, setOrderingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setError('Not authenticated.'); setLoading(false); return; }

        const { data: rest } = await supabase
          .from('restaurants')
          .select('id,name')
          .eq('owner_id', user.id)
          .limit(1)
          .maybeSingle();

        if (!rest) { setError('No restaurant found.'); setLoading(false); return; }
        if (!cancelled) setRestaurant(rest as Restaurant);

        const { data: cap } = await (supabase as any)
          .from('restaurant_capabilities')
          .select('enabled')
          .eq('restaurant_id', rest.id)
          .eq('capability_name', 'ordering')
          .maybeSingle();

        if (!cancelled) setOrderingEnabled((cap as { enabled: boolean } | null)?.enabled === true);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  async function handleToggleOrdering(enabled: boolean) {
    if (!restaurant || saving) return;
    setSaving(true);
    setSuccessMessage(null);
    setError(null);

    const { error: err } = await (supabase as any)
      .from('restaurant_capabilities')
      .upsert(
        { restaurant_id: restaurant.id, capability_name: 'ordering', enabled },
        { onConflict: 'restaurant_id,capability_name' },
      );

    setSaving(false);
    if (err) {
      setError(`Failed to save: ${err.message}`);
    } else {
      setOrderingEnabled(enabled);
      setSuccessMessage(enabled ? 'Online ordering enabled.' : 'Online ordering disabled.');
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FFF8F0] p-6">
        <p className="text-center text-sm text-stone-400 pt-12">Loading settings…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FFF8F0] p-4">
      <div className="mx-auto max-w-md space-y-4 py-6">
        <h1 className="text-2xl font-black text-[#FF6B00]">Restaurant Settings</h1>
        {restaurant && (
          <p className="text-sm text-stone-500">{restaurant.name}</p>
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}
        {successMessage && (
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        )}

        {/* Online Ordering Toggle */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-black text-stone-800">Online Ordering</p>
              <p className="mt-0.5 text-xs text-stone-500">
                {orderingEnabled
                  ? 'Customers can add items and place orders from your public menu.'
                  : 'Ordering is disabled. Customers can view your menu but cannot place orders.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={orderingEnabled}
              onClick={() => handleToggleOrdering(!orderingEnabled)}
              disabled={saving || !restaurant}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                orderingEnabled ? 'bg-[#FF6B00]' : 'bg-stone-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  orderingEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

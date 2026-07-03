'use client';

import { useEffect, useState } from 'react';
import type { AppSupabaseClient } from '@/lib/supabase/client';
import type { MessageState } from './types';
import { ToggleRow } from './ToggleRow';

type Props = {
  restaurantId: string;
  supabase: AppSupabaseClient;
};

export function RestaurantPaymentsTab({ restaurantId, supabase }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await (supabase as any)
        .from('restaurant_capabilities')
        .select('enabled')
        .eq('restaurant_id', restaurantId)
        .eq('capability_name', 'payment_simulation')
        .maybeSingle();
      if (!cancelled) {
        setEnabled((result.data as { enabled: boolean } | null)?.enabled === true);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [restaurantId, supabase]);

  async function handleToggle(next: boolean) {
    if (saving) return;
    setSaving(true);
    setMessage(null);

    const { error } = await (supabase as any)
      .from('restaurant_capabilities')
      .upsert(
        { restaurant_id: restaurantId, capability_name: 'payment_simulation', enabled: next },
        { onConflict: 'restaurant_id,capability_name' },
      );

    setSaving(false);
    if (error) {
      setMessage({ type: 'error', text: `Failed to save: ${error.message}` });
    } else {
      setEnabled(next);
      setMessage({ type: 'success', text: next ? 'Payments enabled.' : 'Payments disabled.' });
      setTimeout(() => setMessage(null), 2500);
    }
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-stone-400">Loading payment settings…</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Payments</p>
        <p className="mt-1 text-sm font-semibold text-stone-500">
          Requires Online Ordering to be enabled in Settings — customers pay at checkout after adding items to cart.
        </p>
      </div>

      <ToggleRow
        label="Enable Payments"
        description={enabled
          ? 'Customers complete a simulated payment at checkout. Live payment processing is not connected yet.'
          : 'Customers can order but are not charged.'}
        checked={enabled}
        onChange={handleToggle}
        disabled={saving}
      />

      {message && (
        <p className={`rounded-xl p-3 text-sm font-bold ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

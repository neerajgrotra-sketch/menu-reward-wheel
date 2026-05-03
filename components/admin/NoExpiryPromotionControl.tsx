'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = {
  promotionId: string;
};

type PromotionSchedule = {
  id: string;
  status: string;
  starts_at?: string | null;
  ends_at?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return 'No expiry — runs until ended';
  return new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function NoExpiryPromotionControl({ promotionId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [promotion, setPromotion] = useState<PromotionSchedule | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      const result = await supabase
        .from('promotions')
        .select('id,status,starts_at,ends_at')
        .eq('id', promotionId)
        .single();

      if (result.error || !result.data) {
        setError(result.error?.message || 'Could not load promotion expiry settings.');
        setLoading(false);
        return;
      }

      const loaded = result.data as PromotionSchedule;
      setPromotion(loaded);
      setEnabled(!loaded.ends_at);
      setLoading(false);
    }

    if (promotionId) load();
  }, [promotionId, supabase]);

  async function toggleNoExpiry(nextEnabled: boolean) {
    if (!promotion) return;
    setSaving(true);
    setMessage('');
    setError('');

    const nextEndsAt = nextEnabled
      ? null
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const result = await supabase
      .from('promotions')
      .update({ ends_at: nextEndsAt })
      .eq('id', promotion.id);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setEnabled(nextEnabled);
    setPromotion({ ...promotion, ends_at: nextEndsAt });
    setMessage(nextEnabled ? 'No expiry enabled. This promotion will run until manually ended.' : 'No expiry disabled. A temporary 24-hour expiry was applied; adjust the end date in Promotion Rules if needed.');
    setSaving(false);
  }

  if (loading) return null;

  return (
    <aside className="fixed bottom-4 right-4 z-40 w-[min(92vw,24rem)] rounded-[1.5rem] border border-green-100 bg-white p-4 text-[#1F1F1F] shadow-2xl">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-green-700">Promotion Expiry</p>
      <label className="mt-3 flex items-start gap-3 rounded-2xl bg-green-50 p-3 text-sm font-black text-green-800">
        <input
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(event) => toggleNoExpiry(event.target.checked)}
          className="mt-1 h-5 w-5"
        />
        <span>
          <span className="block text-base">No expiry — run until ended</span>
          <span className="mt-1 block text-xs font-bold text-green-700">
            Overrides the end date and keeps the promotion running until staff clicks End Promotion.
          </span>
        </span>
      </label>
      <p className="mt-3 text-xs font-bold text-stone-600">Current expiry: {formatDate(promotion?.ends_at)}</p>
      {saving && <p className="mt-2 text-xs font-black text-stone-500">Saving...</p>}
      {message && <p className="mt-2 rounded-xl bg-green-50 p-2 text-xs font-black text-green-700">{message}</p>}
      {error && <p className="mt-2 rounded-xl bg-red-50 p-2 text-xs font-black text-red-700">{error}</p>}
    </aside>
  );
}

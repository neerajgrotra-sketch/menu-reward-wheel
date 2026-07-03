'use client';

import { useEffect, useState } from 'react';
import type { AppSupabaseClient } from '@/lib/supabase/client';

type Props = {
  restaurantId: string;
  restaurantSlug: string;
  supabase: AppSupabaseClient;
};

type Promotion = {
  id: string;
  name: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
};

type DisplayStatus = 'active' | 'pending' | 'draft' | 'ended';

function statusOf(p: Promotion): DisplayStatus {
  const now = new Date();
  if (p.status === 'draft') return 'draft';
  if (p.ends_at && new Date(p.ends_at) <= now) return 'ended';
  if (p.status === 'active' && p.starts_at && new Date(p.starts_at) > now) return 'pending';
  if (p.status === 'active') return 'active';
  return 'draft';
}

function badgeClass(status: DisplayStatus): string {
  if (status === 'active') return 'bg-green-50 text-green-700';
  if (status === 'pending') return 'bg-yellow-50 text-yellow-700';
  if (status === 'ended') return 'bg-stone-100 text-stone-600';
  return 'bg-orange-50 text-[#FF6B00]';
}

export function RestaurantPromotionsTab({ restaurantId, restaurantSlug, supabase }: Props) {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      const result = await supabase
        .from('promotions')
        .select('id,name,status,starts_at,ends_at')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (result.error) { setError(result.error.message); setLoading(false); return; }
      setPromotions((result.data || []) as Promotion[]);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [restaurantId, supabase]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-stone-500">Promotions</p>
          <p className="mt-1 text-sm font-semibold text-stone-500">Build, edit, and track performance from Manage Promotions.</p>
        </div>
        <a
          href={`/admin/promotions?slug=${restaurantSlug}`}
          className="shrink-0 rounded-full bg-[#FF6B00] px-4 py-2 text-sm font-black text-white"
        >
          Manage Promotions →
        </a>
      </div>

      {loading && <p className="py-6 text-center text-sm text-stone-400">Loading promotions…</p>}
      {error && <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}

      {!loading && !error && promotions.length === 0 && (
        <div className="rounded-2xl bg-stone-50 p-6 text-center">
          <p className="text-lg font-black">No promotions yet</p>
          <p className="mt-1 text-sm font-semibold text-stone-500">Create your first campaign from Manage Promotions.</p>
        </div>
      )}

      {!loading && !error && promotions.length > 0 && (
        <div className="space-y-2">
          {promotions.map((p) => {
            const s = statusOf(p);
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl border border-stone-100 p-4">
                <p className="truncate text-sm font-black text-[#1F1F1F]">{p.name}</p>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black uppercase ${badgeClass(s)}`}>{s}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

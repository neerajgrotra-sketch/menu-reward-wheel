'use client';

import { useEffect, useState } from 'react';
import type { AppSupabaseClient } from '@/lib/supabase/client';

type Props = {
  restaurantId: string;
  supabase: AppSupabaseClient;
};

type OverviewStats = {
  tablesCount: number;
  assignedMenusCount: number;
  activePromotionsCount: number;
  ordersToday: number;
  revenueToday: number;
  activeSessionsCount: number;
};

const EMPTY_STATS: OverviewStats = {
  tablesCount: 0,
  assignedMenusCount: 0,
  activePromotionsCount: 0,
  ordersToday: 0,
  revenueToday: 0,
  activeSessionsCount: 0,
};

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4 text-center">
      <p className="text-2xl font-black text-stone-900">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-stone-500">{label}</p>
    </div>
  );
}

export function RestaurantOverviewTab({ restaurantId, supabase }: Props) {
  const [stats, setStats] = useState<OverviewStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      const todayIso = startOfTodayIso();

      const [tablesResult, assignmentsResult, promotionsResult, ordersResult, sessionsResult] = await Promise.all([
        (supabase as any)
          .from('restaurant_touchpoints')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .is('deleted_at', null),
        (supabase as any)
          .from('restaurant_menu_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .eq('active', true),
        supabase
          .from('promotions')
          .select('status,starts_at,ends_at')
          .eq('restaurant_id', restaurantId),
        supabase
          .from('orders')
          .select('subtotal')
          .eq('restaurant_id', restaurantId)
          .gte('created_at', todayIso),
        (supabase as any)
          .from('visit_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .eq('status', 'active'),
      ]);

      if (cancelled) return;

      const firstError =
        tablesResult.error || assignmentsResult.error || promotionsResult.error || ordersResult.error || sessionsResult.error;
      if (firstError) { setError(firstError.message); setLoading(false); return; }

      const now = new Date().toISOString();
      const activePromotionsCount = ((promotionsResult.data || []) as Array<{ status: string; starts_at: string | null; ends_at: string | null }>)
        .filter((p) => p.status !== 'draft' && !(p.ends_at && p.ends_at <= now) && !(p.starts_at && p.starts_at > now))
        .length;

      const orderRows = (ordersResult.data || []) as Array<{ subtotal: number | null }>;
      const revenueToday = orderRows.reduce((sum, o) => sum + (o.subtotal || 0), 0);

      setStats({
        tablesCount: tablesResult.count || 0,
        assignedMenusCount: assignmentsResult.count || 0,
        activePromotionsCount,
        ordersToday: orderRows.length,
        revenueToday,
        activeSessionsCount: sessionsResult.count || 0,
      });
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [restaurantId, supabase]);

  if (loading) {
    return <p className="py-8 text-center text-sm text-stone-400">Loading overview…</p>;
  }

  if (error) {
    return <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatTile label="Tables" value={stats.tablesCount} />
      <StatTile label="Assigned Menus" value={stats.assignedMenusCount} />
      <StatTile label="Active Promotions" value={stats.activePromotionsCount} />
      <StatTile label="Orders Today" value={stats.ordersToday} />
      <StatTile label="Revenue Today" value={formatCurrency(stats.revenueToday)} />
      <StatTile label="Active Dining Sessions" value={stats.activeSessionsCount} />
    </div>
  );
}

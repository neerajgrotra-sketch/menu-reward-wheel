'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { loadSiteContentMap } from '@/lib/site-content-client';
import { DashboardIconSprite } from '@/components/admin/dashboard/icons';
import { DashboardGreeting } from '@/components/admin/dashboard/DashboardGreeting';
import { CommandCenter } from '@/components/admin/dashboard/CommandCenter';
import { AiStatusCard } from '@/components/admin/dashboard/AiStatusCard';
import { KpiRow } from '@/components/admin/dashboard/KpiRow';
import { QuickActionsRow } from '@/components/admin/dashboard/QuickActionsRow';
import { RecentActivityTimeline } from '@/components/admin/dashboard/RecentActivityTimeline';
import { OperationsOverview } from '@/components/admin/dashboard/OperationsOverview';

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  brand_color: string | null;
  owner_name?: string | null;
};

type MetricCounts = {
  restaurants: number;
  activePromotions: number;
  totalPromotions: number;
  issuedCoupons: number;
  redeemedCoupons: number;
  revenueToday: number;
  ordersToday: number;
  avgOrderValue: number;
  activeGuests: number;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);
}

const fallbackCopy = {
  create_promotion_title: 'Create Promotion',
  manage_promotions_title: 'Manage Promotions',
  validate_coupons_title: 'Validate Coupons',
  menus_title: 'Menus',
  restaurants_title: 'Manage Restaurants',
};

export default function AdminPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [counts, setCounts] = useState<MetricCounts>({
    restaurants: 0,
    activePromotions: 0,
    totalPromotions: 0,
    issuedCoupons: 0,
    redeemedCoupons: 0,
    revenueToday: 0,
    ordersToday: 0,
    avgOrderValue: 0,
    activeGuests: 0,
  });
  const [copy, setCopy] = useState(fallbackCopy);
  const [loading, setLoading] = useState(true);
  const [metricsError, setMetricsError] = useState('');

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function load() {
      const loadedCopy = await loadSiteContentMap(supabase, 'admin', fallbackCopy);
      setCopy(loadedCopy as typeof fallbackCopy);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) { window.location.href = '/auth'; return; }
      const requestedSlug = new URLSearchParams(window.location.search).get('slug');
      const { data } = await supabase.from('restaurants').select('id,name,slug,brand_color,owner_name').eq('owner_id', user.id).is('deleted_at', null).order('created_at', { ascending: false });
      const ownedRestaurants = (data || []) as Restaurant[];
      if (ownedRestaurants.length === 0) { window.location.href = '/admin/restaurants'; return; }
      const matched = requestedSlug ? ownedRestaurants.find((item) => item.slug === requestedSlug) : ownedRestaurants[0];
      const selected = matched || ownedRestaurants[0];
      setRestaurants(ownedRestaurants);
      setSelectedSlug(selected.slug);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const restaurant = restaurants.find((item) => item.slug === selectedSlug) || restaurants[0];

  useEffect(() => {
    async function loadCounts() {
      if (restaurants.length === 0) return;
      setMetricsError('');

      const response = await fetch('/api/admin/dashboard-metrics', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMetricsError(payload?.error || 'Could not load dashboard metrics.');
        return;
      }

      setCounts({
        restaurants: payload.restaurants || 0,
        activePromotions: payload.activePromotions || 0,
        totalPromotions: payload.totalPromotions || 0,
        issuedCoupons: payload.issuedCoupons || 0,
        redeemedCoupons: payload.redeemedCoupons || 0,
        revenueToday: payload.revenueToday || 0,
        ordersToday: payload.ordersToday || 0,
        avgOrderValue: payload.avgOrderValue || 0,
        activeGuests: payload.activeGuests || 0,
      });
    }
    loadCounts();
  }, [restaurants]);

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6 text-[#1F1F1F]">Loading dashboard...</main>;
  if (!restaurant) return <main className="min-h-screen bg-[#FFF8F0] p-6 text-[#1F1F1F]">No restaurant selected.</main>;

  const kpis = [
    { label: 'Revenue Today', value: formatCurrency(counts.revenueToday) },
    { label: 'Orders', value: counts.ordersToday },
    { label: 'Active Guests', value: counts.activeGuests },
    { label: 'Avg. Order Value', value: formatCurrency(counts.avgOrderValue) },
    { label: 'Coupon Redemptions', value: counts.redeemedCoupons, href: '/admin/coupons' },
  ];

  const quickActions = [
    { label: copy.create_promotion_title, href: `/admin/promotions?slug=${restaurant.slug}&mode=create`, icon: 'tag' as const },
    { label: copy.manage_promotions_title, href: `/admin/promotions?slug=${restaurant.slug}&mode=manage`, icon: 'list' as const },
    { label: 'Coupons', href: '/admin/coupons', icon: 'ticket' as const },
    { label: copy.validate_coupons_title, href: '/admin/validate', icon: 'shieldCheck' as const },
    { label: copy.menus_title, href: '/admin/menus', icon: 'book' as const },
    { label: 'Dining Intelligence', href: '/admin/sessions', icon: 'radar' as const },
    { label: copy.restaurants_title, href: '/admin/restaurants', icon: 'store' as const },
  ];

  return (
    <main className="min-h-screen bg-[#FFF8F0] px-4 py-6 text-[#1F1F1F] md:px-8 md:py-10">
      <DashboardIconSprite />
      <section className="mx-auto flex max-w-5xl flex-col gap-8">
        <DashboardGreeting ownerName={restaurant.owner_name} restaurantName={restaurant.name} />

        <div className="flex flex-col gap-3.5">
          <CommandCenter />
          <AiStatusCard restaurantName={restaurant.name} />
        </div>

        <div>
          <h2 className="mb-3 text-lg font-black text-[#1F1F1F]">Today</h2>
          {metricsError && <p className="mb-3 rounded-2xl bg-red-50 p-3 text-sm font-black text-red-700">{metricsError}</p>}
          <KpiRow kpis={kpis} />
        </div>

        <div>
          <h2 className="mb-3 text-lg font-black text-[#1F1F1F]">Operations</h2>
          <OperationsOverview activePromotions={counts.activePromotions} />
        </div>

        <div>
          <h2 className="mb-3 text-lg font-black text-[#1F1F1F]">Recent activity</h2>
          <RecentActivityTimeline />
        </div>

        <div>
          <h2 className="mb-3 text-lg font-black text-[#1F1F1F]">Quick actions</h2>
          <QuickActionsRow actions={quickActions} />
        </div>
      </section>
    </main>
  );
}

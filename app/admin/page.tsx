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
import { RecommendationsSection } from '@/components/admin/dashboard/RecommendationsSection';

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  brand_color: string | null;
  owner_name?: string | null;
};

type MetricTrends = {
  revenue: number[];
  orders: number[];
  avgOrderValue: number[];
  redemptions: number[];
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
  trends: MetricTrends;
};

const EMPTY_TRENDS: MetricTrends = { revenue: [], orders: [], avgOrderValue: [], redemptions: [] };

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
    trends: EMPTY_TRENDS,
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
        trends: payload.trends || EMPTY_TRENDS,
      });
    }
    loadCounts();
  }, [restaurants]);

  if (loading) return <main className="min-h-screen bg-[#FFF8F0] p-6 text-[#1F1F1F]">Loading dashboard...</main>;
  if (!restaurant) return <main className="min-h-screen bg-[#FFF8F0] p-6 text-[#1F1F1F]">No restaurant selected.</main>;

  const redemptionRate = counts.issuedCoupons > 0 ? Math.round((counts.redeemedCoupons / counts.issuedCoupons) * 100) : 0;

  const kpis = [
    {
      label: 'Revenue Today', value: formatCurrency(counts.revenueToday), trend: counts.trends.revenue,
      icon: 'dollar' as const, iconBg: '#E1F3EA', iconColor: '#1F8A5B',
    },
    {
      label: 'Orders', value: counts.ordersToday, trend: counts.trends.orders,
      icon: 'list' as const, iconBg: '#E3EEFC', iconColor: '#2F6FE0',
    },
    {
      label: 'Active Guests', value: counts.activeGuests,
      icon: 'users' as const, iconBg: '#FFE9D6', iconColor: '#D9770A',
    },
    {
      label: 'Avg. Order Value', value: formatCurrency(counts.avgOrderValue), trend: counts.trends.avgOrderValue,
      icon: 'card' as const, iconBg: '#DFF5F3', iconColor: '#12867A',
    },
    {
      label: 'Coupon Redemptions', value: counts.redeemedCoupons, href: '/admin/coupons', trend: counts.trends.redemptions,
      icon: 'ticket' as const, iconBg: '#FCE4EC', iconColor: '#C2185B',
    },
  ];

  const dashboardContext = {
    revenue_today: formatCurrency(counts.revenueToday),
    orders_today: String(counts.ordersToday),
    avg_order_value: formatCurrency(counts.avgOrderValue),
    active_guests: String(counts.activeGuests),
    active_promotions: String(counts.activePromotions),
    issued_coupons: String(counts.issuedCoupons),
    redeemed_coupons: String(counts.redeemedCoupons),
    redemption_rate: `${redemptionRate}%`,
  };

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
      <section className="mx-auto flex max-w-6xl flex-col gap-8">
        <DashboardGreeting ownerName={restaurant.owner_name} restaurantName={restaurant.name} />

        <div className="flex flex-col gap-3.5">
          <CommandCenter restaurantId={restaurant.id} restaurantName={restaurant.name} dashboardContext={dashboardContext} />
          <AiStatusCard restaurantName={restaurant.name} />
        </div>

        <div>
          <h2 className="mb-3 text-lg font-black text-[#1F1F1F]">Today</h2>
          {metricsError && <p className="mb-3 rounded-2xl bg-red-50 p-3 text-sm font-black text-red-700">{metricsError}</p>}
          <KpiRow kpis={kpis} />
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
          <RecommendationsSection
            restaurantId={restaurant.id}
            dashboardContext={dashboardContext}
            promotionsHref={`/admin/promotions?slug=${restaurant.slug}&mode=create`}
          />
          <RecentActivityTimeline />
          <OperationsOverview activePromotions={counts.activePromotions} />
        </div>

        <div>
          <h2 className="mb-3 text-lg font-black text-[#1F1F1F]">Quick actions</h2>
          <QuickActionsRow actions={quickActions} />
        </div>
      </section>
    </main>
  );
}

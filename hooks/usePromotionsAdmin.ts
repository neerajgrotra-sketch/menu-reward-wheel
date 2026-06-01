'use client';

import { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { createClient } from '@/lib/supabase/client';
import { loadSiteContentMap } from '@/lib/site-content-client';
import type { GameType } from '@/lib/games/types';

export type Restaurant = {
  id: string;
  name: string;
  slug: string;
  address_line1?: string | null;
  city?: string | null;
  phone?: string | null;
};

export type Promotion = {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  restaurant_id: string;
  game_type?: GameType | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

export type CountsByPromotion = Record<string, { issued: number; redeemed: number }>;
export type Filter = 'active' | 'pending' | 'draft' | 'ended' | 'all';
export type PromotionsAdminMode = 'create' | 'drafts' | 'manage';
export type BuilderGameType = 'wheel' | 'mystery_box' | 'scratch_card' | 'open_the_door';

export type PerformanceCoupon = {
  id: string;
  coupon_code: string;
  issued_at: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  raw_status: string;
  display_status: 'active' | 'expired' | 'redeemed';
  item_won: string;
  discount_type: string;
};

export type PromotionPerformance = {
  promotion: {
    id: string;
    name: string;
    slug: string;
    status: string;
    starts_at?: string | null;
    ends_at?: string | null;
    coupon_expiry_minutes: number;
  };
  restaurant: {
    id: string;
    name: string;
    slug: string;
    address: string;
  };
  summary: {
    issued: number;
    redeemed: number;
    active: number;
    expired: number;
    redemptionRate: number;
  };
  rewardsBreakdown: Record<string, number>;
  coupons: PerformanceCoupon[];
  limit: number;
};

export const fallbackPromotionsCopy = {
  eyebrow: 'Promotions',
  create_headline: 'Start a new campaign draft.',
  create_subheadline: 'Choose a restaurant location, name the campaign, select the game, then build rewards and publish.',
  drafts_headline: 'Continue building draft campaigns.',
  drafts_subheadline: 'Drafts are promotions that have been created but not published yet.',
  manage_headline: 'Operate active and ended campaigns.',
  manage_subheadline: 'Edit, end, copy links, print posters, and track redemption performance.',
  create_tab_label: 'Create Promotion',
  drafts_tab_label: 'Drafts',
  manage_tab_label: 'Manage Promotions',
  select_location_label: 'Step 1: Select Restaurant Location',
  name_promotion_label: 'Step 2: Name Promotion',
  select_game_label: 'Step 3: Select Game Type',
  create_button_label: 'Create Promotion',
  no_drafts_title: 'No drafts in progress',
  no_drafts_copy: 'Create a new promotion draft from the Create Promotion tab.',
};

export function toPromotionSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function restaurantAddress(restaurant?: Restaurant | null) {
  return [restaurant?.address_line1, restaurant?.city].filter(Boolean).join(', ') || 'Address not added';
}

export function restaurantLocationLabel(restaurant: Restaurant) {
  return `${restaurant.name} — ${restaurantAddress(restaurant)}`;
}

export function getPromotionStatus(promotion: Promotion): Filter {
  const now = new Date();
  if (promotion.status === 'draft') return 'draft';
  if (promotion.ends_at && new Date(promotion.ends_at) <= now) return 'ended';
  if (promotion.status === 'active' && promotion.starts_at && new Date(promotion.starts_at) > now) return 'pending';
  if (promotion.status === 'active') return 'active';
  return 'draft';
}

export function normalizeBuilderGameType(value?: string | null): BuilderGameType {
  if (value === 'mystery_box') return 'mystery_box';
  if (value === 'scratch_card') return 'scratch_card';
  if (value === 'open_the_door') return 'open_the_door';
  return 'wheel';
}

export function usePromotionsAdmin() {
  const supabase = useMemo(() => createClient(), []);

  const [copy, setCopy] = useState(fallbackPromotionsCopy);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('');
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [counts, setCounts] = useState<CountsByPromotion>({});
  const [countsBySlug, setCountsBySlug] = useState<CountsByPromotion>({});
  const [metricsError, setMetricsError] = useState('');
  const [metricsInfo, setMetricsInfo] = useState('');
  const [name, setName] = useState('');
  const [gameType, setGameType] = useState<BuilderGameType>('wheel');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mode, setMode] = useState<PromotionsAdminMode>('manage');
  const [filter, setFilter] = useState<Filter>('active');
  const [performance, setPerformance] = useState<PromotionPerformance | null>(null);
  const [loadingPerformanceId, setLoadingPerformanceId] = useState<string | null>(null);
  const [performanceError, setPerformanceError] = useState('');

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) || null;

  async function loadPromotionMetrics() {
    setMetricsError('');
    const response = await fetch('/api/admin/promotion-metrics', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMetricsError(payload?.error || 'Could not load promotion metrics.');
      return;
    }

    setCounts(payload.metrics || {});
    setCountsBySlug(payload.metricsBySlug || {});

    if (typeof payload.couponCount === 'number') {
      setMetricsInfo(`${payload.couponCount} coupon records loaded into metrics.`);
    }
  }

  async function loadPromotionPerformance(promotionId: string) {
    setPerformanceError('');
    setLoadingPerformanceId(promotionId);

    const response = await fetch(`/api/admin/promotion-performance?promotionId=${encodeURIComponent(promotionId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => ({}));
    setLoadingPerformanceId(null);

    if (!response.ok) {
      setPerformanceError(payload?.error || 'Could not load promotion performance.');
      return;
    }

    setPerformance(payload as PromotionPerformance);
  }

  async function loadPromotions(restaurantId: string) {
    const result = await supabase
      .from('promotions')
      .select('id,name,slug,status,created_at,restaurant_id,game_type,starts_at,ends_at')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (result.error) {
      setError(result.error.message);
      return;
    }

    const loaded = (result.data || []) as Promotion[];
    setPromotions(loaded);

    if (!loaded.length) {
      setCounts({});
      setCountsBySlug({});
      return;
    }

    await loadPromotionMetrics();
  }

  useEffect(() => {
    async function load() {
      const loadedCopy = await loadSiteContentMap(supabase, 'admin_promotions', fallbackPromotionsCopy);
      setCopy(loadedCopy as typeof fallbackPromotionsCopy);

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        window.location.href = '/auth';
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const requestedMode = params.get('mode');
      const requestedSlug = params.get('slug');

      if (requestedMode === 'create' || requestedMode === 'drafts' || requestedMode === 'manage') {
        setMode(requestedMode);
      }

      const result = await supabase
        .from('restaurants')
        .select('id,name,slug,address_line1,city,phone')
        .eq('owner_id', userData.user.id)
        .order('created_at', { ascending: false });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      const owned = (result.data || []) as Restaurant[];
      setRestaurants(owned);

      const preselected = requestedSlug ? owned.find((restaurant) => restaurant.slug === requestedSlug) : null;
      setSelectedRestaurantId((preselected || owned[0])?.id || '');
    }

    load();
  }, [supabase]);

  useEffect(() => {
    if (selectedRestaurantId) {
      loadPromotions(selectedRestaurantId);
    } else {
      setPromotions([]);
    }
  }, [selectedRestaurantId]);

  async function createPromotion() {
    if (!selectedRestaurant || !name.trim()) return;

    setSaving(true);
    setError('');

    const slug = `${toPromotionSlug(name)}-${Date.now().toString().slice(-4)}`;

    const response = await supabase
      .from('promotions')
      .insert({
        restaurant_id: selectedRestaurant.id,
        name: name.trim(),
        slug,
        status: 'draft',
        game_type: gameType,
      })
      .select('id')
      .single();

    if (response.error || !response.data) {
      setError(response.error?.message || 'Could not create promotion.');
      setSaving(false);
      return;
    }

    window.location.href = `/admin/promotions/${response.data.id}/builder`;
  }

  async function deletePromotion(promotion: Promotion) {
    if (getPromotionStatus(promotion) !== 'draft') return;
    if (!window.confirm(`Delete draft ${promotion.name}?`)) return;

    setDeletingId(promotion.id);
    await supabase.from('promotion_rewards').delete().eq('promotion_id', promotion.id);

    const result = await supabase.from('promotions').delete().eq('id', promotion.id);
    if (result.error) setError(result.error.message);
    if (selectedRestaurantId) await loadPromotions(selectedRestaurantId);

    setDeletingId(null);
  }

  async function copyPlayLink(promotion: Promotion) {
    if (!selectedRestaurant) return;

    await navigator.clipboard.writeText(
      `${window.location.origin}/play/${selectedRestaurant.slug}/${promotion.slug}`,
    );

    setCopiedId(promotion.id);
    window.setTimeout(() => setCopiedId(null), 1500);
  }

  async function endPromotion(promotion: Promotion) {
    const currentStatus = getPromotionStatus(promotion);
    if (currentStatus !== 'active' && currentStatus !== 'pending') return;
    if (!window.confirm(`End ${promotion.name} now? Customers will no longer be able to play this promotion.`)) return;

    setEndingId(promotion.id);
    setError('');

    const endedAt = new Date().toISOString();
    const result = await supabase.from('promotions').update({ ends_at: endedAt }).eq('id', promotion.id);

    if (result.error) {
      setError(result.error.message);
      setEndingId(null);
      return;
    }

    setPromotions((current) => current.map((item) => (
      item.id === promotion.id ? { ...item, ends_at: endedAt } : item
    )));

    await loadPromotionMetrics();
    setFilter('ended');
    setEndingId(null);
    confetti({ particleCount: 180, spread: 110, origin: { y: 0.62 } });
  }

  const statusCounts = promotions.reduce<Record<Filter, number>>((accumulator, promotion) => {
    const status = getPromotionStatus(promotion);
    accumulator[status] += 1;
    accumulator.all += 1;
    return accumulator;
  }, { active: 0, pending: 0, draft: 0, ended: 0, all: 0 });

  const visiblePromotions = mode === 'drafts'
    ? promotions.filter((promotion) => getPromotionStatus(promotion) === 'draft')
    : mode === 'create'
      ? []
      : promotions.filter((promotion) => {
          const status = getPromotionStatus(promotion);
          if (status === 'draft') return false;
          return filter === 'all' || status === filter;
        });

  const canCreate = Boolean(selectedRestaurant && name.trim() && !saving);

  return {
    copy,
    restaurants,
    selectedRestaurantId,
    setSelectedRestaurantId,
    promotions,
    counts,
    countsBySlug,
    metricsError,
    metricsInfo,
    name,
    setName,
    gameType,
    setGameType,
    error,
    setError,
    saving,
    deletingId,
    endingId,
    copiedId,
    mode,
    setMode,
    filter,
    setFilter,
    performance,
    setPerformance,
    loadingPerformanceId,
    performanceError,
    selectedRestaurant,
    statusCounts,
    visiblePromotions,
    canCreate,
    actions: {
      loadPromotionMetrics,
      loadPromotionPerformance,
      loadPromotions,
      createPromotion,
      deletePromotion,
      copyPlayLink,
      endPromotion,
    },
  };
}

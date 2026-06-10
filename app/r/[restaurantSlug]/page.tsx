import { redirect } from 'next/navigation';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import BrandedUnavailablePage from '@/components/BrandedUnavailablePage';
import { RestaurantPublicPage } from '@/components/public/RestaurantPublicPage';

// ─── Types ────────────────────────────────────────────────────────────────────

type PromotionLookupRestaurant = {
  id: string;
  name: string;
  slug: string;
  address_line1?: string | null;
  city?: string | null;
  current_promotion_id?: string | null;
};

type Promotion = {
  id: string;
  name: string;
  slug: string;
  status: string;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at?: string | null;
};

export type PublicRestaurant = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  hero_image_url: string | null;
  logo_url: string | null;
  brand_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  province_state: string | null;
  postal_code: string | null;
  country: string | null;
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  google_maps_url: string | null;
  hours: unknown;
  experience_mode: string;
  current_promotion_id: string | null;
};

export type PublicMenuItem = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number | null;
  is_featured: boolean;
  available: boolean;
  tags: string[];
  menu_id: string | null;
  display_order: number;
};

export type PublicSection = {
  id: string;
  name: string;
  display_order: number;
  items: PublicMenuItem[];
};

export type PublicPromotion = {
  id: string;
  name: string;
  slug: string;
  game_type?: string | null;
};

export type PublicReward = {
  id: string;
  label: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url) throw new Error('Supabase URL is missing.');
  if (!serviceKey) throw new Error('Reusable QR resolver is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchPromotionForCard(
  supabase: ReturnType<typeof makeServiceClient>,
  restaurant: PublicRestaurant,
  now: Date,
): Promise<[PublicPromotion | null, PublicReward[], Set<string>]> {
  const promoResult = await supabase
    .from('promotions')
    .select('id,name,slug,status,starts_at,ends_at,promotion_game_assignments(game_type)')
    .eq('restaurant_id', restaurant.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(20);

  if (promoResult.error || !promoResult.data?.length) return [null, [], new Set()];

  type PromoRow = { id: string; name: string; slug: string; status: string; starts_at?: string | null; ends_at?: string | null; promotion_game_assignments?: Array<{ game_type: string }> | null };
  const live = (promoResult.data as PromoRow[]).find((p) => {
    if (p.starts_at && now < new Date(p.starts_at)) return false;
    if (p.ends_at && now > new Date(p.ends_at)) return false;
    return true;
  });

  if (!live) return [null, [], new Set()];

  const gameType = live.promotion_game_assignments?.[0]?.game_type ?? null;
  const promotion: PublicPromotion = { id: live.id, name: live.name, slug: live.slug, game_type: gameType };

  const rewardsResult = await supabase
    .from('promotion_rewards')
    .select('id,custom_name,reward_type,reward_value,menu_item_id,display_order')
    .eq('promotion_id', live.id)
    .order('display_order', { ascending: true });

  if (rewardsResult.error || !rewardsResult.data?.length) return [promotion, [], new Set()];

  type RewardRow = { id: string; custom_name?: string | null; reward_type?: string | null; reward_value?: number | null; menu_item_id?: string | null; display_order: number };
  const rawRewards = rewardsResult.data as RewardRow[];

  const menuItemIds = rawRewards.map((r) => r.menu_item_id).filter((id): id is string => !!id);
  const rewardItemIds = new Set(menuItemIds);
  let menuNamesById: Record<string, string> = {};

  if (menuItemIds.length > 0) {
    const menuResult = await supabase.from('menu_items').select('id,name').in('id', menuItemIds);
    if (!menuResult.error && menuResult.data) {
      menuNamesById = Object.fromEntries((menuResult.data as Array<{ id: string; name: string }>).map((m) => [m.id, m.name]));
    }
  }

  const promotionRewards: PublicReward[] = rawRewards.slice(0, 4).map((r) => {
    const itemName = r.custom_name || (r.menu_item_id ? menuNamesById[r.menu_item_id] : null) || 'Reward';
    let label: string;
    if (r.reward_type === 'free') label = `Free ${itemName}`;
    else if (r.reward_type === 'discount') label = `${r.reward_value ?? 0}% Off ${itemName}`;
    else label = itemName;
    return { id: r.id, label };
  });

  return [promotion, promotionRewards, rewardItemIds];
}

function isPromotionLive(promotion: Promotion, now: Date) {
  if (promotion.status !== 'active') return false;
  if (promotion.starts_at && now < new Date(promotion.starts_at)) return false;
  if (promotion.ends_at && now > new Date(promotion.ends_at)) return false;
  return true;
}

function isPromotionNotEnded(promotion: Promotion, now: Date) {
  if (promotion.ends_at && now > new Date(promotion.ends_at)) return false;
  return true;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

// E1: per-page metadata for OG sharing and browser tab title
export async function generateMetadata({
  params,
}: {
  params: { restaurantSlug: string };
}): Promise<Metadata> {
  try {
    const supabase = makeServiceClient();
    const { data } = await supabase
      .from('restaurants')
      .select('name,description,logo_url')
      .eq('slug', params.restaurantSlug)
      .single();
    if (!data) return { title: 'Menu' };
    return {
      title: `${data.name} — Menu`,
      description: data.description || `Browse the menu for ${data.name}.`,
      openGraph: {
        title: `${data.name} — Menu`,
        description: data.description || `Browse the menu for ${data.name}.`,
        ...(data.logo_url ? { images: [{ url: data.logo_url }] } : {}),
      },
    };
  } catch {
    return { title: 'Menu' };
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PermanentRestaurantQrPage({
  params,
}: {
  params: { restaurantSlug: string };
}) {
  const now = new Date();
  let supabase;

  try {
    supabase = makeServiceClient();
  } catch (error: any) {
    return (
      <BrandedUnavailablePage
        message={error?.message || 'Reusable QR resolver is not configured.'}
      />
    );
  }

  // Fetch full restaurant row — needed for both modes.
  const restaurantResult = await supabase
    .from('restaurants')
    .select(
      'id,name,slug,description,hero_image_url,logo_url,brand_color,secondary_color,accent_color,phone,address_line1,city,province_state,postal_code,country,website_url,instagram_url,facebook_url,google_maps_url,hours,experience_mode,current_promotion_id'
    )
    .eq('slug', params.restaurantSlug)
    .single();

  if (restaurantResult.error || !restaurantResult.data) {
    return <BrandedUnavailablePage message="Restaurant not found." />;
  }

  const restaurant = restaurantResult.data as PublicRestaurant;
  const mode = restaurant.experience_mode;

  // ── menu_only / menu_and_promotion → public menu experience ─────────────────

  if (mode === 'menu_only' || mode === 'menu_and_promotion') {
    const promotionFetch: Promise<[PublicPromotion | null, PublicReward[], Set<string>]> =
      mode === 'menu_and_promotion'
        ? fetchPromotionForCard(supabase, restaurant, now)
        : Promise.resolve([null, [], new Set<string>()]);

    const [menusResult, itemsResult, [activePromotion, promotionRewards, rewardItemIds]] = await Promise.all([
      supabase
        .from('menus')
        .select('id,name,display_order')
        .eq('restaurant_id', restaurant.id)
        .order('display_order', { ascending: true }),
      supabase
        .from('menu_items')
        .select('id,name,description,image_url,price,is_featured,available,tags,menu_id,display_order')
        .eq('restaurant_id', restaurant.id)
        .eq('available', true)
        .is('deleted_at', null)
        .order('display_order', { ascending: true }),
      promotionFetch,
    ]);

    const menus = (menusResult.data || []) as Array<{
      id: string;
      name: string;
      display_order: number;
    }>;
    const allItems = (itemsResult.data || []) as PublicMenuItem[];

    const sections: PublicSection[] = menus.map((menu) => ({
      id: menu.id,
      name: menu.name,
      display_order: menu.display_order,
      items: allItems.filter((item) => item.menu_id === menu.id),
    }));

    return (
      <RestaurantPublicPage
        restaurant={restaurant}
        sections={sections}
        promotion={activePromotion}
        promotionRewards={promotionRewards}
        rewardItemIds={rewardItemIds}
      />
    );
  }

  // ── promotion_only → existing flow, unchanged ────────────────────────────────

  const promotionRestaurant = restaurant as unknown as PromotionLookupRestaurant;

  const promotionsResult = await supabase
    .from('promotions')
    .select('id,name,slug,status,starts_at,ends_at,created_at')
    .eq('restaurant_id', restaurant.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (promotionsResult.error) {
    return (
      <BrandedUnavailablePage
        restaurant={promotionRestaurant}
        message={`Promotion lookup failed: ${promotionsResult.error.message}`}
      />
    );
  }

  const promotions = (promotionsResult.data || []) as Promotion[];
  const livePromotions = promotions.filter((p) => isPromotionLive(p, now));
  const nonEndedPromotions = promotions.filter((p) => isPromotionNotEnded(p, now));

  const promotion =
    livePromotions.find((p) => p.id === restaurant.current_promotion_id) ||
    livePromotions[0] ||
    nonEndedPromotions.find((p) => p.id === restaurant.current_promotion_id) ||
    nonEndedPromotions[0] ||
    null;

  if (!promotion) {
    return (
      <BrandedUnavailablePage
        restaurant={promotionRestaurant}
        message="There is no active SpinBite promotion for this location right now. Please ask staff."
      />
    );
  }

  redirect(`/play/${restaurant.slug}/${promotion.slug}`);
}

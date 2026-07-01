import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import BrandedUnavailablePage from '@/components/BrandedUnavailablePage';
import { TouchpointMenuPage } from '@/components/public/TouchpointMenuPage';
import { isSpecialOfferActive, calculateSpecialPrice, getDiscountLabel } from '@/lib/menu/special-offer';
import type {
  PublicRestaurant,
  PublicSection,
  PublicMenuItem,
  PublicPromotion,
  PublicReward,
} from '@/app/r/[restaurantSlug]/page';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PublicTouchpoint = {
  id: string;
  name: string;
  type: string;
  section_name: string | null;
  touchpoint_code: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) throw new Error('Service client is not configured.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchPromotionForCard(
  supabase: ReturnType<typeof makeServiceClient>,
  restaurantId: string,
  now: Date,
): Promise<[PublicPromotion | null, PublicReward[]]> {
  const result = await supabase
    .from('promotions')
    .select(
      'id,name,slug,status,game_type,starts_at,ends_at,promotion_game_assignments(game_type,enabled,is_primary)',
    )
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(20);

  if (result.error || !result.data?.length) return [null, []];

  type AssignmentRow = { game_type: string; enabled: boolean; is_primary: boolean };
  type PromoRow = {
    id: string;
    name: string;
    slug: string;
    status: string;
    game_type?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    promotion_game_assignments?: AssignmentRow[] | null;
  };

  const live = (result.data as PromoRow[]).find((p) => {
    if (p.starts_at && now < new Date(p.starts_at)) return false;
    if (p.ends_at && now > new Date(p.ends_at)) return false;
    return true;
  });

  if (!live) return [null, []];

  const assignments = (live.promotion_game_assignments ?? []).filter(
    (a) => a.enabled !== false,
  );
  const game_types = assignments.map((a) => a.game_type);
  const primaryAssignment = assignments.find((a) => a.is_primary);
  const gameType =
    primaryAssignment?.game_type ?? game_types[0] ?? live.game_type ?? null;

  const promotion: PublicPromotion = {
    id: live.id,
    name: live.name,
    slug: live.slug,
    game_type: gameType,
    game_types,
  };

  const rewardsResult = await supabase
    .from('promotion_rewards')
    .select('id,custom_name,reward_type,reward_value,menu_item_id,display_order')
    .eq('promotion_id', live.id)
    .order('display_order', { ascending: true });

  if (rewardsResult.error || !rewardsResult.data?.length) return [promotion, []];

  type RewardRow = {
    id: string;
    custom_name?: string | null;
    reward_type?: string | null;
    reward_value?: number | null;
    menu_item_id?: string | null;
    display_order: number;
  };
  const rawRewards = rewardsResult.data as RewardRow[];
  const menuItemIds = rawRewards
    .map((r) => r.menu_item_id)
    .filter((id): id is string => !!id);
  let menuNamesById: Record<string, string> = {};

  if (menuItemIds.length > 0) {
    const menuResult = await supabase
      .from('menu_items')
      .select('id,name')
      .in('id', menuItemIds);
    if (!menuResult.error && menuResult.data) {
      menuNamesById = Object.fromEntries(
        (menuResult.data as Array<{ id: string; name: string }>).map((m) => [
          m.id,
          m.name,
        ]),
      );
    }
  }

  const promotionRewards: PublicReward[] = rawRewards.slice(0, 4).map((r) => {
    const itemName =
      r.custom_name ||
      (r.menu_item_id ? menuNamesById[r.menu_item_id] : null) ||
      'Reward';
    let label: string;
    if (r.reward_type === 'free') label = `Free ${itemName}`;
    else if (r.reward_type === 'discount')
      label = `${r.reward_value ?? 0}% Off ${itemName}`;
    else label = itemName;
    return { id: r.id, label };
  });

  return [promotion, promotionRewards];
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: { restaurantSlug: string; touchpointCode: string };
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TouchpointQrPage({
  params,
}: {
  params: { restaurantSlug: string; touchpointCode: string };
}) {
  const now = new Date();

  let supabase: ReturnType<typeof makeServiceClient>;
  try {
    supabase = makeServiceClient();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Service client not configured.';
    return <BrandedUnavailablePage message={message} />;
  }

  // Resolve restaurant
  const restaurantResult = await supabase
    .from('restaurants')
    .select(
      'id,name,slug,description,hero_image_url,logo_url,brand_color,secondary_color,accent_color,phone,address_line1,city,province_state,postal_code,country,website_url,instagram_url,facebook_url,google_maps_url,hours,experience_mode,current_promotion_id',
    )
    .eq('slug', params.restaurantSlug)
    .single();

  if (restaurantResult.error || !restaurantResult.data) {
    return <BrandedUnavailablePage message="Restaurant not found." />;
  }

  const restaurant = restaurantResult.data as PublicRestaurant;

  // Resolve touchpoint by code
  const touchpointResult = await supabase
    .from('restaurant_touchpoints')
    .select('id,name,type,section_name,touchpoint_code')
    .eq('restaurant_id', restaurant.id)
    .eq('touchpoint_code', params.touchpointCode)
    .eq('active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (touchpointResult.error || !touchpointResult.data) {
    return (
      <BrandedUnavailablePage message="This QR code is not currently active. Please ask a staff member." />
    );
  }

  const touchpoint = touchpointResult.data as PublicTouchpoint;

  // Only session-enabled modes support the ordering touchpoint flow
  const mode = restaurant.experience_mode;
  if (mode !== 'menu_only' && mode !== 'menu_and_promotion') {
    return <BrandedUnavailablePage message="Table ordering is not enabled for this location." />;
  }

  // Load menu, capability, and (optionally) promotion in parallel
  const promotionFetch: Promise<[PublicPromotion | null, PublicReward[]]> =
    mode === 'menu_and_promotion'
      ? fetchPromotionForCard(supabase, restaurant.id, now)
      : Promise.resolve([null, []]);

  const [menusResult, itemsResult, [activePromotion, promotionRewards], capabilityResult, paymentCapabilityResult, restaurantSettingsResult] =
    await Promise.all([
      supabase
        .from('menus')
        .select('id,name,display_order')
        .eq('restaurant_id', restaurant.id)
        .order('display_order', { ascending: true }),
      supabase
        .from('menu_items')
        .select(
          'id,name,description,image_url,price,is_featured,available,tags,menu_id,display_order,special_enabled,special_type,special_percent,special_price,special_start_at,special_end_at,special_no_expiry',
        )
        .eq('restaurant_id', restaurant.id)
        .is('deleted_at', null)
        .order('display_order', { ascending: true }),
      promotionFetch,
      supabase
        .from('restaurant_capabilities')
        .select('enabled')
        .eq('restaurant_id', restaurant.id)
        .eq('capability_name', 'ordering')
        .maybeSingle(),
      supabase
        .from('restaurant_capabilities')
        .select('enabled')
        .eq('restaurant_id', restaurant.id)
        .eq('capability_name', 'payment_simulation')
        .maybeSingle(),
      supabase
        .from('restaurant_settings')
        .select('key,value')
        .eq('restaurant_id', restaurant.id)
        .in('key', ['tax_rate_percent', 'service_fee_percent']),
    ]);

  const orderingEnabled = capabilityResult.data?.enabled === true;
  const paymentSimulationEnabled = paymentCapabilityResult.data?.enabled === true;
  const settingsRows = (restaurantSettingsResult.data ?? []) as Array<{ key: string; value: unknown }>;
  const taxRatePercent = Number(settingsRows.find((r) => r.key === 'tax_rate_percent')?.value ?? 0) || 0;
  const serviceFeePercent = Number(settingsRows.find((r) => r.key === 'service_fee_percent')?.value ?? 0) || 0;

  const menus = (menusResult.data ?? []) as Array<{
    id: string;
    name: string;
    display_order: number;
  }>;

  type RawMenuItem = Omit<PublicMenuItem, 'special_active' | 'effective_price' | 'discount_label'> & {
    special_enabled: boolean;
    special_type: string | null;
    special_percent: number | null;
    special_price: number | null;
    special_start_at: string | null;
    special_end_at: string | null;
    special_no_expiry: boolean;
  };

  const rawItems = (itemsResult.data ?? []) as RawMenuItem[];
  const allItems: PublicMenuItem[] = rawItems.map((raw) => {
    const active = isSpecialOfferActive(raw, now);
    let effective_price = raw.price;
    let discount_label: string | null = null;
    if (active && raw.price != null && raw.special_type) {
      effective_price = calculateSpecialPrice(
        raw.price,
        raw.special_type,
        raw.special_percent,
        raw.special_price,
      );
      discount_label = getDiscountLabel(
        raw.price,
        raw.special_type,
        raw.special_percent,
        raw.special_price,
      );
    }
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      image_url: raw.image_url,
      price: raw.price,
      is_featured: raw.is_featured,
      available: raw.available,
      tags: raw.tags,
      menu_id: raw.menu_id,
      display_order: raw.display_order,
      special_active: active,
      effective_price,
      discount_label,
    };
  });

  const sections: PublicSection[] = menus.map((menu) => ({
    id: menu.id,
    name: menu.name,
    display_order: menu.display_order,
    items: allItems.filter((item) => item.menu_id === menu.id),
  }));

  return (
    <TouchpointMenuPage
      restaurant={restaurant}
      sections={sections}
      promotion={activePromotion}
      promotionRewards={promotionRewards}
      orderingEnabled={orderingEnabled}
      paymentSimulationEnabled={paymentSimulationEnabled}
      taxRatePercent={taxRatePercent}
      serviceFeePercent={serviceFeePercent}
      touchpoint={touchpoint}
    />
  );
}

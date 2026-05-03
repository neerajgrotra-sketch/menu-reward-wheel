import { redirect } from 'next/navigation';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import BrandedUnavailablePage from '@/components/BrandedUnavailablePage';

type Restaurant = {
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

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url) throw new Error('Supabase URL is missing.');
  if (!serviceKey) throw new Error('Reusable QR resolver is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel.');

  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isPromotionLive(promotion: Promotion, now: Date) {
  // No-expiry rule:
  // ends_at = null means the promotion runs until staff manually ends it.
  // Manual ending still works because End Promotion sets ends_at = now().
  if (promotion.status !== 'active') return false;
  if (promotion.starts_at && now < new Date(promotion.starts_at)) return false;
  if (promotion.ends_at && now > new Date(promotion.ends_at)) return false;
  return true;
}

function isPromotionNotEnded(promotion: Promotion, now: Date) {
  // No-expiry rule:
  // A null end date is not ended. It remains eligible until an end timestamp is written.
  if (promotion.ends_at && now > new Date(promotion.ends_at)) return false;
  return true;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PermanentRestaurantQrPage({ params }: { params: { restaurantSlug: string } }) {
  const now = new Date();
  let supabase;

  try {
    supabase = makeServiceClient();
  } catch (error: any) {
    return <BrandedUnavailablePage message={error?.message || 'Reusable QR resolver is not configured.'} />;
  }

  const restaurantResult = await supabase
    .from('restaurants')
    .select('id,name,slug,address_line1,city,current_promotion_id')
    .eq('slug', params.restaurantSlug)
    .single();

  if (restaurantResult.error || !restaurantResult.data) {
    return <BrandedUnavailablePage message="Restaurant not found." />;
  }

  const restaurant = restaurantResult.data as Restaurant;

  // Source of truth for reusable QR:
  // The printed QR belongs to the restaurant location, not to the promotion that
  // generated the print kit. It must route to the current playable promotion for
  // this location even if current_promotion_id is stale or the status/date fields
  // are not perfectly synchronized.
  const promotionsResult = await supabase
    .from('promotions')
    .select('id,name,slug,status,starts_at,ends_at,created_at')
    .eq('restaurant_id', restaurant.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (promotionsResult.error) {
    return (
      <BrandedUnavailablePage
        restaurant={restaurant}
        message={`Promotion lookup failed: ${promotionsResult.error.message}`}
      />
    );
  }

  const promotions = (promotionsResult.data || []) as Promotion[];
  const livePromotions = promotions.filter((promotion) => isPromotionLive(promotion, now));
  const nonEndedPromotions = promotions.filter((promotion) => isPromotionNotEnded(promotion, now));

  const promotion =
    livePromotions.find((item) => item.id === restaurant.current_promotion_id) ||
    livePromotions[0] ||
    nonEndedPromotions.find((item) => item.id === restaurant.current_promotion_id) ||
    nonEndedPromotions[0] ||
    null;

  if (!promotion) {
    return (
      <BrandedUnavailablePage
        restaurant={restaurant}
        message="There is no active SpinBite promotion for this location right now. Please ask staff."
      />
    );
  }

  redirect(`/play/${restaurant.slug}/${promotion.slug}`);
}

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
  if (promotion.status !== 'active') return false;
  if (promotion.starts_at && now < new Date(promotion.starts_at)) return false;
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
  // generated the print kit. This resolver must therefore be server-authoritative
  // and bypass public/RLS visibility issues by using the service role. It fetches
  // active promotions for the location and then validates the time window in JS.
  const activePromotionsResult = await supabase
    .from('promotions')
    .select('id,name,slug,status,starts_at,ends_at,created_at')
    .eq('restaurant_id', restaurant.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(25);

  if (activePromotionsResult.error) {
    return (
      <BrandedUnavailablePage
        restaurant={restaurant}
        message={`Promotion lookup failed: ${activePromotionsResult.error.message}`}
      />
    );
  }

  const livePromotions = ((activePromotionsResult.data || []) as Promotion[])
    .filter((promotion) => isPromotionLive(promotion, now));

  const promotion =
    livePromotions.find((item) => item.id === restaurant.current_promotion_id) ||
    livePromotions[0] ||
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

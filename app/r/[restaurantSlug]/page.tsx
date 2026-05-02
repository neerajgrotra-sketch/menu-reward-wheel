import { redirect } from 'next/navigation';
import BrandedUnavailablePage from '@/components/BrandedUnavailablePage';
import { createClient } from '@/lib/supabase/server';

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

function isPromotionLive(promotion: Promotion, now: Date) {
  if (promotion.status !== 'active') return false;
  if (promotion.starts_at && now < new Date(promotion.starts_at)) return false;
  if (promotion.ends_at && now > new Date(promotion.ends_at)) return false;
  return true;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PermanentRestaurantQrPage({ params }: { params: { restaurantSlug: string } }) {
  const supabase = createClient();
  const now = new Date();
  const nowIso = now.toISOString();

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
  // find the current live promotion for this restaurant location.
  // Prefer restaurants.current_promotion_id when it is live, but do not depend on it.
  const livePromotionsResult = await supabase
    .from('promotions')
    .select('id,name,slug,status,starts_at,ends_at,created_at')
    .eq('restaurant_id', restaurant.id)
    .eq('status', 'active')
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(10);

  const livePromotions = ((livePromotionsResult.data || []) as Promotion[])
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

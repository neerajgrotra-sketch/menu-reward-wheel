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
};

function isPromotionLive(promotion: Promotion) {
  const now = new Date();
  if (promotion.status !== 'active') return false;
  if (promotion.starts_at && now < new Date(promotion.starts_at)) return false;
  if (promotion.ends_at && now > new Date(promotion.ends_at)) return false;
  return true;
}

export default async function PermanentRestaurantQrPage({ params }: { params: { restaurantSlug: string } }) {
  const supabase = createClient();

  const restaurantResult = await supabase
    .from('restaurants')
    .select('id,name,slug,address_line1,city,current_promotion_id')
    .eq('slug', params.restaurantSlug)
    .single();

  if (restaurantResult.error || !restaurantResult.data) {
    return <BrandedUnavailablePage message="Restaurant not found." />;
  }

  const restaurant = restaurantResult.data as Restaurant;

  let promotion: Promotion | null = null;

  if (restaurant.current_promotion_id) {
    const currentPromotion = await supabase
      .from('promotions')
      .select('id,name,slug,status,starts_at,ends_at')
      .eq('id', restaurant.current_promotion_id)
      .eq('restaurant_id', restaurant.id)
      .single();

    if (currentPromotion.data && isPromotionLive(currentPromotion.data as Promotion)) {
      promotion = currentPromotion.data as Promotion;
    }
  }

  if (!promotion) {
    const fallbackPromotion = await supabase
      .from('promotions')
      .select('id,name,slug,status,starts_at,ends_at')
      .eq('restaurant_id', restaurant.id)
      .eq('status', 'active')
      .or(`starts_at.is.null,starts_at.lte.${new Date().toISOString()}`)
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallbackPromotion.data && isPromotionLive(fallbackPromotion.data as Promotion)) {
      promotion = fallbackPromotion.data as Promotion;
    }
  }

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

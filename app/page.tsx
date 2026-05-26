import { createClient } from '@/lib/supabase/server';
import LandingPageClient, { type HomeHeroContent } from './LandingPageClient';

const fallbackHero: HomeHeroContent = {
  eyebrow: 'QR games for restaurants',
  headline: 'Turn Every Meal Into a Game',
  subheadline: 'Restaurants create spin wheels tied to real menu items. Diners scan a QR code, spin, win, and redeem instantly. Fun that actually drives sales.',
  badge_1: 'No app download',
  badge_2: 'Instant redemption',
  badge_3: 'Margin-safe controls',
  primary_cta_label: 'Get Started Free',
  spin_button_label: 'Spin the Wheel',
};

export default async function LandingPage() {
  const supabase = createClient();

  const { data } = await supabase
    .from('site_content')
    .select('field_key,value')
    .eq('page_key', 'home')
    .eq('section_key', 'hero')
    .eq('is_active', true);

  const values = Object.fromEntries((data || []).map((item: { field_key: string; value: string }) => [item.field_key, item.value]));

  const hero: HomeHeroContent = {
    eyebrow: values.eyebrow || fallbackHero.eyebrow,
    headline: values.headline || fallbackHero.headline,
    subheadline: values.subheadline || fallbackHero.subheadline,
    badge_1: values.badge_1 || fallbackHero.badge_1,
    badge_2: values.badge_2 || fallbackHero.badge_2,
    badge_3: values.badge_3 || fallbackHero.badge_3,
    primary_cta_label: values.primary_cta_label || fallbackHero.primary_cta_label,
    spin_button_label: values.spin_button_label || fallbackHero.spin_button_label,
  };

  return <LandingPageClient hero={hero} />;
}

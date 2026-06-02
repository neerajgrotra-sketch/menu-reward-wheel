import { createClient } from '@/lib/supabase/server';
import LandingPageClient from './LandingPageClient';
import type { HomeHeroContent } from '@/components/home/HeroSection';

// Fallback URLs are the same values that were hardcoded before CMS support was added.
// They are used whenever the CMS row is missing or its value is empty, so the
// homepage is always fully functional regardless of whether the Supabase migration
// has been applied yet.
const FALLBACK_EXPLAINER_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const FALLBACK_GAME_DEMO_URL = 'https://www.youtube.com/embed/dQw4w9WgXcQ';

const fallbackHero: HomeHeroContent = {
  eyebrow: 'QR games for restaurants',
  headline: 'Turn Every Meal Into a Game',
  subheadline:
    'Restaurants create spin wheels tied to real menu items. Diners scan a QR code, spin, win, and redeem instantly. Fun that actually drives sales.',
  badge_1: 'No app download',
  badge_2: 'Instant redemption',
  badge_3: 'Margin-safe controls',
  primary_cta_label: 'Get Started Free',
  spin_button_label: 'Spin the Wheel',
};

function toMap(data: { field_key: string; value: string }[] | null) {
  return Object.fromEntries((data || []).map((r) => [r.field_key, r.value]));
}

export default async function LandingPage() {
  const supabase = createClient();

  const [{ data: heroData }, { data: videoData }, { data: demosData }] =
    await Promise.all([
      supabase
        .from('site_content')
        .select('field_key,value')
        .eq('page_key', 'home')
        .eq('section_key', 'hero')
        .eq('is_active', true),
      supabase
        .from('site_content')
        .select('field_key,value')
        .eq('page_key', 'home')
        .eq('section_key', 'explainer_video')
        .eq('is_active', true),
      supabase
        .from('site_content')
        .select('field_key,value')
        .eq('page_key', 'home')
        .eq('section_key', 'game_demos')
        .eq('is_active', true),
    ]);

  const heroValues = toMap(heroData);
  const videoValues = toMap(videoData);
  const demoValues = toMap(demosData);

  const hero: HomeHeroContent = {
    eyebrow: heroValues.eyebrow || fallbackHero.eyebrow,
    headline: heroValues.headline || fallbackHero.headline,
    subheadline: heroValues.subheadline || fallbackHero.subheadline,
    badge_1: heroValues.badge_1 || fallbackHero.badge_1,
    badge_2: heroValues.badge_2 || fallbackHero.badge_2,
    badge_3: heroValues.badge_3 || fallbackHero.badge_3,
    primary_cta_label: heroValues.primary_cta_label || fallbackHero.primary_cta_label,
    spin_button_label: heroValues.spin_button_label || fallbackHero.spin_button_label,
  };

  const explainerVideo = {
    title: videoValues.title || 'See SpinBite in Action',
    description: videoValues.description || 'Watch how restaurants turn menus into interactive games.',
    // CMS value wins when present; otherwise the original hardcoded URL is used
    youtube_url: videoValues.youtube_url || FALLBACK_EXPLAINER_URL,
  };

  const gameDemoUrls = {
    // CMS field_key is the canonical game_type; CMS value wins when present,
    // otherwise the original placeholder URL is used as fallback.
    spin_wheel:    demoValues.spin_wheel    || FALLBACK_GAME_DEMO_URL,
    mystery_box:   demoValues.mystery_box   || FALLBACK_GAME_DEMO_URL,
    scratch_card:  demoValues.scratch_card  || FALLBACK_GAME_DEMO_URL,
    reward_reels:  demoValues.reward_reels  || FALLBACK_GAME_DEMO_URL,
    open_the_door: demoValues.open_the_door || FALLBACK_GAME_DEMO_URL,
  };

  return (
    <LandingPageClient
      hero={hero}
      explainerVideo={explainerVideo}
      gameDemoUrls={gameDemoUrls}
    />
  );
}

"use client";

import { motion } from 'framer-motion';
// AvailableGamesSection removed from this file; kept as standalone component in components/home
import { BarChart3, ChefHat, Flame, QrCode, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import ExplainerVideo from '@/components/ExplainerVideo';
import HeroSection, { type HomeHeroContent } from '@/components/home/HeroSection';
import PricingSection from '@/components/home/PricingSection';
import CTASection from '@/components/home/CTASection';

const steps = [
  { icon: ChefHat, title: 'Build your menu', body: 'Add dishes, drinks, combos, and chef specials in minutes.' },
  { icon: Sparkles, title: 'Create promotions', body: 'Turn menu items into spin rewards with discounts, free items, and limits.' },
  { icon: QrCode, title: 'Publish QR codes', body: 'Place QR codes on tables, receipts, posters, or takeout bags.' },
  { icon: Trophy, title: 'Customers play', body: 'Diners spin, win, redeem, and order more with a fun reward moment.', learnMore: true },
];

const benefits = [
  { icon: Flame, title: 'Move slow items', body: 'Promote specific dishes without discounting the whole menu.' },
  { icon: BarChart3, title: 'Boost order value', body: 'Use minimum spend and item-specific rewards to nudge bigger baskets.' },
  { icon: ShieldCheck, title: 'Control margins', body: 'Set probability weights, expiry windows, and daily caps.' },
];

const games = [
  { title: 'Spin Wheel', icon: '🎯', status: 'Live', body: 'A branded reward wheel for discounts, free menu items, daily promos, and table-side excitement.' },
  { title: 'Mystery Box Reveal', icon: '🎁', status: 'Live', body: 'Guests pick one of three mystery boxes and reveal a surprise coupon with a fun reward moment.' },
  { title: 'Scratch Card', icon: '🎟️', status: 'Live', body: 'A quick scratch-and-win experience for receipts, posters, and post-payment campaigns.' },
  { title: 'Slot Machine', icon: '🎰', status: 'Coming Soon', body: 'A jackpot-style reveal for bigger campaign launches and high-energy promos.' },
  { title: 'Pick a Door', icon: '🚪', status: 'Coming Soon', body: 'Guests choose a door to uncover a menu reward, discount, or comeback coupon.' },
  { title: 'Fortune Cookie', icon: '🥠', status: 'Coming Soon', body: 'A restaurant-friendly reveal for rewards, messages, and limited-time offers.' },
];
// MysteryBoxHero relocated to components/home/HeroSection.tsx

export default function LandingPageClient({
  hero,
  explainerVideo,
}: {
  hero: HomeHeroContent;
  explainerVideo?: {
    title?: string | null;
    description?: string | null;
    youtube_url?: string | null;
  } | null;
}) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#FFF8F0] text-[#1F1F1F]">
      <nav className="sticky top-0 z-50 border-b border-orange-100 bg-[#FFF8F0]/90 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <a href="#top" className="flex min-w-0 items-center gap-2 text-2xl font-black text-[#FF6B00]" aria-label="SpinBite home"><span className="text-3xl leading-none">🎯</span><span>SpinBite</span></a>
          <div className="hidden gap-7 text-sm font-bold md:flex"><a href="#product" className="hover:text-[#FF6B00]">Product</a><a href="#available-games" className="hover:text-[#FF6B00]">Games</a><a href="#restaurants" className="hover:text-[#FF6B00]">Restaurants</a><a href="#pricing" className="hover:text-[#FF6B00]">Pricing</a></div>
          <div className="flex shrink-0 items-center gap-2"><a href="/auth" className="rounded-full px-3 py-2 text-sm font-black hover:bg-white sm:px-4">Login</a><a href="/auth" className="rounded-full bg-[#FF6B00] px-4 py-2 text-sm font-black text-white shadow-lg shadow-orange-200 sm:px-5">Sign Up</a></div>
        </div>
      </nav>

      <HeroSection hero={hero} />

      <section id="available-games" className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-white p-6 shadow-xl ring-1 ring-orange-100 sm:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div><p className="text-sm font-black uppercase tracking-[0.16em] text-[#FF6B00]">Available Games</p><h2 className="mt-2 text-3xl font-black sm:text-4xl">More than one way to win</h2><p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-stone-600">SpinBite now supports multiple QR game formats. Start with the live games today, then expand into new campaign types as the library grows.</p></div>
            <div className="rounded-full bg-orange-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-[#FF6B00]">3 live games • more coming soon</div>
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{games.map((game) => <div key={game.title} className="rounded-3xl border border-orange-100 bg-[#FFF8F0] p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="text-4xl">{game.icon}</span><span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${game.status === 'Live' ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-500'}`}>{game.status}</span></div><h3 className="mt-4 text-2xl font-black">{game.title}</h3><p className="mt-2 text-sm font-semibold leading-6 text-stone-600">{game.body}</p></div>)}</div>
        </div>
      </section>

<section id="product" className="px-4 py-12 sm:px-6">
  <div className="mx-auto max-w-6xl">
    
    <h2 className="text-center text-3xl font-black sm:text-4xl">
      How SpinBite Works
    </h2>

    <ExplainerVideo
      title={explainerVideo?.title}
      description={explainerVideo?.description}
      youtubeUrl={explainerVideo?.youtube_url}
    />

    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step) => (
        <motion.div
          key={step.title}
          whileHover={{ y: -6 }}
          className="rounded-3xl bg-white p-6 shadow-lg ring-1 ring-orange-100"
        >
          <step.icon className="h-8 w-8 text-[#FF6B00]" />

          <h3 className="mt-4 text-xl font-black">
            {step.title}
          </h3>

          <p className="mt-2 text-sm leading-6 text-stone-600">
            {step.body}
          </p>

          {step.learnMore && (
            <a
              href="/faq"
              className="mt-4 inline-flex rounded-full bg-orange-50 px-4 py-2 text-sm font-black text-[#FF6B00]"
            >
              Learn more
            </a>
          )}
        </motion.div>
      ))}
    </div>

  </div>
</section>
      <section id="restaurants" className="px-4 py-12 sm:px-6"><div className="mx-auto max-w-6xl rounded-[2rem] bg-[#1F1F1F] p-6 text-white sm:p-10"><h2 className="text-3xl font-black sm:text-4xl">Built for restaurant economics</h2><div className="mt-8 grid gap-4 md:grid-cols-3">{benefits.map((benefit) => <div key={benefit.title} className="rounded-3xl bg-white/10 p-6 ring-1 ring-white/10"><benefit.icon className="h-8 w-8 text-[#00C853]" /><h3 className="mt-4 text-xl font-black">{benefit.title}</h3><p className="mt-2 text-sm leading-6 text-white/70">{benefit.body}</p></div>)}</div></div></section>
      <PricingSection />
      <CTASection />
      <footer className="bg-[#111111] px-4 py-12 text-white sm:px-6"><div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.2fr_2fr]"><div><a href="#top" className="flex items-center gap-2 text-3xl font-black text-white" aria-label="SpinBite home"><span className="text-4xl leading-none">🎯</span><span>SpinBite</span></a><p className="mt-4 max-w-sm text-sm font-medium leading-6 text-white/60">QR-powered restaurant games that turn menu attention into orders, coupons, and measurable redemptions.</p><p className="mt-6 text-xs font-bold text-white/40">Copyright © 2026 SpinBite. All rights reserved.</p></div><div className="grid grid-cols-2 gap-8 sm:grid-cols-3"><div><h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">Navigation</h3><div className="mt-4 space-y-3 text-sm font-semibold text-white/60"><a className="block hover:text-white" href="#top">Home</a><a className="block hover:text-white" href="#product">Product</a><a className="block hover:text-white" href="#available-games">Games</a><a className="block hover:text-white" href="#pricing">Pricing</a></div></div><div><h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">Resources</h3><div className="mt-4 space-y-3 text-sm font-semibold text-white/60"><a className="block hover:text-white" href="/faq">FAQ</a><a className="block hover:text-white" href="/auth">Create Account</a><a className="block hover:text-white" href="/auth">Login</a></div></div><div><h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">For Restaurants</h3><div className="mt-4 space-y-3 text-sm font-semibold text-white/60"><a className="block hover:text-white" href="#restaurants">Margin Controls</a><a className="block hover:text-white" href="/faq">Coupon Validation</a><a className="block hover:text-white" href="/faq">Multi-location FAQ</a></div></div></div></div></footer>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { RewardWheel } from '@/components/RewardWheel';
import { BarChart3, ChefHat, Flame, QrCode, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import type { Reward } from '@/types/reward';

export type HomeHeroContent = {
  eyebrow: string;
  headline: string;
  subheadline: string;
  badge_1: string;
  badge_2: string;
  badge_3: string;
  primary_cta_label: string;
  spin_button_label: string;
};

const landingRewards: Reward[] = [
  { id: 'pasta', label: '15% Pasta', description: '15% off Pasta', weight: 1, terms: 'Demo only', active: true },
  { id: 'app', label: 'Free App', description: 'Free Appetizer', weight: 1, terms: 'Demo only', active: true },
  { id: 'drink', label: 'Free Drink', description: 'Free Drink', weight: 1, terms: 'Demo only', active: true },
  { id: 'dessert', label: 'BOGO Dessert', description: 'BOGO Dessert', weight: 1, terms: 'Demo only', active: true },
  { id: 'twenty', label: '20% Off', description: '20% off your next meal', weight: 1, terms: 'Demo only', active: true },
  { id: 'chef', label: 'Lucky Bite', description: 'Chef Pick Reward', weight: 1, terms: 'Demo only', active: true },
];

const steps = [
  { icon: ChefHat, title: 'Build your menu', body: 'Add dishes, drinks, combos, and chef specials in minutes.' },
  { icon: Sparkles, title: 'Choose a game', body: 'Launch a Spin Wheel, Mystery Box, or future game format from one platform.' },
  { icon: QrCode, title: 'Publish reusable QR codes', body: 'Place one QR on tables, receipts, posters, or takeout bags and update campaigns without reprinting.' },
  { icon: Trophy, title: 'Customers play and return', body: 'Diners win rewards and comeback coupons that drive the next visit.', learnMore: true },
];

const benefits = [
  { icon: Flame, title: 'Drive repeat visits', body: 'Post-payment games can issue return coupons like 20% off next meal, valid for 7 days.' },
  { icon: BarChart3, title: 'Promote specific items', body: 'Tie prizes to real menu items, limited-time offers, and slow-moving dishes.' },
  { icon: ShieldCheck, title: 'Control margins', body: 'Set probability weights, expiry windows, max plays, and daily limits.' },
];

const gameCards = [
  { title: 'Spin Wheel', icon: '🎯', status: 'Live', body: 'A branded prize wheel for discounts, free items, daily promos, and high-energy table scans.' },
  { title: 'Mystery Box Reveal', icon: '🎁', status: 'Live', body: 'Guests pick one of three boxes and reveal a surprise coupon with stars and confetti.' },
  { title: 'Scratch Card', icon: '🎟️', status: 'Coming Soon', body: 'A digital scratch-and-win card for quick redemption moments.' },
  { title: 'Slot Machine', icon: '🎰', status: 'Coming Soon', body: 'A playful jackpot-style game for bigger campaign launches.' },
  { title: 'Pick a Door', icon: '🚪', status: 'Coming Soon', body: 'Guests choose a door to reveal their prize.' },
  { title: 'Fortune Cookie', icon: '🥠', status: 'Coming Soon', body: 'A restaurant-friendly reveal for quotes, rewards, and comeback offers.' },
];

type ShowcaseGame = 'wheel' | 'mystery';
type MysteryPhase = 'idle' | 'opening' | 'revealed';

function MysteryBoxShowcase({ phase, chosenBox }: { phase: MysteryPhase; chosenBox: number | null }) {
  return (
    <div className="flex h-full min-h-[360px] flex-col justify-center rounded-[2rem] bg-gradient-to-br from-orange-50 to-amber-100 p-5 text-center shadow-inner ring-1 ring-orange-100 sm:min-h-[410px]">
      <style jsx>{`
        @keyframes boxFloat { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-8px) scale(1.04); } }
        @keyframes boxTremble { 0%,100% { transform: translate(-50%, -50%) rotate(0deg) scale(1.18); } 20% { transform: translate(-50%, -50%) rotate(-7deg) scale(1.28); } 40% { transform: translate(-50%, -50%) rotate(7deg) scale(1.34); } 60% { transform: translate(-50%, -50%) rotate(-5deg) scale(1.3); } 80% { transform: translate(-50%, -50%) rotate(5deg) scale(1.24); } }
        @keyframes prizePop { 0% { transform: translateY(18px) scale(.7); opacity: 0; } 60% { transform: translateY(-8px) scale(1.05); opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
      `}</style>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FF6B00]">Mystery Box Reveal</p>
      <h3 className="mt-2 text-2xl font-black">{phase === 'idle' ? 'Choose a box' : phase === 'opening' ? 'Opening the box...' : 'Prize revealed!'}</h3>
      <div className={`relative mt-5 ${phase === 'idle' ? 'grid min-h-[8rem] grid-cols-3 gap-3' : 'min-h-[15rem]'}`}>
        {[0, 1, 2].map((box) => {
          const isChosen = chosenBox === box;
          const hidden = phase !== 'idle' && !isChosen;
          return (
            <div
              key={box}
              className={`relative flex h-28 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] shadow-xl transition duration-300 ${hidden ? 'scale-75 opacity-0' : ''}`}
              style={phase === 'idle' ? { animation: `boxFloat 2.4s ease-in-out infinite ${box * 0.15}s` } : isChosen ? { position: 'absolute', left: '50%', top: '45%', width: '8.5rem', height: '8.5rem', zIndex: 20, animation: phase === 'opening' ? 'boxTremble 1.05s ease-in-out infinite' : undefined, transform: 'translate(-50%, -50%) scale(1.16)' } : undefined}
            >
              <span className="absolute -top-2 text-xl">✨</span>
              <span className="text-5xl">{phase === 'revealed' && isChosen ? '🎉' : '🎁'}</span>
              <span className="absolute bottom-3 text-xs font-black uppercase tracking-wide text-white">{phase === 'revealed' && isChosen ? 'Opened' : `Box ${box + 1}`}</span>
            </div>
          );
        })}
        {phase === 'revealed' && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-end justify-center px-2 pb-2">
            <div className="w-full rounded-2xl bg-white p-4 shadow-lg" style={{ animation: 'prizePop .7s ease-out forwards' }}>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#FF6B00]">You won</p>
              <p className="mt-1 text-2xl font-black text-green-700">20% off your next meal</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LandingPageClient({ hero }: { hero: HomeHeroContent }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [activeGame, setActiveGame] = useState<ShowcaseGame>('wheel');
  const [userSelectedGame, setUserSelectedGame] = useState(false);
  const [mysteryPhase, setMysteryPhase] = useState<MysteryPhase>('idle');
  const [chosenBox, setChosenBox] = useState<number | null>(null);

  useEffect(() => {
    if (userSelectedGame || spinning || mysteryPhase !== 'idle') return;
    const timer = window.setInterval(() => setActiveGame((game) => game === 'wheel' ? 'mystery' : 'wheel'), 5200);
    return () => window.clearInterval(timer);
  }, [spinning, mysteryPhase, userSelectedGame]);

  function selectGame(game: ShowcaseGame) {
    setActiveGame(game);
    setUserSelectedGame(true);
    setResult(null);
    setMysteryPhase('idle');
    setChosenBox(null);
  }

  function playMysteryDemo() {
    if (mysteryPhase !== 'idle') return;
    setResult(null);
    setChosenBox(1);
    setMysteryPhase('opening');
    setTimeout(() => {
      confetti({ particleCount: 220, spread: 120, origin: { y: 0.62 }, shapes: ['square', 'circle', 'star'] });
      setMysteryPhase('revealed');
      setResult('20% off your next meal');
    }, 1050);
    setTimeout(() => {
      setMysteryPhase('idle');
      setChosenBox(null);
    }, 5600);
  }

  function playDemo() {
    if (activeGame === 'mystery') {
      playMysteryDemo();
      return;
    }

    if (spinning) return;
    const index = Math.floor(Math.random() * landingRewards.length);
    const segmentAngle = 360 / landingRewards.length;
    const currentNormalized = rotation % 360;
    const targetAngle = -(index * segmentAngle);
    const finalRotation = rotation + 5 * 360 + (targetAngle - currentNormalized);
    setSpinning(true);
    setRotation(finalRotation);
    setResult(null);
    setTimeout(() => {
      setResult(landingRewards[index].description);
      setSpinning(false);
      confetti({ particleCount: 160, spread: 95, origin: { y: 0.62 } });
    }, 2900);
  }

  const badges = [hero.badge_1, hero.badge_2, hero.badge_3].filter(Boolean);
  const demoButtonLabel = activeGame === 'mystery' ? 'Choose a Box' : hero.spin_button_label;

  return (
    <main className="min-h-screen overflow-hidden bg-[#FFF8F0] text-[#1F1F1F]">
      <nav className="sticky top-0 z-50 border-b border-orange-100 bg-[#FFF8F0]/90 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <a href="#top" className="flex min-w-0 items-center gap-2 text-2xl font-black text-[#FF6B00]" aria-label="SpinBite home"><span className="text-3xl leading-none">🎯</span><span>SpinBite</span></a>
          <div className="hidden gap-7 text-sm font-bold md:flex"><a href="#product" className="hover:text-[#FF6B00]">Product</a><a href="#games" className="hover:text-[#FF6B00]">Games</a><a href="#restaurants" className="hover:text-[#FF6B00]">Restaurants</a><a href="#pricing" className="hover:text-[#FF6B00]">Pricing</a></div>
          <div className="flex shrink-0 items-center gap-2"><a href="/auth" className="rounded-full px-3 py-2 text-sm font-black hover:bg-white sm:px-4">Login</a><a href="/auth" className="rounded-full bg-[#FF6B00] px-4 py-2 text-sm font-black text-white shadow-lg shadow-orange-200 sm:px-5">Sign Up</a></div>
        </div>
      </nav>

      <section id="top" className="relative px-4 pb-14 pt-8 text-center sm:px-6 md:pt-16">
        <div className="absolute left-[-80px] top-24 h-52 w-52 rounded-full bg-orange-300/30 blur-3xl" /><div className="absolute right-[-80px] top-56 h-52 w-52 rounded-full bg-green-300/30 blur-3xl" />
        <motion.p initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mx-auto inline-flex rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#E63939] shadow">{hero.eyebrow}</motion.p>
        <motion.h1 initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 }} className="mx-auto mt-5 max-w-4xl text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl md:text-7xl">{hero.headline}</motion.h1>
        <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-7 text-stone-700 sm:text-lg">{hero.subheadline}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3 text-xs font-black uppercase tracking-wide">{badges.map((badge) => <span key={badge} className="rounded-full bg-white px-4 py-2 shadow-sm">{badge}</span>)}</div>

        <div id="games" className="mt-10 flex flex-col items-center">
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-full bg-white p-2 shadow-lg">
            <button onClick={() => selectGame('wheel')} className={`rounded-full px-4 py-2 text-xs font-black uppercase ${activeGame === 'wheel' ? 'bg-[#1F1F1F] text-white' : 'text-stone-500'}`}>Spin Wheel</button>
            <button onClick={() => selectGame('mystery')} className={`rounded-full px-4 py-2 text-xs font-black uppercase ${activeGame === 'mystery' ? 'bg-[#1F1F1F] text-white' : 'text-stone-500'}`}>Mystery Box</button>
          </div>
          <div className="w-full max-w-md rounded-[2rem] bg-white/80 p-4 shadow-2xl shadow-orange-200/60 ring-1 ring-orange-100">
            <div className="flex min-h-[420px] items-center justify-center sm:min-h-[470px]">
              <motion.div key={activeGame} initial={{ opacity: 0, x: activeGame === 'wheel' ? -18 : 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }} className="w-full">
                {activeGame === 'wheel' ? <RewardWheel rewards={landingRewards} rotation={rotation} spinning={spinning} /> : <MysteryBoxShowcase phase={mysteryPhase} chosenBox={chosenBox} />}
              </motion.div>
            </div>
          </div>
          <button onClick={playDemo} disabled={spinning || mysteryPhase !== 'idle'} aria-label="Play demo game" className="mt-6 w-full max-w-xs rounded-full bg-gradient-to-r from-[#00C853] to-[#00A846] px-8 py-4 text-lg font-black text-white shadow-xl shadow-green-200 transition active:scale-95 disabled:bg-stone-400">{spinning ? 'Spinning...' : mysteryPhase === 'opening' ? 'Opening...' : demoButtonLabel}</button>
          {result && activeGame === 'wheel' && <motion.p initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-5 rounded-2xl bg-white px-6 py-3 text-2xl font-black shadow-lg">🎉 You won: {result}</motion.p>}
          <a href="/auth" className="mt-5 rounded-full bg-gradient-to-r from-[#FF6B00] to-[#E63939] px-7 py-3 font-black text-white shadow-xl shadow-orange-200">{hero.primary_cta_label}</a>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-white p-6 shadow-xl ring-1 ring-orange-100 sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-[#FF6B00]">Game Library</p>
          <h2 className="mt-2 text-3xl font-black sm:text-4xl">Choose the game that fits your campaign</h2>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-stone-600">Start with Spin Wheel and Mystery Box today. More game formats are designed to fit different restaurant moments, from table-side promotions to post-payment comeback coupons.</p>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{gameCards.map((game) => <div key={game.title} className="rounded-3xl border border-orange-100 bg-[#FFF8F0] p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="text-4xl">{game.icon}</span><span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${game.status === 'Live' ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-500'}`}>{game.status}</span></div><h3 className="mt-4 text-2xl font-black">{game.title}</h3><p className="mt-2 text-sm font-semibold leading-6 text-stone-600">{game.body}</p></div>)}</div>
        </div>
      </section>

      <section id="product" className="px-4 py-12 sm:px-6"><div className="mx-auto max-w-6xl"><h2 className="text-center text-3xl font-black sm:text-4xl">How SpinBite Works</h2><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{steps.map((step) => <motion.div key={step.title} whileHover={{ y: -6 }} className="rounded-3xl bg-white p-6 shadow-lg ring-1 ring-orange-100"><step.icon className="h-8 w-8 text-[#FF6B00]" /><h3 className="mt-4 text-xl font-black">{step.title}</h3><p className="mt-2 text-sm leading-6 text-stone-600">{step.body}</p>{step.learnMore && <a href="/faq" className="mt-4 inline-flex rounded-full bg-orange-50 px-4 py-2 text-sm font-black text-[#FF6B00]">Learn more</a>}</motion.div>)}</div></div></section>
      <section id="restaurants" className="px-4 py-12 sm:px-6"><div className="mx-auto max-w-6xl rounded-[2rem] bg-[#1F1F1F] p-6 text-white sm:p-10"><h2 className="text-3xl font-black sm:text-4xl">Built for restaurant economics</h2><div className="mt-8 grid gap-4 md:grid-cols-3">{benefits.map((benefit) => <div key={benefit.title} className="rounded-3xl bg-white/10 p-6 ring-1 ring-white/10"><benefit.icon className="h-8 w-8 text-[#00C853]" /><h3 className="mt-4 text-xl font-black">{benefit.title}</h3><p className="mt-2 text-sm leading-6 text-white/70">{benefit.body}</p></div>)}</div></div></section>
      <section className="px-4 py-10 sm:px-6"><div className="mx-auto max-w-6xl rounded-[2rem] bg-green-50 p-6 shadow-xl ring-1 ring-green-100 sm:p-8"><p className="text-sm font-black uppercase tracking-[0.16em] text-green-700">Built for the moment after payment</p><h2 className="mt-2 text-3xl font-black text-green-950 sm:text-4xl">Turn today’s happy customer into next week’s repeat visit</h2><p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-green-900/75">After guests pay, staff invites them to scan and play. They win a return-visit coupon, such as 20% off their next meal valid for 7 days. The game creates a memorable moment and gives the restaurant a measurable reason for the guest to come back.</p></div></section>
      <section id="pricing" className="px-4 py-12 sm:px-6"><div className="mx-auto max-w-6xl text-center"><h2 className="text-3xl font-black sm:text-4xl">Simple pricing that grows with you</h2><div className="mt-8 grid gap-4 md:grid-cols-3">{[['Starter', 'Free', 'Launch your first QR game'], ['Pro', '$49/mo', 'Analytics, caps, multiple game types'], ['Enterprise', 'Custom', 'Multi-location controls']].map(([plan, price, copy]) => <div key={plan} className="rounded-3xl bg-white p-6 text-left shadow-lg ring-1 ring-orange-100"><p className="text-sm font-black uppercase text-[#FF6B00]">{plan}</p><h3 className="mt-2 text-3xl font-black">{price}</h3><p className="mt-3 text-sm text-stone-600">{copy}</p></div>)}</div></div></section>
      <section className="px-4 py-16 text-center sm:px-6"><div className="mx-auto max-w-4xl rounded-[2rem] bg-gradient-to-r from-[#FF6B00] to-[#E63939] p-8 text-white shadow-2xl shadow-orange-200 sm:p-12"><h2 className="text-4xl font-black">Ready to gamify your restaurant?</h2><p className="mx-auto mt-3 max-w-xl text-white/85">Create your first menu-powered QR game and publish a reusable code diners can play instantly.</p><a href="/auth" className="mt-7 inline-block rounded-full bg-white px-8 py-4 font-black text-[#FF6B00]">Sign Up Free</a></div></section>
      <footer className="bg-[#111111] px-4 py-12 text-white sm:px-6"><div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.2fr_2fr]"><div><a href="#top" className="flex items-center gap-2 text-3xl font-black text-white" aria-label="SpinBite home"><span className="text-4xl leading-none">🎯</span><span>SpinBite</span></a><p className="mt-4 max-w-sm text-sm font-medium leading-6 text-white/60">QR-powered restaurant games that turn menu attention into orders, coupons, and measurable redemptions.</p><p className="mt-6 text-xs font-bold text-white/40">Copyright © 2026 SpinBite. All rights reserved.</p></div><div className="grid grid-cols-2 gap-8 sm:grid-cols-3"><div><h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">Navigation</h3><div className="mt-4 space-y-3 text-sm font-semibold text-white/60"><a className="block hover:text-white" href="#top">Home</a><a className="block hover:text-white" href="#product">Product</a><a className="block hover:text-white" href="#games">Games</a><a className="block hover:text-white" href="#pricing">Pricing</a></div></div><div><h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">Resources</h3><div className="mt-4 space-y-3 text-sm font-semibold text-white/60"><a className="block hover:text-white" href="/faq">FAQ</a><a className="block hover:text-white" href="/auth">Create Account</a><a className="block hover:text-white" href="/auth">Login</a></div></div><div><h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">For Restaurants</h3><div className="mt-4 space-y-3 text-sm font-semibold text-white/60"><a className="block hover:text-white" href="#restaurants">Margin Controls</a><a className="block hover:text-white" href="/faq">Coupon Validation</a><a className="block hover:text-white" href="/faq">Multi-location FAQ</a></div></div></div></div></footer>
    </main>
  );
}

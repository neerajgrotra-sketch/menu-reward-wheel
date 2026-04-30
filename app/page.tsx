'use client';

import { useState } from 'react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { RewardWheel } from '@/components/RewardWheel';
import { BarChart3, ChefHat, Flame, QrCode, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import type { Reward } from '@/types/reward';

const landingRewards: Reward[] = [
  { id: 'pasta', label: '15% Pasta', description: '15% off Pasta', weight: 1, terms: 'Demo only', active: true },
  { id: 'app', label: 'Free App', description: 'Free Appetizer', weight: 1, terms: 'Demo only', active: true },
  { id: 'drink', label: 'Free Drink', description: 'Free Drink', weight: 1, terms: 'Demo only', active: true },
  { id: 'dessert', label: 'BOGO Dessert', description: 'BOGO Dessert', weight: 1, terms: 'Demo only', active: true },
  { id: 'twenty', label: '20% Off', description: '20% off your order', weight: 1, terms: 'Demo only', active: true },
  { id: 'chef', label: 'Lucky Bite', description: 'Lucky Bite Chef Pick', weight: 1, terms: 'Demo only', active: true },
];

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

export default function LandingPage() {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function spin() {
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

  return (
    <main className="min-h-screen overflow-hidden bg-[#FFF8F0] text-[#1F1F1F]">
      <nav className="sticky top-0 z-50 border-b border-orange-100 bg-[#FFF8F0]/90 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <a href="#top" className="flex min-w-0 items-center gap-2 text-2xl font-black text-[#FF6B00]" aria-label="SpinBite home">
            <span className="text-3xl leading-none">🎯</span>
            <span>SpinBite</span>
          </a>
          <div className="hidden gap-7 text-sm font-bold md:flex">
            <a href="#product" className="hover:text-[#FF6B00]">Product</a>
            <a href="#games" className="hover:text-[#FF6B00]">Games</a>
            <a href="#restaurants" className="hover:text-[#FF6B00]">Restaurants</a>
            <a href="#pricing" className="hover:text-[#FF6B00]">Pricing</a>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href="/auth" className="rounded-full px-3 py-2 text-sm font-black hover:bg-white sm:px-4">Login</a>
            <a href="/auth" className="rounded-full bg-[#FF6B00] px-4 py-2 text-sm font-black text-white shadow-lg shadow-orange-200 sm:px-5">Sign Up</a>
          </div>
        </div>
      </nav>

      <section id="top" className="relative px-4 pb-14 pt-8 text-center sm:px-6 md:pt-16">
        <div className="absolute left-[-80px] top-24 h-52 w-52 rounded-full bg-orange-300/30 blur-3xl" />
        <div className="absolute right-[-80px] top-56 h-52 w-52 rounded-full bg-green-300/30 blur-3xl" />

        <motion.p initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mx-auto inline-flex rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#E63939] shadow">
          QR games for restaurants
        </motion.p>
        <motion.h1 initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 }} className="mx-auto mt-5 max-w-4xl text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl md:text-7xl">
          Turn Every Meal Into a Game
        </motion.h1>
        <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-7 text-stone-700 sm:text-lg">
          Restaurants create spin wheels tied to real menu items. Diners scan a QR code, spin, win, and redeem instantly. Fun that actually drives sales.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3 text-xs font-black uppercase tracking-wide">
          {['No app download', 'Instant redemption', 'Margin-safe controls'].map((badge) => (
            <span key={badge} className="rounded-full bg-white px-4 py-2 shadow-sm">{badge}</span>
          ))}
        </div>

        <div id="games" className="mt-10 flex flex-col items-center">
          <div className="rounded-[2rem] bg-white/80 p-4 shadow-2xl shadow-orange-200/60 ring-1 ring-orange-100">
            <RewardWheel rewards={landingRewards} rotation={rotation} spinning={spinning} />
          </div>
          <button onClick={spin} disabled={spinning} aria-label="Spin the demo wheel" className="mt-6 w-full max-w-xs rounded-full bg-gradient-to-r from-[#00C853] to-[#00A846] px-8 py-4 text-lg font-black text-white shadow-xl shadow-green-200 transition active:scale-95 disabled:bg-stone-400">
            {spinning ? 'Spinning...' : 'Spin the Wheel'}
          </button>
          {result && (
            <motion.p initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-5 rounded-2xl bg-white px-6 py-3 text-2xl font-black shadow-lg">
              🎉 You won: {result}
            </motion.p>
          )}
          <a href="/auth" className="mt-5 rounded-full bg-gradient-to-r from-[#FF6B00] to-[#E63939] px-7 py-3 font-black text-white shadow-xl shadow-orange-200">
            Get Started Free
          </a>
        </div>
      </section>

      <section id="product" className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-black sm:text-4xl">How SpinBite Works</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <motion.div key={step.title} whileHover={{ y: -6 }} className="rounded-3xl bg-white p-6 shadow-lg ring-1 ring-orange-100">
                <step.icon className="h-8 w-8 text-[#FF6B00]" />
                <h3 className="mt-4 text-xl font-black">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">{step.body}</p>
                {step.learnMore && (
                  <a href="/faq" className="mt-4 inline-flex rounded-full bg-orange-50 px-4 py-2 text-sm font-black text-[#FF6B00]">
                    Learn more
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="restaurants" className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-[#1F1F1F] p-6 text-white sm:p-10">
          <h2 className="text-3xl font-black sm:text-4xl">Built for restaurant economics</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {benefits.map((benefit) => (
              <div key={benefit.title} className="rounded-3xl bg-white/10 p-6 ring-1 ring-white/10">
                <benefit.icon className="h-8 w-8 text-[#00C853]" />
                <h3 className="mt-4 text-xl font-black">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/70">{benefit.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="text-3xl font-black sm:text-4xl">Simple pricing that grows with you</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ['Starter', 'Free', 'Launch one reward wheel'],
              ['Pro', '$49/mo', 'Analytics, caps, QR campaigns'],
              ['Enterprise', 'Custom', 'Multi-location controls'],
            ].map(([plan, price, copy]) => (
              <div key={plan} className="rounded-3xl bg-white p-6 text-left shadow-lg ring-1 ring-orange-100">
                <p className="text-sm font-black uppercase text-[#FF6B00]">{plan}</p>
                <h3 className="mt-2 text-3xl font-black">{price}</h3>
                <p className="mt-3 text-sm text-stone-600">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 text-center sm:px-6">
        <div className="mx-auto max-w-4xl rounded-[2rem] bg-gradient-to-r from-[#FF6B00] to-[#E63939] p-8 text-white shadow-2xl shadow-orange-200 sm:p-12">
          <h2 className="text-4xl font-black">Ready to gamify your restaurant?</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">Create your first menu-powered reward wheel and publish a QR code diners can play instantly.</p>
          <a href="/auth" className="mt-7 inline-block rounded-full bg-white px-8 py-4 font-black text-[#FF6B00]">Sign Up Free</a>
        </div>
      </section>

      <footer className="bg-[#111111] px-4 py-12 text-white sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.2fr_2fr]">
          <div>
            <a href="#top" className="flex items-center gap-2 text-3xl font-black text-white" aria-label="SpinBite home">
              <span className="text-4xl leading-none">🎯</span>
              <span>SpinBite</span>
            </a>
            <p className="mt-4 max-w-sm text-sm font-medium leading-6 text-white/60">
              QR-powered restaurant games that turn menu attention into orders, coupons, and measurable redemptions.
            </p>
            <p className="mt-6 text-xs font-bold text-white/40">Copyright © 2026 SpinBite. All rights reserved.</p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">Navigation</h3>
              <div className="mt-4 space-y-3 text-sm font-semibold text-white/60">
                <a className="block hover:text-white" href="#top">Home</a>
                <a className="block hover:text-white" href="#product">Product</a>
                <a className="block hover:text-white" href="#games">Games</a>
                <a className="block hover:text-white" href="#pricing">Pricing</a>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">Resources</h3>
              <div className="mt-4 space-y-3 text-sm font-semibold text-white/60">
                <a className="block hover:text-white" href="/faq">FAQ</a>
                <a className="block hover:text-white" href="/auth">Create Account</a>
                <a className="block hover:text-white" href="/auth">Login</a>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">For Restaurants</h3>
              <div className="mt-4 space-y-3 text-sm font-semibold text-white/60">
                <a className="block hover:text-white" href="#restaurants">Margin Controls</a>
                <a className="block hover:text-white" href="/faq">Coupon Validation</a>
                <a className="block hover:text-white" href="/faq">Multi-location FAQ</a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

'use client';

import { useState } from 'react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { RewardWheel } from '@/components/RewardWheel';
import { Star, Zap, BarChart3, QrCode } from 'lucide-react';
import type { Reward } from '@/types/reward';

const landingRewards: Reward[] = [
  { id: 'pasta', label: '10% Pasta', description: '10% off Pasta', weight: 1, terms: 'Demo only', active: true },
  { id: 'app', label: 'Free App', description: 'Free Appetizer', weight: 1, terms: 'Demo only', active: true },
  { id: 'drink', label: 'Free Drink', description: 'Free Drink', weight: 1, terms: 'Demo only', active: true },
  { id: 'dessert', label: 'Dessert', description: 'Free Dessert', weight: 1, terms: 'Demo only', active: true },
  { id: 'twenty', label: '20% Off', description: '20% off your order', weight: 1, terms: 'Demo only', active: true },
  { id: 'chef', label: 'Chef Pick', description: 'Chef Pick', weight: 1, terms: 'Demo only', active: true },
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
      confetti({ particleCount: 140, spread: 90 });
    }, 2900);
  }

  return (
    <main className="min-h-screen bg-[#FFF8F0] text-[#1F1F1F]">
      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 flex items-center justify-between bg-[#FFF8F0]/80 backdrop-blur px-6 py-4">
        <h1 className="text-2xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
        <div className="hidden md:flex gap-6 font-semibold">
          <a href="#product">Product</a>
          <a href="#games">Games</a>
          <a href="#restaurants">For Restaurants</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div className="flex gap-3">
          <a href="/signup" className="rounded-xl bg-[#FF6B00] px-4 py-2 text-white font-bold">For Restaurants</a>
          <button onClick={spin} className="rounded-xl bg-[#00C853] px-4 py-2 text-white font-bold">Play Demo</button>
        </div>
      </nav>

      {/* HERO */}
      <section className="text-center px-6 py-16">
        <h2 className="text-5xl font-black">Turn Every Meal Into a Game</h2>
        <p className="mt-4 max-w-xl mx-auto text-lg">
          Restaurant owners create custom spin wheels and promotions. Customers scan QR codes and spin to win real rewards.
        </p>

        <div className="mt-10 flex flex-col items-center">
          <RewardWheel rewards={landingRewards} rotation={rotation} spinning={spinning} />
          {result && <p className="mt-6 text-2xl font-black">You won: {result}</p>}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="product" className="px-6 py-16 grid md:grid-cols-4 gap-6">
        {[{icon:QrCode, text:'Upload Menu'}, {icon:Zap, text:'Create Games'}, {icon:Star, text:'Generate QR'}, {icon:BarChart3, text:'Customers Play'}].map((item,i)=>(
          <motion.div key={i} whileHover={{scale:1.05}} className="bg-white p-6 rounded-2xl shadow text-center">
            <item.icon className="mx-auto mb-3" />
            <p className="font-bold">{item.text}</p>
          </motion.div>
        ))}
      </section>

      {/* BENEFITS */}
      <section id="restaurants" className="px-6 py-16 text-center">
        <h3 className="text-3xl font-black">Why Restaurants Love SpinBite</h3>
        <div className="mt-8 grid md:grid-cols-3 gap-6">
          {['Increase Sales','Promote Items','Drive Repeat Visits'].map((b,i)=>(
            <div key={i} className="bg-white p-6 rounded-2xl shadow font-bold">{b}</div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="px-6 py-16 text-center">
        <h3 className="text-3xl font-black">Simple Pricing</h3>
        <div className="mt-8 grid md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow">Starter - Free</div>
          <div className="bg-white p-6 rounded-2xl shadow">Pro - $49/mo</div>
          <div className="bg-white p-6 rounded-2xl shadow">Enterprise</div>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center py-16">
        <h3 className="text-3xl font-black">Ready to gamify your restaurant?</h3>
        <a href="/signup" className="mt-6 inline-block bg-[#FF6B00] px-8 py-4 rounded-xl text-white font-bold">Get Started</a>
      </section>
    </main>
  );
}

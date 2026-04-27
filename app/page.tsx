'use client';

import { useState } from 'react';
import confetti from 'canvas-confetti';
import { RewardWheel } from '@/components/RewardWheel';
import type { Reward } from '@/types/reward';

const landingRewards: Reward[] = [
  { id: 'pasta', label: '10% Pasta', description: '10% off Pasta', weight: 1, terms: 'Demo only', active: true },
  { id: 'app', label: 'Free App', description: 'Free Appetizer', weight: 1, terms: 'Demo only', active: true },
  { id: 'drink', label: 'Free Drink', description: 'Free Drink', weight: 1, terms: 'Demo only', active: true },
  { id: 'dessert', label: 'Dessert', description: 'Free Dessert', weight: 1, terms: 'Demo only', active: true },
  { id: 'twenty', label: '20% Off', description: '20% off your order', weight: 1, terms: 'Demo only', active: true },
  { id: 'chef', label: 'Chef Pick', description: 'Chef Pick', weight: 1, terms: 'Demo only', active: true },
  { id: 'lunch', label: '$3 Lunch', description: '$3 off lunch', weight: 1, terms: 'Demo only', active: true },
  { id: 'bogo', label: 'BOGO', description: 'Buy one get one deal', weight: 1, terms: 'Demo only', active: true },
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

    setResult(null);
    setSpinning(true);
    setRotation(finalRotation);

    setTimeout(() => {
      setResult(landingRewards[index].description);
      setSpinning(false);
      confetti({ particleCount: 140, spread: 85, origin: { y: 0.65 } });
    }, 2900);
  }

  return (
    <main className="min-h-screen bg-[#FFF8F0] text-[#1F1F1F]">
      <nav className="flex items-center justify-between px-6 py-4">
        <h1 className="text-2xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
        <div className="flex gap-4">
          <a href="/signup" className="rounded-xl bg-[#FF6B00] px-4 py-2 font-bold text-white">Signup</a>
          <a href="/signup" className="rounded-xl bg-[#00C853] px-4 py-2 font-bold text-white">Login</a>
        </div>
      </nav>

      <section className="px-6 py-16 text-center">
        <h2 className="text-4xl font-black md:text-6xl">Gamify Your Menu. Boost Sales.</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg">Customers scan a QR, spin to win rewards, and engage with your menu like never before.</p>

        <div className="mt-8 flex justify-center gap-4">
          <a href="/signup" className="rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E63939] px-6 py-3 font-bold text-white">Get Started</a>
          <button onClick={spin} className="rounded-xl bg-[#00C853] px-6 py-3 font-bold text-white">Try Demo</button>
        </div>
      </section>

      <section className="flex flex-col items-center pb-12">
        <RewardWheel rewards={landingRewards} rotation={rotation} spinning={spinning} />
        {result && <p className="mt-6 text-2xl font-black">You won: {result}</p>}
      </section>

      <section className="px-6 py-16 text-center">
        <h3 className="text-3xl font-black">Ready to game-ify your restaurant?</h3>
        <a href="/signup" className="mt-6 inline-block rounded-xl bg-[#FF6B00] px-8 py-4 font-bold text-white">Create Your Wheel</a>
      </section>
    </main>
  );
}

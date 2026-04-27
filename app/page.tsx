'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import confetti from 'canvas-confetti';

export default function LandingPage() {
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  const rewards = ['10% OFF', 'FREE APP', 'FREE DRINK', 'TRY AGAIN', '20% OFF', 'FREE DESSERT'];

  function spin() {
    const index = Math.floor(Math.random() * rewards.length);
    const angle = 360 * 5 + index * (360 / rewards.length);

    setRotation(rotation + angle);

    setTimeout(() => {
      setResult(rewards[index]);
      confetti({ particleCount: 100, spread: 70 });
    }, 2000);
  }

  return (
    <main className="min-h-screen bg-[#FFF8F0] text-[#1F1F1F]">
      <nav className="flex items-center justify-between px-6 py-4">
        <h1 className="text-2xl font-black text-[#FF6B00]">🎯 SpinBite</h1>
        <div className="flex gap-4">
          <a href="/signup" className="rounded-xl bg-[#FF6B00] px-4 py-2 text-white font-bold">Signup</a>
          <a href="/signup" className="rounded-xl bg-[#00C853] px-4 py-2 text-white font-bold">Login</a>
        </div>
      </nav>

      <section className="text-center px-6 py-16">
        <h2 className="text-4xl md:text-6xl font-black">Gamify Your Menu. Boost Sales.</h2>
        <p className="mt-4 max-w-xl mx-auto text-lg">Customers scan a QR, spin to win rewards, and engage with your menu like never before.</p>

        <div className="mt-8 flex justify-center gap-4">
          <a href="/signup" className="bg-gradient-to-r from-[#FF6B00] to-[#E63939] px-6 py-3 rounded-xl text-white font-bold">Get Started</a>
          <button onClick={spin} className="bg-[#00C853] px-6 py-3 rounded-xl text-white font-bold">Try Demo</button>
        </div>
      </section>

      <section className="flex flex-col items-center py-12">
        <motion.div
          animate={{ rotate: rotation }}
          transition={{ duration: 2, ease: 'easeOut' }}
          className="w-64 h-64 rounded-full border-8 border-white shadow-xl bg-gradient-to-br from-orange-300 to-orange-500 flex items-center justify-center text-white font-bold"
        >
          SPIN
        </motion.div>

        {result && <p className="mt-6 text-2xl font-black">You won: {result}</p>}
      </section>

      <section className="text-center py-16">
        <h3 className="text-3xl font-black">Ready to game-ify your restaurant?</h3>
        <a href="/signup" className="mt-6 inline-block bg-[#FF6B00] px-8 py-4 rounded-xl text-white font-bold">Create Your Wheel</a>
      </section>
    </main>
  );
}

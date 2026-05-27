'use client';

import { useState } from 'react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { RewardWheel } from '@/components/RewardWheel';
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

type HeroGame = 'spin' | 'mystery';
type MysteryPhase = 'idle' | 'opening' | 'revealed';

const landingRewards: Reward[] = [
  { id: 'pasta', label: '15% Pasta', description: '15% off Pasta', weight: 1, terms: 'Demo only', active: true },
  { id: 'app', label: 'Free App', description: 'Free Appetizer', weight: 1, terms: 'Demo only', active: true },
  { id: 'drink', label: 'Free Drink', description: 'Free Drink', weight: 1, terms: 'Demo only', active: true },
  { id: 'dessert', label: 'BOGO Dessert', description: 'BOGO Dessert', weight: 1, terms: 'Demo only', active: true },
  { id: 'twenty', label: '20% Off', description: '20% off your order', weight: 1, terms: 'Demo only', active: true },
  { id: 'chef', label: 'Lucky Bite', description: 'Lucky Bite Chef Pick', weight: 1, terms: 'Demo only', active: true },
];

function MysteryBoxHero({ phase, chosenBox, onChoose }: { phase: MysteryPhase; chosenBox: number | null; onChoose: (box: number) => void }) {
  return (
    <div className="w-full rounded-[2rem] bg-gradient-to-br from-orange-50 to-amber-100 p-5 text-center shadow-inner ring-1 ring-orange-100">
      <style jsx>{`
        @keyframes boxFloat { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-8px) scale(1.04); } }
        @keyframes boxTremble { 0%,100% { transform: translate(-50%, -50%) rotate(0deg) scale(1.18); } 20% { transform: translate(-50%, -50%) rotate(-7deg) scale(1.28); } 40% { transform: translate(-50%, -50%) rotate(7deg) scale(1.34); } 60% { transform: translate(-50%, -50%) rotate(-5deg) scale(1.3); } 80% { transform: translate(-50%, -50%) rotate(5deg) scale(1.24); } }
        @keyframes prizePop { 0% { transform: translateY(18px) scale(.7); opacity: 0; } 60% { transform: translateY(-8px) scale(1.05); opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
      `}</style>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FF6B00]">Mystery Box Reveal</p>
      <h3 className="mt-2 text-3xl font-black">{phase === 'idle' ? 'Choose a box' : phase === 'opening' ? 'Opening the box...' : 'Prize revealed!'}</h3>
      <div className={`relative mx-auto mt-6 max-w-xl ${phase === 'idle' ? 'grid min-h-[8rem] grid-cols-3 gap-3' : 'min-h-[16rem]'}`}>
        {[0, 1, 2].map((box) => {
          const isChosen = chosenBox === box;
          const hidden = phase !== 'idle' && !isChosen;
          return (
            <button
              key={box}
              type="button"
              onClick={() => onChoose(box)}
              disabled={phase !== 'idle'}
              aria-label={`Choose mystery box ${box + 1}`}
              className={`relative flex h-28 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] shadow-xl transition duration-300 active:scale-95 disabled:cursor-default ${hidden ? 'scale-75 opacity-0' : ''}`}
              style={
                phase === 'idle'
                  ? { animation: `boxFloat 2.4s ease-in-out infinite ${box * 0.15}s` }
                  : isChosen
                    ? { position: 'absolute', left: '50%', top: '42%', width: '8.75rem', height: '8.75rem', zIndex: 20, animation: phase === 'opening' ? 'boxTremble 1.05s ease-in-out infinite' : undefined, transform: 'translate(-50%, -50%) scale(1.16)' }
                    : undefined
              }
            >
              <span className="absolute -top-2 text-xl">✨</span>
              <span className="text-5xl">{phase === 'revealed' && isChosen ? '🎉' : '🎁'}</span>
              <span className="absolute bottom-3 text-xs font-black uppercase tracking-wide text-white">{phase === 'revealed' && isChosen ? 'Opened' : `Box ${box + 1}`}</span>
            </button>
          );
        })}
        {phase === 'revealed' && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-end justify-center px-2 pb-2" style={{ animation: 'prizePop .7s ease-out forwards' }}>
            <div className="w-full max-w-md rounded-2xl bg-white p-4 text-center shadow-lg">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#FF6B00]">You won</p>
              <p className="mt-1 text-2xl font-black leading-tight text-green-700">20% off your next meal</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HeroSection({ hero }: { hero: HomeHeroContent }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [heroGame, setHeroGame] = useState<HeroGame>('spin');
  const [mysteryPhase, setMysteryPhase] = useState<MysteryPhase>('idle');
  const [chosenBox, setChosenBox] = useState<number | null>(null);

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

  function chooseBox(box: number) {
    if (mysteryPhase !== 'idle') return;
    setChosenBox(box);
    setMysteryPhase('opening');
    setResult(null);
    window.setTimeout(() => {
      confetti({ particleCount: 220, spread: 120, origin: { y: 0.62 }, shapes: ['square', 'circle', 'star'] });
      setMysteryPhase('revealed');
    }, 1050);
    window.setTimeout(() => {
      setMysteryPhase('idle');
      setChosenBox(null);
    }, 5600);
  }

  function selectHeroGame(game: HeroGame) {
    setHeroGame(game);
    setResult(null);
    setMysteryPhase('idle');
    setChosenBox(null);
  }

  const badges = [hero.badge_1, hero.badge_2, hero.badge_3].filter(Boolean);

  return (
    <section id="top" className="relative px-4 pb-14 pt-8 text-center sm:px-6 md:pt-16">
      <div className="absolute left-[-80px] top-24 h-52 w-52 rounded-full bg-orange-300/30 blur-3xl" />
      <div className="absolute right-[-80px] top-56 h-52 w-52 rounded-full bg-green-300/30 blur-3xl" />
      <motion.p initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mx-auto inline-flex rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#E63939] shadow">{hero.eyebrow}</motion.p>
      <motion.h1 initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 }} className="mx-auto mt-5 max-w-4xl text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl md:text-7xl">{hero.headline}</motion.h1>
      <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-7 text-stone-700 sm:text-lg">{hero.subheadline}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3 text-xs font-black uppercase tracking-wide">{badges.map((badge) => <span key={badge} className="rounded-full bg-white px-4 py-2 shadow-sm">{badge}</span>)}</div>

      <div id="games" className="mt-10 flex flex-col items-center">
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-full bg-white p-2 shadow-lg">
          <button type="button" onClick={() => selectHeroGame('spin')} className={`rounded-full px-5 py-3 text-xs font-black uppercase tracking-wide ${heroGame === 'spin' ? 'bg-[#1F1F1F] text-white' : 'text-stone-500'}`}>Spin Wheel</button>
          <button type="button" onClick={() => selectHeroGame('mystery')} className={`rounded-full px-5 py-3 text-xs font-black uppercase tracking-wide ${heroGame === 'mystery' ? 'bg-[#1F1F1F] text-white' : 'text-stone-500'}`}>Mystery Box</button>
        </div>

        <div className="w-full max-w-md rounded-[2rem] bg-white/80 p-4 shadow-2xl shadow-orange-200/60 ring-1 ring-orange-100">
          {heroGame === 'spin' ? <RewardWheel rewards={landingRewards} rotation={rotation} spinning={spinning} /> : <MysteryBoxHero phase={mysteryPhase} chosenBox={chosenBox} onChoose={chooseBox} />}
        </div>

        <button
          onClick={heroGame === 'spin' ? spin : () => chooseBox(1)}
          disabled={spinning || mysteryPhase !== 'idle'}
          aria-label={heroGame === 'spin' ? 'Spin the demo wheel' : 'Choose a mystery box'}
          className="mt-6 w-full max-w-xs rounded-full bg-gradient-to-r from-[#00C853] to-[#00A846] px-8 py-4 text-lg font-black text-white shadow-xl shadow-green-200 transition active:scale-95 disabled:bg-stone-400"
        >
          {heroGame === 'spin' ? (spinning ? 'Spinning...' : hero.spin_button_label) : mysteryPhase === 'opening' ? 'Opening...' : mysteryPhase === 'revealed' ? 'Prize Revealed' : 'Choose a Box'}
        </button>
        {heroGame === 'spin' && result && <motion.p initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-5 rounded-2xl bg-white px-6 py-3 text-2xl font-black shadow-lg">🎉 You won: {result}</motion.p>}
        <a href="/auth" className="mt-5 rounded-full bg-gradient-to-r from-[#FF6B00] to-[#E63939] px-7 py-3 font-black text-white shadow-xl shadow-orange-200">{hero.primary_cta_label}</a>
      </div>
    </section>
  );
}

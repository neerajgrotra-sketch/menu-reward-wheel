'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = { promotionId: string };
type GameType = 'wheel' | 'mystery_box';

const games: { value: GameType; title: string; description: string; icon: string }[] = [
  { value: 'wheel', title: 'Spin Wheel', description: 'Customers spin a prize wheel and win a configured reward.', icon: '🎯' },
  { value: 'mystery_box', title: 'Mystery Box Reveal', description: 'Customers tap one of 3 mystery boxes to reveal a prize with stars and confetti.', icon: '🎁' },
];

function findHeroCard() {
  const headings = Array.from(document.querySelectorAll('p'));
  const locationLabel = headings.find((node) => node.textContent?.toLowerCase().includes('restaurant location'));
  return locationLabel?.closest('.rounded-3xl, .rounded-\[2rem\]') as HTMLElement | null;
}

export default function GameTypeInlineControl({ promotionId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [gameType, setGameType] = useState<GameType>('wheel');
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const result = await supabase.from('promotions').select('game_type').eq('id', promotionId).single();
      const value = result.data?.game_type === 'mystery_box' ? 'mystery_box' : 'wheel';
      setGameType(value);
    }
    load();
  }, [promotionId, supabase]);

  useEffect(() => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const anchor = findHeroCard();
      const host = document.getElementById('spinbite-builder-game-type-host');
      if (anchor && host) {
        anchor.insertAdjacentElement('afterend', host);
        setMounted(true);
        window.clearInterval(timer);
      }
      if (attempts > 30) window.clearInterval(timer);
    }, 200);
    return () => window.clearInterval(timer);
  }, []);

  async function choose(next: GameType) {
    setSaving(true);
    const result = await supabase.from('promotions').update({ game_type: next }).eq('id', promotionId);
    if (!result.error) setGameType(next);
    setSaving(false);
  }

  return (
    <div id="spinbite-builder-game-type-host" className={mounted ? 'rounded-[2rem] bg-white p-5 shadow-xl' : 'hidden'}>
      <p className="text-sm font-black uppercase text-[#FF6B00]">Game Type</p>
      <p className="mt-2 text-sm font-bold text-stone-600">Choose how customers reveal their prize. Rewards, coupons, and reporting stay the same.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {games.map((game) => {
          const selected = gameType === game.value;
          return (
            <button
              key={game.value}
              type="button"
              onClick={() => choose(game.value)}
              disabled={saving}
              className={`rounded-3xl border-2 p-4 text-left transition active:scale-[0.99] ${selected ? 'border-green-600 bg-green-50 shadow' : 'border-stone-100 bg-stone-50 hover:border-[#FF6B00]'}`}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-inner">{game.icon}</span>
                <span>
                  <span className="block text-xl font-black">{game.title}</span>
                  <span className="mt-1 block text-sm font-bold text-stone-600">{game.description}</span>
                  <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-black uppercase ${selected ? 'bg-green-600 text-white' : 'bg-white text-stone-500'}`}>{selected ? 'Selected' : 'Select'}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {saving && <p className="mt-3 text-xs font-black text-stone-500">Saving game type...</p>}
    </div>
  );
}

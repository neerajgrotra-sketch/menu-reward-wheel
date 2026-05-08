'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = { promotionId: string };
type GameType = 'wheel' | 'mystery_box';

const games: { value: GameType; title: string; description: string; icon: string }[] = [
  {
    value: 'wheel',
    title: 'Spin Wheel',
    description: 'Customers spin a prize wheel and win one configured reward.',
    icon: '🎯',
  },
  {
    value: 'mystery_box',
    title: 'Mystery Box Reveal',
    description: 'Customers tap one of three mystery boxes to reveal a reward.',
    icon: '🎁',
  },
];

export default function BuilderGameSettingsPanel({ promotionId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [gameType, setGameType] = useState<GameType>('wheel');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      const result = await supabase
        .from('promotions')
        .select('game_type')
        .eq('id', promotionId)
        .single();

      if (result.error) {
        setError(result.error.message);
        setLoading(false);
        return;
      }

      setGameType(result.data?.game_type === 'mystery_box' ? 'mystery_box' : 'wheel');
      setLoading(false);
    }

    if (promotionId) load();
  }, [promotionId, supabase]);

  async function choose(next: GameType) {
    if (saving || next === gameType) return;
    setSaving(true);
    setSaved(false);
    setError('');

    const result = await supabase
      .from('promotions')
      .update({ game_type: next })
      .eq('id', promotionId);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setGameType(next);
    setSaved(true);
    setSaving(false);
    window.setTimeout(() => setSaved(false), 1800);
  }

  const selectedGame = games.find((game) => game.value === gameType) || games[0];

  return (
    <section className="mx-auto mt-6 max-w-6xl rounded-[2rem] bg-white p-5 text-[#1F1F1F] shadow-xl ring-1 ring-orange-100">
      <div className="rounded-3xl bg-green-50 p-4 text-green-800">
        <p className="text-xs font-black uppercase tracking-[0.14em]">Selected Game</p>
        <p className="mt-1 text-2xl font-black">{selectedGame.icon} {selectedGame.title}</p>
        <p className="mt-1 text-sm font-bold">This game controls how customers reveal rewards. Rewards, coupons, redemption, and reporting remain shared.</p>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase text-[#FF6B00]">Game Type</p>
          <p className="mt-2 text-sm font-bold text-stone-600">Choose the customer game experience for this promotion.</p>
        </div>
        {loading && <p className="text-xs font-black uppercase text-stone-400">Loading...</p>}
        {saving && <p className="text-xs font-black uppercase text-stone-400">Saving...</p>}
        {saved && <p className="text-xs font-black uppercase text-green-700">Saved</p>}
      </div>

      {error && <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-black text-red-700">{error}</div>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {games.map((game) => {
          const selected = gameType === game.value;
          return (
            <button
              key={game.value}
              type="button"
              onClick={() => choose(game.value)}
              disabled={loading || saving}
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

      <p className="mt-4 rounded-2xl bg-orange-50 p-3 text-xs font-bold text-[#FF6B00]">
        Native builder control. This replaces the previous DOM-injected game type selector.
      </p>
    </section>
  );
}

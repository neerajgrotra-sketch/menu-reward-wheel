'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePromotionBuilder } from '@/lib/builder/context';
import { availableGames } from '@/lib/games/registry';
import type { BuilderGameType } from '@/lib/builder/types';
import type { GameType } from '@/lib/games/types';
import { getGameVisual } from '@/components/game-visuals/GameVisual';

type Props = { promotionId: string };

const STORAGE_KEY = 'spinbite_pending_promotion_game_type';

function normalizeGameType(value?: string | null): BuilderGameType {
  if (value === 'mystery_box') return 'mystery_box';
  if (value === 'scratch_card') return 'scratch_card';
  if (value === 'open_the_door') return 'open_the_door';
  return 'wheel';
}

function findHeroCard() {
  const headings = Array.from(document.querySelectorAll('p'));
  const locationLabel = headings.find((node) => node.textContent?.toLowerCase().includes('restaurant location'));
  return locationLabel?.closest('.rounded-3xl, .rounded-\[2rem\]') as HTMLElement | null;
}

export default function GameTypeInlineControl({ promotionId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { dispatch } = usePromotionBuilder();
  const [gameType, setGameType] = useState<BuilderGameType>('wheel');
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedGame = availableGames.find((game) => normalizeGameType(game.type) === gameType) || availableGames[0];

  function applyGameType(next: BuilderGameType) {
    setGameType(next);
    dispatch({ type: 'setGameType', gameType: next });
  }

  useEffect(() => {
    async function load() {
      const result = await supabase.from('promotions').select('game_type').eq('id', promotionId).single();
      const pending = window.localStorage.getItem(STORAGE_KEY);
      const pendingGameType = pending === 'mystery_box' || pending === 'scratch_card' || pending === 'open_the_door' || pending === 'wheel' || pending === 'spin_wheel'
        ? normalizeGameType(pending)
        : null;
      const value = normalizeGameType(result.data?.game_type);

      if (pendingGameType) {
        const updateResult = await supabase.from('promotions').update({ game_type: pendingGameType }).eq('id', promotionId);
        if (!updateResult.error) {
          applyGameType(pendingGameType);
          window.localStorage.removeItem(STORAGE_KEY);
          return;
        }
      }

      applyGameType(value);
      window.localStorage.removeItem(STORAGE_KEY);
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
      if (attempts > 40) window.clearInterval(timer);
    }, 200);
    return () => window.clearInterval(timer);
  }, []);

  async function choose(next: GameType) {
    const normalized = normalizeGameType(next);
    setSaving(true);
    const result = await supabase.from('promotions').update({ game_type: normalized }).eq('id', promotionId);
    if (!result.error) applyGameType(normalized);
    setSaving(false);
  }

  return (
    <div id="spinbite-builder-game-type-host" className={mounted ? 'rounded-[2rem] bg-white p-5 shadow-xl' : 'hidden'}>
      <div className="rounded-3xl bg-green-50 p-4 text-green-800">
        <p className="text-xs font-black uppercase tracking-[0.14em]">Selected Game</p>
        <p className="mt-1 text-2xl font-black">{selectedGame.icon} {selectedGame.name}</p>
        <p className="mt-1 text-sm font-bold">This is the game customers will see after the promotion is published.</p>
      </div>
      <p className="mt-5 text-sm font-black uppercase text-[#FF6B00]">Game Type</p>
      <p className="mt-2 text-sm font-bold text-stone-600">Choose how customers reveal their prize. Rewards, coupons, and reporting stay the same.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {availableGames.map((game) => {
          const normalizedType = normalizeGameType(game.type);
          const selected = gameType === normalizedType;
          return (
            <button
              key={game.type}
              type="button"
              onClick={() => choose(game.type)}
              disabled={saving}
              className={`rounded-3xl border-2 p-4 text-left transition active:scale-[0.99] ${selected ? 'border-green-600 bg-green-50 shadow' : 'border-stone-100 bg-stone-50 hover:border-[#FF6B00]'}`}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-inner">{getGameVisual(game.type, 48).visual}</span>
                <span>
                  <span className="block text-xl font-black">{game.createCard.title}</span>
                  <span className="mt-1 block text-sm font-bold text-stone-600">{game.createCard.description}</span>
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

'use client';

import { useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { getGameDefinition } from '@/lib/games/registry';
import { usePromotionBuilder } from '@/lib/builder/context';
import type { BuilderReward } from '@/lib/builder/types';
import type { Reward } from '@/types/reward';

function toRuntimeReward(reward: BuilderReward, index: number): Reward {
  return {
    id: reward.id || reward.temp_id || `preview-${index}`,
    label: reward.label || reward.custom_name || `Reward ${index + 1}`,
    weight: reward.weight || 30,
    daily_limit: reward.daily_limit || 10,
    reward_type: reward.reward_type || 'discount',
    reward_value: reward.reward_value,
    menu_item_id: reward.menu_item_id,
    custom_name: reward.custom_name,
  } as Reward;
}

function pickWeighted(list: Reward[]) {
  let random = Math.random() * list.reduce((sum, item) => sum + (item.weight || 0), 0);
  for (let i = 0; i < list.length; i += 1) {
    random -= list[i].weight || 0;
    if (random <= 0) return i;
  }
  return Math.max(0, list.length - 1);
}

export default function BuilderGamePreviewCard() {
  const { state, dispatch } = usePromotionBuilder();
  const [playing, setPlaying] = useState(false);

  const rewards = useMemo(
    () => state.rewards.map((reward, index) => toRuntimeReward(reward, index)),
    [state.rewards]
  );

  const game = getGameDefinition(state.gameType);
  const PlayComponent = game.PlayComponent;
  const canPlay = rewards.length > 0 && !playing;

  function testPlay() {
    if (!canPlay) return;

    const selectedIndex = pickWeighted(rewards);
    const segmentAngle = rewards.length ? 360 / rewards.length : 0;
    const targetRotation = game.getTargetRotation?.({
      currentRotation: state.preview.rotation,
      selectedIndex,
      segmentAngle,
    });

    setPlaying(true);
    dispatch({
      type: 'setPreview',
      preview: {
        spinning: true,
        result: '',
        rotation: typeof targetRotation === 'number' ? targetRotation : state.preview.rotation,
      },
    });

    window.setTimeout(() => {
      const result = rewards[selectedIndex]?.label || 'Reward';
      setPlaying(false);
      dispatch({
        type: 'setPreview',
        preview: {
          spinning: false,
          result,
        },
      });
      confetti(game.confetti);
    }, game.resultDelayMs);
  }

  return (
    <section className="rounded-[2rem] bg-white p-5 shadow-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#FF6B00]">Shared Game Preview</p>
          <h2 className="mt-1 text-2xl font-black">{game.icon} {game.name}</h2>
          <p className="mt-1 text-sm font-bold text-stone-500">{game.labels.instruction}</p>
          {state.preview.result && <p className="mt-2 text-sm font-black text-green-700">🎉 {state.preview.result}</p>}
        </div>
        <button
          type="button"
          onClick={testPlay}
          disabled={!canPlay}
          className="rounded-full bg-[#1F1F1F] px-5 py-3 text-sm font-black text-white shadow disabled:bg-stone-300"
        >
          {playing ? 'Testing...' : 'Test'}
        </button>
      </div>

      <PlayComponent
        rewards={rewards}
        canPlay={canPlay}
        playing={playing}
        playsRemaining={1}
        playsUsed={0}
        maxPlays={1}
        onPlay={testPlay}
        rotation={state.preview.rotation}
      />
    </section>
  );
}

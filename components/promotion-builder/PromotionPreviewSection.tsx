'use client';

import { GamePreviewHost } from '@/components/promotion-builder/GamePreviewHost';
import type { GameContract } from '@/lib/games/types';
import type { Reward } from '@/types/reward';

export type PromotionPreviewSectionProps = {
  game: GameContract;
  rewards?: Reward[];
  rotation?: number;
};

export function PromotionPreviewSection({
  game,
  rewards,
  rotation,
}: PromotionPreviewSectionProps) {
  return (
    <section className="mt-5">
      <GamePreviewHost
        game={game}
        rewards={rewards}
        rotation={rotation}
      />
    </section>
  );
}

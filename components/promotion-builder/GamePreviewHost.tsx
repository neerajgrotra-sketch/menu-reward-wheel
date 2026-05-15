import type { GameContract } from '@/lib/games/types';
import type { Reward } from '@/types/reward';

export type GamePreviewHostProps = {
  game: GameContract;
  rewards?: Reward[];
  rotation?: number;
  children?: React.ReactNode;
};

export function GamePreviewHost({ game, rewards, rotation, children }: GamePreviewHostProps) {
  const BuilderPreview = game.components?.BuilderPreview;

  return (
    <section className="rounded-3xl bg-white p-5 shadow-xl">
      <div className="mb-4">
        <p className="text-sm font-black uppercase text-[#FF6B00]">{game.preview.previewTitle}</p>
        <p className="mt-1 text-xs font-bold text-stone-500">{game.preview.previewDisclaimer}</p>
      </div>

      {BuilderPreview ? (
        <BuilderPreview rewards={rewards} rotation={rotation} />
      ) : (
        children
      )}
    </section>
  );
}

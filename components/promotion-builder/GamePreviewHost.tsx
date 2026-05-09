import type { GameContract } from '@/lib/games/types';

export type GamePreviewHostProps = {
  game: GameContract;
  config?: unknown;
  rewards?: unknown[];
  children?: React.ReactNode;
};

/**
 * GamePreviewHost is the Promotion Builder preview boundary.
 *
 * PR 3 introduces this shell without forcing all games to migrate at once.
 * Future PRs will render game.components.BuilderPreview here when each game
 * owns a formal builder preview component.
 */
export function GamePreviewHost({ game, children }: GamePreviewHostProps) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-xl">
      <div className="mb-4">
        <p className="text-sm font-black uppercase text-[#FF6B00]">{game.preview.previewTitle}</p>
        <p className="mt-1 text-xs font-bold text-stone-500">{game.preview.previewDisclaimer}</p>
      </div>
      {children}
    </section>
  );
}

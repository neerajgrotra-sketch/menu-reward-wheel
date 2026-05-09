import type { GameContract } from '@/lib/games/types';

export type GameConfigHostProps = {
  game: GameContract;
  children?: React.ReactNode;
};

/**
 * GameConfigHost becomes the orchestration boundary between
 * Promotion Builder and game-specific configuration.
 *
 * PR 3 intentionally keeps current game configuration UI inline.
 * Future PRs will move each game's configuration panel into:
 *
 * /lib/games/<game>/builderPanel.tsx
 */
export function GameConfigHost({ game, children }: GameConfigHostProps) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-xl">
      <div className="mb-4">
        <p className="text-sm font-black uppercase text-[#FF6B00]">Game Configuration</p>
        <p className="mt-1 text-xs font-bold text-stone-500">
          Currently configuring: {game.name}
        </p>
      </div>
      {children}
    </section>
  );
}

import type { GameContract } from '@/lib/games/types';

export type GameConfigHostProps = {
  game: GameContract;
  children?: React.ReactNode;
};

export function GameConfigHost({ game, children }: GameConfigHostProps) {
  const ConfigPanel = game.components?.ConfigPanel;

  return (
    <section className="rounded-3xl bg-white p-5 shadow-xl">
      <div className="mb-4">
        <p className="text-sm font-black uppercase text-[#FF6B00]">Game Configuration</p>
        <p className="mt-1 text-xs font-bold text-stone-500">
          Currently configuring: {game.name}
        </p>
      </div>

      {ConfigPanel ? <ConfigPanel /> : children}
    </section>
  );
}

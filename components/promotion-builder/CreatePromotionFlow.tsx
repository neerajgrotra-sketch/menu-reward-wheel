'use client';

import { GameSelectionSection } from '@/components/promotion-builder/GameSelectionSection';
import type { BuilderGameType } from '@/components/promotion-builder/GameSelectionSection';
import type { Reward } from '@/types/reward';

export type CreatePromotionFlowProps = {
  promotionName: string;
  onPromotionNameChange: (name: string) => void;
  gameType: BuilderGameType;
  onGameTypeChange: (gameType: BuilderGameType) => void;
  rewards?: Reward[];
  rotation?: number;
  saving: boolean;
  canCreate: boolean;
  onCreatePromotion: () => void;
  nameLabel: string;
  gameLabel: string;
  createButtonLabel: string;
};

/**
 * CreatePromotionFlow is intentionally minimal.
 *
 * Create mode should only create a draft promotion. Builder-only concerns such
 * as reward configuration, previews, publishing, and game test experiences
 * belong in the promotion builder route after the draft exists.
 */
export function CreatePromotionFlow({
  promotionName,
  onPromotionNameChange,
  gameType,
  onGameTypeChange,
  saving,
  canCreate,
  onCreatePromotion,
  nameLabel,
  gameLabel,
  createButtonLabel,
}: CreatePromotionFlowProps) {
  return (
    <>
      <section className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
        <p className="text-sm font-black uppercase text-[#FF6B00]">{nameLabel}</p>
        <input
          value={promotionName}
          onChange={(event) => onPromotionNameChange(event.target.value)}
          placeholder="Halloween, Lunch Rush, Weekend Spin..."
          className="mt-3 w-full rounded-2xl border border-stone-200 px-4 py-4 font-semibold outline-none focus:border-[#FF6B00]"
        />
      </section>

      <GameSelectionSection
        label={gameLabel}
        gameType={gameType}
        onChange={onGameTypeChange}
      />

      <section className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
        <p className="text-sm font-black uppercase text-[#FF6B00]">Step 4: {createButtonLabel}</p>
        <button
          onClick={onCreatePromotion}
          disabled={!canCreate}
          className="mt-3 w-full rounded-3xl bg-green-600 px-5 py-5 text-xl font-black text-white shadow-xl disabled:bg-stone-400"
        >
          {saving ? 'Creating...' : createButtonLabel}
        </button>
        <p className="mt-3 text-sm font-bold text-stone-500">
          This creates a draft. Rewards, previews, scheduling, and publishing happen inside the builder.
        </p>
      </section>
    </>
  );
}

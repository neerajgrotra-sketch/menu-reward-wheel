'use client';

import { GameConfigHost } from '@/components/promotion-builder/GameConfigHost';
import {
  GameSelectionSection,
  type BuilderGameType,
} from '@/components/promotion-builder/GameSelectionSection';
import { PromotionMetadataSection } from '@/components/promotion-builder/PromotionMetadataSection';
import { PromotionPreviewSection } from '@/components/promotion-builder/PromotionPreviewSection';
import { PromotionPublishingSection } from '@/components/promotion-builder/PromotionPublishingSection';
import { getGameContract } from '@/lib/games/registry';
import type { Reward } from '@/types/reward';

export type PromotionBuilderShellProps = {
  promotionName: string;
  onPromotionNameChange: (name: string) => void;
  gameType: BuilderGameType;
  onGameTypeChange: (gameType: BuilderGameType) => void;
  rewards?: Reward[];
  rotation?: number;
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
  metadataLabel?: string;
  gameSelectionLabel?: string;
  publishLabel?: string;
};

/**
 * Lightweight Promotion Builder orchestration shell.
 *
 * PR 13 intentionally does not change Supabase logic, coupon logic,
 * reward logic, or live runtime behavior. It creates a clean composition
 * target that app/admin/promotions/page.tsx can migrate into safely.
 */
export function PromotionBuilderShell({
  promotionName,
  onPromotionNameChange,
  gameType,
  onGameTypeChange,
  rewards,
  rotation,
  saving,
  canSave,
  onSave,
  metadataLabel = 'Step 2: Name Promotion',
  gameSelectionLabel = 'Step 3: Select Game Type',
  publishLabel = 'Create Promotion',
}: PromotionBuilderShellProps) {
  const game = getGameContract(gameType);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)]">
      <div>
        <PromotionMetadataSection
          label={metadataLabel}
          name={promotionName}
          onNameChange={onPromotionNameChange}
        />

        <GameSelectionSection
          label={gameSelectionLabel}
          gameType={gameType}
          onChange={onGameTypeChange}
        />

        <GameConfigHost game={game} />

        <PromotionPublishingSection
          title={publishLabel}
          saving={saving}
          disabled={!canSave}
          onPublish={onSave}
        />
      </div>

      <div>
        <PromotionPreviewSection
          game={game}
          rewards={rewards}
          rotation={rotation}
        />
      </div>
    </div>
  );
}

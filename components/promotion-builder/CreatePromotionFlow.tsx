'use client';

import {
  PromotionBuilderShell,
} from '@/components/promotion-builder/PromotionBuilderShell';
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
 * CreatePromotionFlow is the migration adapter between the legacy
 * app/admin/promotions/page.tsx create-mode JSX and the new
 * PromotionBuilderShell.
 *
 * It owns no Supabase logic and no coupon logic. It only receives state and
 * callbacks from the page and delegates rendering to the shell.
 */
export function CreatePromotionFlow({
  promotionName,
  onPromotionNameChange,
  gameType,
  onGameTypeChange,
  rewards,
  rotation,
  saving,
  canCreate,
  onCreatePromotion,
  nameLabel,
  gameLabel,
  createButtonLabel,
}: CreatePromotionFlowProps) {
  return (
    <PromotionBuilderShell
      promotionName={promotionName}
      onPromotionNameChange={onPromotionNameChange}
      gameType={gameType}
      onGameTypeChange={onGameTypeChange}
      rewards={rewards}
      rotation={rotation}
      saving={saving}
      canSave={canCreate}
      onSave={onCreatePromotion}
      metadataLabel={nameLabel}
      gameSelectionLabel={gameLabel}
      publishLabel={createButtonLabel}
    />
  );
}

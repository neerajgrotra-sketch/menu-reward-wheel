import type { ReactNode } from 'react';
import BuilderPreviewSlotReplacement from '@/components/admin/BuilderPreviewSlotReplacement';
import LaunchBlockedModalWatcher from '@/components/admin/LaunchBlockedModalWatcher';
import NoExpiryInlinePatch from '@/components/admin/NoExpiryInlinePatch';
import { PromotionBuilderProvider } from '@/lib/builder/context';

// GameTypeInlineControl removed: the new builder page manages all game assignments
// directly via promotion_game_assignments (is_primary=true for primary, is_primary=false for additional).
// GameTypeInlineControl only wrote to promotions.game_type (now legacy read-only) and
// sourced its game list from the static registry (which included reward_reels as selectable).
// BuilderGameTypeStateSync and BuilderRewardsStateSync also removed — new builder does not use
// the PromotionBuilderContext for its own state.

export default function PromotionBuilderLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  return (
    <PromotionBuilderProvider>
      {children}
      <BuilderPreviewSlotReplacement />
      <LaunchBlockedModalWatcher />
      <NoExpiryInlinePatch promotionId={params.id} />
    </PromotionBuilderProvider>
  );
}

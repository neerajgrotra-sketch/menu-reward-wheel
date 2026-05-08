import type { ReactNode } from 'react';
import BuilderGameTypeStateSync from '@/components/admin/BuilderGameTypeStateSync';
import BuilderMysteryBoxPreviewPatch from '@/components/admin/BuilderMysteryBoxPreviewPatch';
import GameTypeInlineControl from '@/components/admin/GameTypeInlineControl';
import LaunchBlockedModalWatcher from '@/components/admin/LaunchBlockedModalWatcher';
import NoExpiryInlinePatch from '@/components/admin/NoExpiryInlinePatch';
import { PromotionBuilderProvider } from '@/lib/builder/context';

export default function PromotionBuilderLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  return (
    <PromotionBuilderProvider>
      <BuilderGameTypeStateSync promotionId={params.id} />
      {children}
      <BuilderMysteryBoxPreviewPatch promotionId={params.id} />
      <LaunchBlockedModalWatcher />
      <GameTypeInlineControl promotionId={params.id} />
      <NoExpiryInlinePatch promotionId={params.id} />
    </PromotionBuilderProvider>
  );
}

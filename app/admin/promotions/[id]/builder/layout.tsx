import type { ReactNode } from 'react';
import BuilderMysteryBoxPreviewPatch from '@/components/admin/BuilderMysteryBoxPreviewPatch';
import GameTypeInlineControl from '@/components/admin/GameTypeInlineControl';
import LaunchBlockedModalWatcher from '@/components/admin/LaunchBlockedModalWatcher';
import NoExpiryInlinePatch from '@/components/admin/NoExpiryInlinePatch';

export default function PromotionBuilderLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  return (
    <>
      {children}
      <BuilderMysteryBoxPreviewPatch promotionId={params.id} />
      <LaunchBlockedModalWatcher />
      <GameTypeInlineControl promotionId={params.id} />
      <NoExpiryInlinePatch promotionId={params.id} />
    </>
  );
}

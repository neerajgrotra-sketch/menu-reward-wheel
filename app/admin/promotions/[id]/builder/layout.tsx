import type { ReactNode } from 'react';
import BuilderGamePreviewRuntime from '@/components/admin/BuilderGamePreviewRuntime';
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
      <BuilderGamePreviewRuntime promotionId={params.id} />
      <LaunchBlockedModalWatcher />
      <GameTypeInlineControl promotionId={params.id} />
      <NoExpiryInlinePatch promotionId={params.id} />
    </>
  );
}

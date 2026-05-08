import type { ReactNode } from 'react';
import BuilderGamePreviewRuntime from '@/components/admin/BuilderGamePreviewRuntime';
import BuilderGameSettingsPanel from '@/components/admin/BuilderGameSettingsPanel';
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
      <BuilderGameSettingsPanel promotionId={params.id} />
      <BuilderGamePreviewRuntime promotionId={params.id} />
      <LaunchBlockedModalWatcher />
      <NoExpiryInlinePatch promotionId={params.id} />
    </>
  );
}

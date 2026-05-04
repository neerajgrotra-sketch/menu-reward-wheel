import type { ReactNode } from 'react';
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
      <LaunchBlockedModalWatcher />
      <NoExpiryInlinePatch promotionId={params.id} />
    </>
  );
}

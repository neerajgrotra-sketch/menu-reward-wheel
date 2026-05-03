import type { ReactNode } from 'react';
import LaunchBlockedModalWatcher from '@/components/admin/LaunchBlockedModalWatcher';
import NoExpiryPromotionControl from '@/components/admin/NoExpiryPromotionControl';

export default function PromotionBuilderLayout({ children, params }: { children: ReactNode; params: { id: string } }) {
  return (
    <>
      {children}
      <LaunchBlockedModalWatcher />
      <NoExpiryPromotionControl promotionId={params.id} />
    </>
  );
}

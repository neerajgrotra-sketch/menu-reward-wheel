import type { ReactNode } from 'react';
import LaunchBlockedModalWatcher from '@/components/admin/LaunchBlockedModalWatcher';

export default function PromotionBuilderLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <LaunchBlockedModalWatcher />
    </>
  );
}

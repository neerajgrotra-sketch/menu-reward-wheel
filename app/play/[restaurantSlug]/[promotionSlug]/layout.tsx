import type { ReactNode } from 'react';
import PlayEndedRedirectWatcher from '@/components/PlayEndedRedirectWatcher';

export default function PromotionPlayLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <PlayEndedRedirectWatcher />
    </>
  );
}

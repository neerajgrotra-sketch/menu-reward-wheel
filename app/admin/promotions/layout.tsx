import type { ReactNode } from 'react';
import CreatePromotionGameTypePatch from '@/components/admin/CreatePromotionGameTypePatch';

export default function PromotionsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <CreatePromotionGameTypePatch />
    </>
  );
}

import LaunchBlockedModalWatcher from '@/components/admin/LaunchBlockedModalWatcher';

export default function PromotionBuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <LaunchBlockedModalWatcher />
    </>
  );
}

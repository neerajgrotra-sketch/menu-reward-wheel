import { AppShell } from '@/components/layout/AppShell';
import { superAdminNavigation } from '@/lib/navigation';
import { requireSuperAdmin } from '@/lib/super-admin';

export const dynamic = 'force-dynamic';

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  return (
    <AppShell navigation={superAdminNavigation} sectionLabel="Super Admin" homeHref="/super-admin">
      {children}
    </AppShell>
  );
}

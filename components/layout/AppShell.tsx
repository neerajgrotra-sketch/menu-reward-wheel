'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/lib/navigation';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { MobileBurgerMenu } from './MobileBurgerMenu';

export function AppShell({
  navigation,
  sectionLabel,
  homeHref,
  children,
}: {
  navigation: NavItem[];
  sectionLabel: string;
  homeHref: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Print pages (QR kits, promotion print kits) render at exact physical page
  // dimensions with no existing chrome. Wrapping them would shift/clip print output.
  if (pathname.endsWith('/print')) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <AdminSidebar navigation={navigation} sectionLabel={sectionLabel} homeHref={homeHref} />
      <AdminHeader sectionLabel={sectionLabel} onMenuClick={() => setMobileOpen(true)} />
      <MobileBurgerMenu
        navigation={navigation}
        sectionLabel={sectionLabel}
        homeHref={homeHref}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="md:ml-64">{children}</div>
    </div>
  );
}

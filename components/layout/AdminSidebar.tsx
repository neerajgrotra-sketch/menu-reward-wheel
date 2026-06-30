import Link from 'next/link';
import type { NavItem } from '@/lib/navigation';
import { UI_LAYERS } from '@/lib/ui-layers';
import { NavigationItem } from './NavigationItem';

export function AdminSidebar({
  navigation,
  sectionLabel,
  homeHref,
}: {
  navigation: NavItem[];
  sectionLabel: string;
  homeHref: string;
}) {
  return (
    <aside
      style={{ zIndex: UI_LAYERS.sidebar }}
      className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-stone-950 px-4 py-6 print:hidden md:flex"
    >
      <Link href={homeHref} className="mb-1 block px-2 text-2xl font-black text-[#FF6B00]">
        🎯 SpinBite
      </Link>
      <p className="mb-5 px-2 text-xs font-black uppercase tracking-[0.2em] text-stone-500">{sectionLabel}</p>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {navigation.map((item) => (
          <NavigationItem key={item.href} item={item} />
        ))}
      </nav>
    </aside>
  );
}

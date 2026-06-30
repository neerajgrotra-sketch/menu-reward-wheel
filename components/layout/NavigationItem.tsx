'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/lib/navigation';

const SECTION_ROOTS = new Set(['/admin', '/super-admin']);

export function NavigationItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive =
    pathname === item.href ||
    (!SECTION_ROOTS.has(item.href) && pathname.startsWith(`${item.href}/`));

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${
        isActive ? 'bg-[#FF6B00] text-white shadow-lg' : 'text-stone-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      <span className="text-lg">{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );
}

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import type { NavItem } from '@/lib/navigation';
import { UI_LAYERS } from '@/lib/ui-layers';
import { NavigationItem } from './NavigationItem';

export function MobileBurgerMenu({
  navigation,
  sectionLabel,
  homeHref,
  open,
  onClose,
}: {
  navigation: NavItem[];
  sectionLabel: string;
  homeHref: string;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div style={{ zIndex: UI_LAYERS.drawer }} className="fixed inset-0 print:hidden md:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 w-72 max-w-[80vw] overflow-y-auto bg-stone-950 px-4 py-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <Link href={homeHref} onClick={onClose} className="text-2xl font-black text-[#FF6B00]">
            🎯 SpinBite
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white"
          >
            ✕
          </button>
        </div>
        <p className="mb-5 px-2 text-xs font-black uppercase tracking-[0.2em] text-stone-500">{sectionLabel}</p>
        <nav className="flex flex-col gap-1">
          {navigation.map((item) => (
            <NavigationItem key={item.href} item={item} onNavigate={onClose} />
          ))}
        </nav>
      </div>
    </div>
  );
}

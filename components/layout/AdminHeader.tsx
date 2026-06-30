'use client';

import { UI_LAYERS } from '@/lib/ui-layers';

export function AdminHeader({ sectionLabel, onMenuClick }: { sectionLabel: string; onMenuClick: () => void }) {
  return (
    <header
      style={{ zIndex: UI_LAYERS.header }}
      className="sticky top-0 flex items-center justify-between bg-stone-950 px-4 py-3 print:hidden md:hidden"
    >
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white"
      >
        <span className="text-lg">☰</span>
      </button>
      <span className="text-xs font-black uppercase tracking-[0.2em] text-stone-400">{sectionLabel}</span>
      <span className="w-9" aria-hidden="true" />
    </header>
  );
}

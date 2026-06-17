'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

// ─── Filter definitions ───────────────────────────────────────────────────────
// Each id maps directly to a field on PublicMenuItem.
// 'available'    → item.available === true
// 'featured'     → item.is_featured === true
// 'chef_special' → item.tags.includes('chef_special')
// 'popular'      → item.tags.includes('popular')

export type FilterId = 'available' | 'featured' | 'chef_special' | 'popular';

type FilterDef = { id: FilterId; label: string; emoji: string };

const FILTER_GROUPS: Array<{ group: string; items: FilterDef[] }> = [
  {
    group: 'Availability',
    items: [
      { id: 'available', label: 'Available Now', emoji: '✓' },
    ],
  },
  {
    group: 'Highlights',
    items: [
      { id: 'featured',     label: 'Featured',    emoji: '⭐' },
      { id: 'chef_special', label: 'Chef Special', emoji: '👨‍🍳' },
      { id: 'popular',      label: 'Popular',      emoji: '🔥' },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function MenuFilterDrawer({
  open,
  accentColor,
  activeFilters,
  onToggle,
  onReset,
  onClose,
}: {
  open: boolean;
  accentColor: string;
  activeFilters: Set<string>;
  onToggle: (filterId: FilterId) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
    }
  }, [open]);

  useEffect(() => {
    if (visible) closeBtnRef.current?.focus();
  }, [visible]);

  // iOS-safe scroll lock
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const focusable = e.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-drawer-title"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 300ms ease-out' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-white overscroll-contain"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms ease-out',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-stone-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <h2 id="filter-drawer-title" className="text-lg font-black text-stone-900">
            Filter Menu
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-stone-600 active:scale-95"
            aria-label="Close filters"
            style={{ transition: 'transform 150ms' }}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Filter groups */}
        <div className="space-y-5 px-5 pb-6">
          {FILTER_GROUPS.map(({ group, items }) => (
            <div key={group}>
              <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-stone-400">
                {group}
              </h3>
              <div className="flex flex-wrap gap-2">
                {items.map((filter) => {
                  const isActive = activeFilters.has(filter.id);
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => onToggle(filter.id)}
                      aria-pressed={isActive}
                      className="rounded-full px-4 py-2.5 text-sm font-semibold active:scale-95"
                      style={{
                        transition: 'transform 150ms, background-color 150ms, color 150ms',
                        backgroundColor: isActive ? accentColor : '#f5f5f4',
                        color: isActive ? '#fff' : '#57534e',
                      }}
                    >
                      <span className="mr-1.5" aria-hidden="true">{filter.emoji}</span>
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Reset — only visible when at least one filter is active */}
        {activeFilters.size > 0 && (
          <div className="border-t border-stone-100 px-5 py-4">
            <button
              type="button"
              onClick={() => { onReset(); onClose(); }}
              className="w-full rounded-2xl border border-stone-200 py-3 text-sm font-black text-stone-600 active:scale-95"
              style={{ transition: 'transform 150ms' }}
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

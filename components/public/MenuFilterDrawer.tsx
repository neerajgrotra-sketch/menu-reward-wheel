'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

// ─── Filter group definitions ─────────────────────────────────────────────────
// These are the future filter categories. Backend/logic not wired yet.
// Source of truth for display will move to menu_tag_definitions table in a future sprint.

type FilterEntry = { id: string; label: string; emoji: string };
type FilterGroup = { label: string; filters: FilterEntry[] };

const FILTER_GROUPS: FilterGroup[] = [
  {
    label: 'Dietary',
    filters: [
      { id: 'vegetarian', label: 'Vegetarian', emoji: '🥗' },
      { id: 'vegan', label: 'Vegan', emoji: '🌱' },
      { id: 'halal', label: 'Halal', emoji: '☪️' },
      { id: 'kosher', label: 'Kosher', emoji: '✡️' },
      { id: 'gluten_free', label: 'Gluten Free', emoji: '🌾' },
    ],
  },
  {
    label: 'Offers',
    filters: [
      { id: 'discounted', label: 'Discounted', emoji: '💰' },
      { id: 'featured', label: 'Featured', emoji: '⭐' },
      { id: 'chef_special', label: 'Chef Special', emoji: '👨‍🍳' },
      { id: 'popular', label: 'Popular', emoji: '🔥' },
    ],
  },
  {
    label: 'Preferences',
    filters: [
      { id: 'spicy', label: 'Spicy', emoji: '🌶️' },
      { id: 'kids_friendly', label: 'Kids Friendly', emoji: '👶' },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function MenuFilterDrawer({
  open,
  accentColor,
  onClose,
}: {
  open: boolean;
  accentColor: string;
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

  // iOS-safe scroll lock — matches pattern used elsewhere in this app
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
        className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-white overscroll-contain"
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

        {/* Coming soon notice */}
        <div
          className="mx-5 mb-5 rounded-2xl px-4 py-3"
          style={{ backgroundColor: `${accentColor}14` }}
        >
          <p className="text-xs font-semibold" style={{ color: accentColor }}>
            Smart filtering is coming soon — we&apos;re building smarter menu discovery.
          </p>
        </div>

        {/* Filter groups (non-interactive shell) */}
        <div className="space-y-6 px-5 pb-8">
          {FILTER_GROUPS.map((group) => (
            <div key={group.label}>
              <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-stone-400">
                {group.label}
              </h3>
              <div className="flex flex-wrap gap-2">
                {group.filters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    disabled
                    className="rounded-full bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-400"
                    aria-label={`${filter.label} filter (coming soon)`}
                  >
                    <span className="mr-1.5" aria-hidden="true">{filter.emoji}</span>
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

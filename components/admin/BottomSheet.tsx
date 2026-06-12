'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type SheetTab = { id: string; label: string };

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Tab bar. Pass multiple tabs when future phases add Promotions / AI / Analytics. */
  tabs: SheetTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  children: React.ReactNode;
};

export function BottomSheet({ open, onClose, title, tabs, activeTab, onTabChange, children }: Props) {
  const [mounted, setMounted] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const dragging = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerAreaRef = useRef<HTMLDivElement>(null);
  // Whether the current touch began on the fixed drag-handle/header zone.
  const touchStartedOnHandle = useRef(false);
  // Whether the current touch began inside a form control — skip dismiss logic entirely.
  const touchStartedOnInteractive = useRef(false);

  // Avoid SSR mismatch — portals require the DOM.
  useEffect(() => setMounted(true), []);

  // Move focus to the panel div when the sheet opens.
  // Focusing a non-input element satisfies the dialog accessibility contract
  // (focus enters the dialog, ESC works, screen readers announce it) without
  // triggering the iOS/Android soft keyboard.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // ESC key dismissal.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll while sheet is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // ── Swipe-down gesture ────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    const target = e.target as HTMLElement;

    // Touches that originate inside form controls are edits, not swipes.
    if (target.closest('input, textarea, select, button, label')) {
      touchStartedOnInteractive.current = true;
      dragStartY.current = null;
      return;
    }
    touchStartedOnInteractive.current = false;

    // Gesture started on the drag handle / header zone → always eligible to dismiss.
    touchStartedOnHandle.current = !!(headerAreaRef.current?.contains(target));

    dragStartY.current = e.touches[0].clientY;
    dragging.current = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null || touchStartedOnInteractive.current) return;

    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta <= 0) return; // upward swipe — never dismiss

    const scrollTop = scrollRef.current?.scrollTop ?? 0;

    // Permit dismiss drag only when:
    //   A. touch began on the drag handle / header, OR
    //   B. the scroll container is at the very top (nothing to scroll up past)
    const canDismiss = touchStartedOnHandle.current || scrollTop === 0;
    if (!canDismiss) return;

    dragging.current = true;
    setDragOffset(delta);
  }

  function onTouchEnd() {
    // Raised from 100 → 140px to reduce accidental dismissals.
    if (dragOffset > 140) onClose();
    setDragOffset(0);
    dragStartY.current = null;
    dragging.current = false;
    touchStartedOnHandle.current = false;
    touchStartedOnInteractive.current = false;
  }

  // Sheet sits at translateY(0) when open, translateY(100%) when closed.
  // While the user drags, apply the live offset without a CSS transition.
  const transform = open ? `translateY(${dragOffset}px)` : 'translateY(100%)';
  const transition = dragging.current ? 'none' : 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)';

  if (!mounted) return null;

  return createPortal(
    // Outer wrapper covers the viewport. pointer-events-none when closed so
    // the invisible overlay does not block interaction with the page beneath.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={`fixed inset-0 z-50 flex flex-col justify-end ${open ? '' : 'pointer-events-none'}`}
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ opacity: open ? 1 : 0, transition: 'opacity 0.25s ease' }}
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      />

      {/* Sheet panel — tabIndex={-1} so it can receive programmatic focus
          without appearing in the natural tab order. outline-none suppresses
          the focus ring on the panel itself (inputs inside still show theirs). */}
      <div
        ref={panelRef}
        tabIndex={-1}
        style={{ transform, transition }}
        className="relative z-10 flex max-h-[90dvh] flex-col rounded-t-[2rem] bg-white shadow-2xl outline-none md:mx-auto md:max-h-[80dvh] md:w-full md:max-w-xl"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle + header + tab bar — swiping anywhere in this zone dismisses the sheet */}
        <div ref={headerAreaRef}>
          {/* Drag handle */}
          <div className="flex shrink-0 justify-center pb-1 pt-3" aria-hidden="true">
            <div className="h-1 w-10 rounded-full bg-stone-300" />
          </div>

          {/* Header */}
          <div className="flex shrink-0 items-center justify-between px-5 pb-2">
            <h2 className="truncate pr-3 text-lg font-black text-[#1F1F1F]">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close editor"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-black text-stone-500 transition-colors hover:bg-stone-200 active:bg-stone-300"
            >
              ✕
            </button>
          </div>

          {/* Tab bar — single tab now; extend tabs array in future phases */}
          <div className="flex shrink-0 gap-1 border-b border-stone-100 px-5" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`sheet-panel-${tab.id}`}
                onClick={() => onTabChange(tab.id)}
                className={`px-4 py-2.5 text-sm font-black transition-colors ${
                  activeTab === tab.id
                    ? '-mb-px border-b-2 border-[#FF6B00] text-[#FF6B00]'
                    : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          id={`sheet-panel-${activeTab}`}
          role="tabpanel"
          className="flex-1 overflow-y-auto overscroll-contain px-5 py-4"
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

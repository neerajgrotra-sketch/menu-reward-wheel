'use client';

import { useEffect, useRef } from 'react';
import { UI_LAYERS } from '@/lib/ui-layers';
import type { ConfirmOptions } from './types';

type Props = ConfirmOptions & { open: boolean; onCancel: () => void };

export function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      style={{ zIndex: UI_LAYERS.modal }}
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <h2 id="confirm-title" className="text-xl font-black text-[#1F1F1F]">{title}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">{message}</p>
        <div className="mt-6 flex gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-stone-200 py-3 text-sm font-black text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onCancel(); }}
            className={`flex-1 rounded-2xl py-3 text-sm font-black text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#FF6B00] hover:bg-orange-600'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

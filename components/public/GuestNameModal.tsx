'use client';

import { useRef, useState } from 'react';

// Lightweight, optional "what's your name" prompt shown once per browser
// session. Shared by both public entry points — the per-table touchpoint QR
// flow (TouchpointMenuPage) and the reusable/no-touchpoint restaurant link
// (DirectMenuPage) — so the two present an identical experience. Persisting
// the name server-side (via sessionId/guestToken) only makes sense when a
// real session_guests row exists to attach it to; DirectMenuPage has no such
// row (see hooks/useDirectOrders.ts), so those props are optional and the
// caller's onConfirm is the only thing that runs when they're absent.
export function GuestNameModal({
  restaurantName,
  brandColor,
  sessionId,
  guestToken,
  onConfirm,
  onSkip,
}: {
  restaurantName: string;
  brandColor: string;
  sessionId?: string;
  guestToken?: string;
  onConfirm: (name: string) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Explicitly blur before the modal unmounts. Without this, iOS Safari can
  // leave the page's visual viewport zoomed in after a focused input is
  // removed from the DOM — it never gets the focus-out transition it needs
  // to animate the zoom back out.
  function blurActiveInput() {
    inputRef.current?.blur();
  }

  async function handleConfirm() {
    const trimmed = name.trim();
    if (!trimmed) { blurActiveInput(); onSkip(); return; }
    blurActiveInput();
    if (sessionId && guestToken) {
      setSubmitting(true);
      try {
        const res = await fetch(`/api/public/sessions/${sessionId}/guest-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guest_token: guestToken, guest_name: trimmed }),
        });
        // A non-ok response (e.g. 403 "invalid guest token" — this guest's
        // session_guests row doesn't exist, most likely because the earlier
        // resolve's insert silently failed) means the name was NOT saved
        // server-side. This must not be swallowed: it was previously a silent
        // failure mode that made a guest invisible in the connected-diners list
        // while their own device showed the name as accepted (2026-07-01
        // multi-device join investigation).
        if (!res.ok) {
          console.error('[spinbite:guest-name] save failed', { status: res.status, sessionId });
        }
      } catch (err) {
        console.error('[spinbite:guest-name] network error', err);
      }
    }
    onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="px-6 pt-5 pb-4" style={{ borderBottom: `2px solid ${brandColor}20` }}>
          <p
            className="text-[10px] font-black uppercase tracking-widest mb-0.5"
            style={{ color: brandColor }}
          >
            Welcome
          </p>
          <h2 className="text-lg font-black text-stone-900 leading-tight">{restaurantName}</h2>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-stone-700">
              Enter your first name
            </p>
            <p className="mt-0.5 text-xs text-stone-400">Optional — you can skip this.</p>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 32))}
            placeholder="Your first name"
            autoFocus
            autoComplete="given-name"
            className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm font-semibold text-stone-900 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-300"
            onKeyDown={(e) => { if (e.key === 'Enter') { handleConfirm(); } }}
          />

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="w-full rounded-xl py-3 text-sm font-black text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: brandColor }}
            >
              {submitting ? 'Saving…' : name.trim() ? 'Continue' : 'Skip'}
            </button>
            {name.trim() !== '' && (
              <button
                type="button"
                onClick={() => { blurActiveInput(); onSkip(); }}
                className="w-full rounded-xl py-2.5 text-sm font-semibold text-stone-500 active:bg-stone-50"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UI_LAYERS } from '@/lib/ui-layers';

// ─── Session Guest List Popover ────────────────────────────────────────────────
// Customer-facing "who's connected to this table" view. Tapping the 👥 count
// pill on the session ribbon opens this. Read-only, privacy-safe — the API it
// calls never returns guest_token, device_fingerprint, or user_agent.
//
// Does NOT open its own `table-presence:{sessionId}` Realtime channel.
// TouchpointMenuPage already owns a channel on that exact topic for the
// ribbon's live count. Since createClient() returns a browser singleton and
// supabase-js dedupes channels by topic, a second `.channel(sameTopic)` here
// returns that same already-joined channel object — and calling `.on(...)`
// on an already-joined channel throws synchronously ("cannot add `presence`
// callbacks ... after `subscribe()`"), inside a useEffect with no error
// boundary above it, which is what was crashing the whole app on open.
// The 30s poll below is this component's only refresh mechanism.

const POLL_MS = 30_000;

type PublicGuest = {
  id: string;
  display_name: string;
  is_named: boolean;
  status: 'active' | 'inactive' | 'disconnected' | 'blocked';
  joined_at: string | null;
  last_seen_at: string | null;
};

type GuestsResponse = {
  session_active: boolean;
  active_guest_count: number;
  guests: PublicGuest[];
};

interface Props {
  sessionId: string;
  tableLabel: string;
  open: boolean;
  onClose: () => void;
}

export function SessionGuestListPopover({ sessionId, tableLabel, open, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GuestsResponse | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const fetchGuests = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/sessions/${sessionId}/guests`, { cache: 'no-store' });
      if (!res.ok) {
        setData({ session_active: false, active_guest_count: 0, guests: [] });
        return;
      }
      const json = await res.json() as GuestsResponse;
      setData({
        session_active: !!json?.session_active,
        active_guest_count: json?.active_guest_count ?? 0,
        guests: json?.guests ?? [],
      });
    } catch {
      // Network error — don't crash, show the safe empty/ended state instead.
      setData({ session_active: false, active_guest_count: 0, guests: [] });
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Fetch on open; poll every 30s while open; stop entirely when closed.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchGuests();
    const pollId = setInterval(fetchGuests, POLL_MS);
    return () => clearInterval(pollId);
  }, [open, fetchGuests]);

  // Escape key closes the modal.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      style={{ zIndex: UI_LAYERS.modal }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Connected diners"
        className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-stone-100">
          <h2 className="text-lg font-black text-stone-900 leading-tight">Connected Diners</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-500 active:bg-stone-200"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 max-h-[50vh] overflow-y-auto">
          {loading && !data ? (
            <p className="text-sm font-semibold text-stone-400">Loading…</p>
          ) : !data || !data.session_active ? (
            <p className="text-sm font-semibold text-stone-500">This dining session has ended.</p>
          ) : (data?.guests ?? []).length === 0 ? (
            <p className="text-sm font-semibold text-stone-500">No diners connected yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {(data?.guests ?? []).map((guest) => (
                <li key={guest.id} className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                  <span aria-hidden="true">{guest.status === 'active' ? '🟢' : '🟡'}</span>
                  <span className="truncate">{guest.display_name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {data?.session_active && (
          <div className="px-6 py-3 bg-stone-50 border-t border-stone-100">
            <p className="text-xs font-semibold text-stone-500">
              {data.active_guest_count} connected to {tableLabel}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

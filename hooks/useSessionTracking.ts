'use client';

import { useCallback, useRef } from 'react';

// ─── Event type registry ───────────────────────────────────────────────────────
// Mirrors the CHECK constraint in the session_events migration.
// Server-side-only events (ORDER_PLACED, SESSION_ENDED) are excluded —
// they are written directly from API routes, not via the track endpoint.

export type ClientSessionEventType =
  | 'MENU_OPENED'
  | 'CATEGORY_OPENED'
  | 'ITEM_VIEWED'
  | 'ITEM_VIEW_DURATION'
  | 'ITEM_ADDED_TO_CART'
  | 'ITEM_REMOVED_FROM_CART'
  | 'PROMOTION_VIEWED'
  | 'PROMOTION_PLAYED';

export type FireEventOptions = {
  menuItemId?: string;
  promotionId?: string;
  metadata?: Record<string, unknown>;
};

// Snapshot of item state at the moment of viewing.
// Preserved in metadata because the item can change after the session.
export type ItemViewSnapshot = {
  price_snapshot: number | null;
  effective_price_snapshot: number | null;
  is_on_special: boolean;
  discount_percent: number | null;
  has_image: boolean;
  dietary_tags: string[];
  category_id: string | null;
  category_name: string | null;
};

// ─── guest_id management ──────────────────────────────────────────────────────
// guest_id is a client-generated UUID that identifies a single browser tab
// within a multi-device dining session. It is ephemeral and NOT customer identity.
// Key: spinbite_guest_{sessionId} — scoped per session so different table sessions
// at the same touchpoint get independent guest IDs.

function getOrCreateGuestId(sessionId: string): string {
  const key = `spinbite_guest_${sessionId}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    // sessionStorage unavailable (private browsing, iframe) — use in-memory fallback
    return crypto.randomUUID();
  }
}

// ─── useSessionTracking ───────────────────────────────────────────────────────

export function useSessionTracking(confirmedSessionId: string | null) {
  // Stable guest ID ref — set once per session ID, cleared when session changes
  const guestIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  function getGuestId(): string | null {
    if (!confirmedSessionId) return null;
    if (sessionIdRef.current !== confirmedSessionId) {
      // Session changed — generate a fresh guest ID for the new session
      sessionIdRef.current = confirmedSessionId;
      guestIdRef.current = getOrCreateGuestId(confirmedSessionId);
    }
    return guestIdRef.current;
  }

  const fireEvent = useCallback(
    (eventType: ClientSessionEventType, options: FireEventOptions = {}) => {
      if (!confirmedSessionId) return;
      const guestId = getGuestId();

      fetch(`/api/public/sessions/${confirmedSessionId}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: eventType,
          guest_id: guestId,
          menu_item_id: options.menuItemId ?? null,
          promotion_id: options.promotionId ?? null,
          metadata: options.metadata ?? {},
        }),
      }).catch(() => { /* analytics — never surfaces to customer */ });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirmedSessionId],
  );

  return { fireEvent };
}

// ─── useItemViewTracking ──────────────────────────────────────────────────────
// Tracks ITEM_VIEWED on open and ITEM_VIEW_DURATION on close.
// Call onItemOpen() when an item detail opens, onItemClose() when it closes.
// Duration is measured client-side in milliseconds.

export function useItemViewTracking(
  fireEvent: ReturnType<typeof useSessionTracking>['fireEvent'],
) {
  const openTimestampRef = useRef<number | null>(null);
  const activeItemRef = useRef<{ id: string; name: string } | null>(null);

  const onItemOpen = useCallback(
    (itemId: string, itemName: string, snapshot?: ItemViewSnapshot) => {
      openTimestampRef.current = Date.now();
      activeItemRef.current = { id: itemId, name: itemName };
      fireEvent('ITEM_VIEWED', {
        menuItemId: itemId,
        metadata: {
          item_name: itemName,
          ...(snapshot ?? {}),
        },
      });
    },
    [fireEvent],
  );

  const onItemClose = useCallback(() => {
    const item = activeItemRef.current;
    const opened = openTimestampRef.current;
    if (!item || !opened) return;
    const durationMs = Date.now() - opened;
    fireEvent('ITEM_VIEW_DURATION', {
      menuItemId: item.id,
      metadata: { item_name: item.name, duration_ms: durationMs },
    });
    openTimestampRef.current = null;
    activeItemRef.current = null;
  }, [fireEvent]);

  return { onItemOpen, onItemClose };
}

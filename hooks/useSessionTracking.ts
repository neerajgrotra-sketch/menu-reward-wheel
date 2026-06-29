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
// guest_id identifies a single browser tab within a multi-device dining session.
//
// V1 (legacy): client-generated UUID stored in sessionStorage.
// V2 (current): server-returned session_guests.id from the resolve API, passed
//   in as resolvedGuestId. When provided, this is used for all events so that
//   session_events.guest_id links directly to a session_guests row (and thus
//   to the guest's captured name).

function getOrCreateGuestId(sessionId: string): string {
  const key = `spinbite_guest_${sessionId}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

// ─── useSessionTracking ───────────────────────────────────────────────────────

export function useSessionTracking(
  confirmedSessionId: string | null,
  resolvedGuestId?: string | null,
) {
  const guestIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // Ref keeps the latest resolvedGuestId without invalidating the fireEvent callback
  const resolvedGuestIdRef = useRef<string | null>(resolvedGuestId ?? null);
  resolvedGuestIdRef.current = resolvedGuestId ?? null;

  function getGuestId(): string | null {
    if (!confirmedSessionId) return null;
    // Prefer the server-resolved guest_id (links to session_guests row + guest name)
    if (resolvedGuestIdRef.current) return resolvedGuestIdRef.current;
    // Fallback: legacy client-generated UUID (used when resolve didn't return a guest_id)
    if (sessionIdRef.current !== confirmedSessionId) {
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

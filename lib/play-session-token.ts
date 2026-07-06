'use client';

// Shared with app/play/[restaurantSlug]/[promotionSlug]/page.tsx so the play
// page and any other surface (e.g. the menu page's floating reward widget)
// always resolve the exact same session for a given browser + promotion.
const PLAY_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Keying the token by visit_session_id (the table/touchpoint dining session,
// when one exists) — not just restaurant+promotion — means a table session
// the restaurant ends, followed by a rescan, always mints a fresh visit
// session id and therefore a fresh key here: the customer can play again
// immediately instead of being stuck behind the old 24h browser-level TTL,
// which was never meant to survive the restaurant explicitly closing them
// out. Direct-link visits with no touchpoint (no visit_session_id at all)
// fall back to the plain restaurant+promotion key, preserving the original
// TTL-only behavior — there's no restaurant-controlled session boundary to
// key off in that flow.
function storageKey(restaurantSlug: string, promotionSlug: string, visitSessionId?: string | null) {
  const base = `spinbite_play_session_${restaurantSlug}_${promotionSlug}`;
  return visitSessionId ? `${base}_${visitSessionId}` : base;
}

/**
 * Read-only lookup — returns the token only if one exists and hasn't expired.
 * Never creates or mutates storage, so callers that merely want to check
 * whether this browser has already played (without starting a real play
 * session) can call this safely.
 */
export function peekPlaySessionToken(
  restaurantSlug: string,
  promotionSlug: string,
  visitSessionId?: string | null,
): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(storageKey(restaurantSlug, promotionSlug, visitSessionId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { token: string; createdAt: number };
    if (parsed.token && Date.now() - parsed.createdAt < PLAY_SESSION_TTL_MS) {
      return parsed.token;
    }
  } catch {
    // Pre-TTL clients stored a bare string token with no createdAt — treat as stale.
  }

  return null;
}

/** Returns the existing valid token, or mints and persists a new one. */
export function getOrCreatePlaySessionToken(
  restaurantSlug: string,
  promotionSlug: string,
  visitSessionId?: string | null,
): string {
  const existing = peekPlaySessionToken(restaurantSlug, promotionSlug, visitSessionId);
  if (existing) return existing;

  const next = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  window.localStorage.setItem(
    storageKey(restaurantSlug, promotionSlug, visitSessionId),
    JSON.stringify({ token: next, createdAt: Date.now() }),
  );
  return next;
}

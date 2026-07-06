'use client';

// Shared with app/play/[restaurantSlug]/[promotionSlug]/page.tsx so the play
// page and any other surface (e.g. the menu page's floating reward widget)
// always resolve the exact same session for a given browser + promotion.
const PLAY_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function storageKey(restaurantSlug: string, promotionSlug: string) {
  return `spinbite_play_session_${restaurantSlug}_${promotionSlug}`;
}

/**
 * Read-only lookup — returns the token only if one exists and hasn't expired.
 * Never creates or mutates storage, so callers that merely want to check
 * whether this browser has already played (without starting a real play
 * session) can call this safely.
 */
export function peekPlaySessionToken(restaurantSlug: string, promotionSlug: string): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(storageKey(restaurantSlug, promotionSlug));
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
export function getOrCreatePlaySessionToken(restaurantSlug: string, promotionSlug: string): string {
  const existing = peekPlaySessionToken(restaurantSlug, promotionSlug);
  if (existing) return existing;

  const next = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  window.localStorage.setItem(
    storageKey(restaurantSlug, promotionSlug),
    JSON.stringify({ token: next, createdAt: Date.now() }),
  );
  return next;
}

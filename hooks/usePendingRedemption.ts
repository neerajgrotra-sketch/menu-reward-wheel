'use client';

import { useCallback, useEffect, useState } from 'react';

export type PendingRedemption = {
  redemptionId: string;
  menuItemId: string;
  rewardType: 'free' | 'discount' | 'custom';
  rewardValue: number | null;
  code: string;
  expiresAtMs: number;
  restaurantId: string;
  // Persisted (not just a component ref) so the auto-add-to-cart effect stays
  // idempotent across a genuine remount — e.g. a hydration-mismatch recovery
  // remount elsewhere on this page — not only within a single component instance.
  autoAdded?: boolean;
  // Persisted so an acknowledged banner stays hidden across a refresh or a
  // remount (e.g. navigating to checkout and back) instead of reappearing —
  // the discount itself still applies at checkout regardless of this flag.
  bannerDismissed?: boolean;
};

const STORAGE_KEY = 'spinbite_pending_redemption_v1';
const REDEEM_PARAM_KEYS = ['redeem_id', 'redeem_item', 'redeem_type', 'redeem_value', 'redeem_code', 'redeem_exp'];

function readStored(): PendingRedemption | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingRedemption;
    if (!parsed?.redemptionId || !parsed?.menuItemId || !parsed?.expiresAtMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

function stripRedeemParams() {
  const url = new URL(window.location.href);
  REDEEM_PARAM_KEYS.forEach((key) => url.searchParams.delete(key));
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

// Reads the `redeem_*` query params carried over from the play page's "Redeem
// Now" link, persists them to sessionStorage, and strips them from the URL so
// a refresh or back/forward navigation doesn't reprocess the same link twice.
function consumeUrlParams(restaurantId: string): PendingRedemption | null {
  const params = new URLSearchParams(window.location.search);
  const redemptionId = params.get('redeem_id');
  const menuItemId = params.get('redeem_item');
  const rewardTypeRaw = params.get('redeem_type');
  const expStr = params.get('redeem_exp');

  if (!redemptionId || !menuItemId || !rewardTypeRaw || !expStr) return null;

  stripRedeemParams();

  const expiresAtMs = Number(expStr);
  if (!Number.isFinite(expiresAtMs)) return null;

  const rewardValueStr = params.get('redeem_value');
  // Re-consuming the same redemption's link (e.g. tapping "Redeem Now" again
  // from the floating widget after it already added the item once) must not
  // reset autoAdded/bannerDismissed — otherwise the auto-add effect below
  // fires again and bumps the reward item's cart quantity a second time.
  const previous = readStored();
  const carryOver = previous?.redemptionId === redemptionId ? previous : null;
  const pending: PendingRedemption = {
    redemptionId,
    menuItemId,
    rewardType: rewardTypeRaw === 'free' || rewardTypeRaw === 'discount' ? rewardTypeRaw : 'custom',
    rewardValue: rewardValueStr ? Number(rewardValueStr) : null,
    code: params.get('redeem_code') || '',
    expiresAtMs,
    restaurantId,
    autoAdded: carryOver?.autoAdded,
    bannerDismissed: carryOver?.bannerDismissed,
  };

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // sessionStorage unavailable (private browsing) — still usable for this render.
  }

  return pending;
}

export function usePendingRedemption(restaurantId: string) {
  const [pending, setPending] = useState<PendingRedemption | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const fromUrl = consumeUrlParams(restaurantId);
    const candidate = fromUrl || readStored();
    // Guard against a stale redemption from a different restaurant lingering in
    // the same sessionStorage/tab (e.g. two different QR codes scanned in a row).
    setPending(candidate && candidate.restaurantId === restaurantId ? candidate : null);
  }, [restaurantId]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pending]);

  // Hides the banner only — the cart item this redemption added stays put.
  // Persists the dismissal so it stays hidden across a refresh or remount,
  // rather than nulling `pending` outright (which would also drop the
  // checkout discount this same state drives).
  const dismiss = useCallback(() => {
    setPending((current) => {
      if (!current) return current;
      const next = { ...current, bannerDismissed: true };
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Synchronous, storage-direct — not routed through React state — so it stays
  // correct even if the auto-add effect runs twice before either invocation
  // sees a re-render (StrictMode's dev double-invoke, or a real hydration
  // mismatch recovery remount elsewhere on the page). sessionStorage reads/
  // writes are immediately consistent across both invocations; React state
  // updates are not.
  const claimAutoAdd = useCallback((redemptionId: string): boolean => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as PendingRedemption;
      if (parsed?.redemptionId !== redemptionId) return false;
      if (parsed.autoAdded) return false;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, autoAdded: true }));
      return true;
    } catch {
      return false;
    }
  }, []);

  // Called once checkout succeeds — clears the underlying storage too.
  const clear = useCallback(() => {
    setPending(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const expired = pending ? now >= pending.expiresAtMs : false;

  return { pending, expired, now, dismiss, clear, claimAutoAdd };
}

// The slice of usePendingRedemption()'s return value that render-only consumers
// (CartSheet, PaymentCheckoutScreen) need — the same pending/expired/now driving
// the top-of-page banner, threaded down so cart/checkout UI never drifts from it.
export type PendingRedemptionState = Pick<ReturnType<typeof usePendingRedemption>, 'pending' | 'expired' | 'now'>;

'use client';

import { useCallback, useEffect, useMemo, useReducer } from 'react';

export type CartItem = {
  menu_item_id: string;
  name: string;
  price: number;
  effective_price: number;
  special_active: boolean;
  quantity: number;
  special_instructions: string;
};

type CartState = {
  items: CartItem[];
  restaurantId: string | null;
  // Dining session this cart belongs to. Cleared whenever a *different* confirmed
  // session shows up (see SYNC_SESSION) so a stale cart from a closed session can
  // never bleed into the next one sharing the same browser tab / sessionStorage.
  sessionId: string | null;
};

type CartAction =
  | { type: 'ADD_ITEM'; item: Omit<CartItem, 'quantity' | 'special_instructions'>; restaurantId: string }
  | { type: 'REMOVE_ITEM'; menu_item_id: string }
  | { type: 'UPDATE_QUANTITY'; menu_item_id: string; quantity: number }
  | { type: 'UPDATE_INSTRUCTIONS'; menu_item_id: string; instructions: string }
  | { type: 'CLEAR' }
  | { type: 'SYNC_SESSION'; sessionId: string };

// v2: added sessionId scoping (2026-07-02, session isolation fix). Bumped so any
// pre-fix v1 payload (no sessionId field) is never read back as trusted data.
const STORAGE_KEY = 'spinbite_cart_v2';

const EMPTY_CART: CartState = { items: [], restaurantId: null, sessionId: null };

function readStoredCart(): CartState {
  if (typeof window === 'undefined') return EMPTY_CART;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_CART;
    const parsed = JSON.parse(raw) as CartState;
    // Minimal shape validation — discard stale/corrupt data
    if (!Array.isArray(parsed?.items)) return EMPTY_CART;
    console.log('[spinbite:cart] restored', { item_count: parsed.items.length, sessionId: parsed.sessionId ?? null });
    return { items: parsed.items, restaurantId: parsed.restaurantId ?? null, sessionId: parsed.sessionId ?? null };
  } catch (e) {
    console.warn('[spinbite:cart] restore-failed', e instanceof Error ? e.message : 'unknown');
    return EMPTY_CART;
  }
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.menu_item_id === action.item.menu_item_id);
      if (existing) {
        return {
          ...state,
          restaurantId: action.restaurantId,
          items: state.items.map((i) =>
            i.menu_item_id === action.item.menu_item_id
              ? { ...i, quantity: i.quantity + 1 }
              : i,
          ),
        };
      }
      return {
        ...state,
        restaurantId: action.restaurantId,
        items: [
          ...state.items,
          { ...action.item, quantity: 1, special_instructions: '' },
        ],
      };
    }
    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter((i) => i.menu_item_id !== action.menu_item_id),
      };
    case 'UPDATE_QUANTITY': {
      if (action.quantity < 1) {
        return {
          ...state,
          items: state.items.filter((i) => i.menu_item_id !== action.menu_item_id),
        };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.menu_item_id === action.menu_item_id ? { ...i, quantity: action.quantity } : i,
        ),
      };
    }
    case 'UPDATE_INSTRUCTIONS':
      return {
        ...state,
        items: state.items.map((i) =>
          i.menu_item_id === action.menu_item_id
            ? { ...i, special_instructions: action.instructions }
            : i,
        ),
      };
    case 'CLEAR':
      return { ...state, items: [], restaurantId: null };
    case 'SYNC_SESSION': {
      // No confirmed session yet (resolving/ended) — leave the cart untouched.
      // Nulling out on every transient 'resolving' tick would wipe carts on
      // ordinary refreshes where the session reattaches to the same id.
      if (!action.sessionId) return state;
      // Cart belongs to a different, prior session — the dining-session boundary
      // was crossed (old session closed, a new one started). Destroy its state.
      if (state.sessionId && state.sessionId !== action.sessionId) {
        console.log('[spinbite:cart] session-changed — clearing stale cart', {
          from: state.sessionId,
          to: action.sessionId,
        });
        return { items: [], restaurantId: null, sessionId: action.sessionId };
      }
      if (state.sessionId === action.sessionId) return state;
      // First confirmation for this cart (items added pre-confirmation are kept).
      return { ...state, sessionId: action.sessionId };
    }
    default:
      return state;
  }
}

export function useCart(confirmedSessionId?: string | null) {
  // Lazy initializer reads sessionStorage on first render (client-only — never runs on server)
  const [state, dispatch] = useReducer(cartReducer, undefined, readStoredCart);

  // Dining session is the canonical customer boundary: whenever a *new* confirmed
  // session id shows up that doesn't match the one this cart was last synced to,
  // the previous session has closed and a new one started — destroy the stale cart.
  useEffect(() => {
    if (confirmedSessionId) dispatch({ type: 'SYNC_SESSION', sessionId: confirmedSessionId });
  }, [confirmedSessionId]);

  // Persist to sessionStorage after every state change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (state.items.length === 0) {
        sessionStorage.removeItem(STORAGE_KEY);
      } else {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch {
      // sessionStorage unavailable (private browsing restriction, quota exceeded)
    }
  }, [state]);

  const addItem = useCallback(
    (item: Omit<CartItem, 'quantity' | 'special_instructions'>, restaurantId: string) => {
      dispatch({ type: 'ADD_ITEM', item, restaurantId });
    },
    [],
  );

  const removeItem = useCallback((menu_item_id: string) => {
    dispatch({ type: 'REMOVE_ITEM', menu_item_id });
  }, []);

  const updateQuantity = useCallback((menu_item_id: string, quantity: number) => {
    dispatch({ type: 'UPDATE_QUANTITY', menu_item_id, quantity });
  }, []);

  const updateInstructions = useCallback((menu_item_id: string, instructions: string) => {
    dispatch({ type: 'UPDATE_INSTRUCTIONS', menu_item_id, instructions });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const itemCount = useMemo(
    () => state.items.reduce((sum, i) => sum + i.quantity, 0),
    [state.items],
  );

  const subtotal = useMemo(
    () =>
      Math.round(
        state.items.reduce((sum, i) => sum + i.effective_price * i.quantity, 0) * 100,
      ) / 100,
    [state.items],
  );

  return {
    items: state.items,
    restaurantId: state.restaurantId,
    itemCount,
    subtotal,
    addItem,
    removeItem,
    updateQuantity,
    updateInstructions,
    clearCart,
  };
}

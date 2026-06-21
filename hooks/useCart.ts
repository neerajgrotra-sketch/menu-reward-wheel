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
};

type CartAction =
  | { type: 'ADD_ITEM'; item: Omit<CartItem, 'quantity' | 'special_instructions'>; restaurantId: string }
  | { type: 'REMOVE_ITEM'; menu_item_id: string }
  | { type: 'UPDATE_QUANTITY'; menu_item_id: string; quantity: number }
  | { type: 'UPDATE_INSTRUCTIONS'; menu_item_id: string; instructions: string }
  | { type: 'CLEAR' };

const STORAGE_KEY = 'spinbite_cart_v1';

function readStoredCart(): CartState {
  if (typeof window === 'undefined') return { items: [], restaurantId: null };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], restaurantId: null };
    const parsed = JSON.parse(raw) as CartState;
    // Minimal shape validation — discard stale/corrupt data
    if (!Array.isArray(parsed?.items)) return { items: [], restaurantId: null };
    console.log('[spinbite:cart] restored', { item_count: parsed.items.length });
    return parsed;
  } catch (e) {
    console.warn('[spinbite:cart] restore-failed', e instanceof Error ? e.message : 'unknown');
    return { items: [], restaurantId: null };
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
      return { items: [], restaurantId: null };
    default:
      return state;
  }
}

export function useCart() {
  // Lazy initializer reads sessionStorage on first render (client-only — never runs on server)
  const [state, dispatch] = useReducer(cartReducer, undefined, readStoredCart);

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

'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { PlacedOrder } from '@/components/public/CartSheet';
import type { SessionOrder } from '@/components/public/OrdersDrawer';

// Orders placed via the direct restaurant link (no table/touchpoint QR) have no
// visit_session to attach to — see components/public/RestaurantPublicPage.tsx's
// `noSessionContext` branch. This hook tracks those orders locally per browser
// tab so the customer can still see a "My Orders" list, without creating any
// shared session/touchpoint state that unrelated customers could collide on.
const STORAGE_PREFIX = 'spinbite_direct_orders_v1:';
const MAX_STORED_ORDERS = 20;

function storageKey(restaurantId: string) {
  return `${STORAGE_PREFIX}${restaurantId}`;
}

function readStoredOrders(restaurantId: string): SessionOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(storageKey(restaurantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SessionOrder[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeStoredOrders(restaurantId: string, orders: SessionOrder[]) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey(restaurantId), JSON.stringify(orders));
  } catch {
    // sessionStorage unavailable (private browsing restriction, quota exceeded)
  }
}

function toSessionOrder(placed: PlacedOrder): SessionOrder {
  return {
    id: placed.id,
    order_number: placed.order_number,
    status: placed.status,
    customer_name: placed.customer_name,
    subtotal: placed.subtotal,
    created_at: placed.created_at,
    payment_confirmation: placed.payment_confirmation_number ?? null,
    order_items: placed.order_items,
  };
}

export function useDirectOrders(restaurantId: string) {
  const [orders, setOrders] = useState<SessionOrder[]>(() => readStoredOrders(restaurantId));
  const [refreshing, setRefreshing] = useState(false);

  // Re-read from storage if the restaurant changes under this hook instance
  // (e.g. client-side nav from one restaurant's direct link to another's).
  useEffect(() => {
    setOrders(readStoredOrders(restaurantId));
  }, [restaurantId]);

  const addOrder = useCallback((placed: PlacedOrder) => {
    setOrders((prev) => {
      const next = [toSessionOrder(placed), ...prev].slice(0, MAX_STORED_ORDERS);
      writeStoredOrders(restaurantId, next);
      return next;
    });
  }, [restaurantId]);

  // On-demand only — called when the customer opens the drawer. Deliberately
  // not a persistent realtime subscription: this flow has no session to scope
  // one to, and the customer can already tap through to the existing, fully
  // realtime /r/order/[orderId] tracker for live status.
  const refreshStatuses = useCallback(async () => {
    if (orders.length === 0) return;
    setRefreshing(true);
    try {
      const supabase = createClient();
      const ids = orders.map((o) => o.id);
      const { data, error } = await supabase
        .from('orders')
        .select('id,status')
        .in('id', ids);
      if (error || !data) return;
      const statusById = new Map(data.map((row) => [row.id, row.status]));
      setOrders((prev) => {
        const next = prev.map((o) => (statusById.has(o.id) ? { ...o, status: statusById.get(o.id)! } : o));
        writeStoredOrders(restaurantId, next);
        return next;
      });
    } catch {
      // network error — silent, drawer just shows last-known statuses
    } finally {
      setRefreshing(false);
    }
  }, [orders, restaurantId]);

  return { orders, addOrder, refreshStatuses, refreshing };
}

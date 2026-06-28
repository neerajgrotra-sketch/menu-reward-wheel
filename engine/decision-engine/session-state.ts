// ── Session State Builder ─────────────────────────────────────────────────────
//
// Derives live session state from raw session_events.
// Pure function — no DB calls, no side effects.
// Designed to run continuously against the event stream to produce an always-current
// snapshot of what the customer is doing right now.

import type { RawSessionEvent } from '@/lib/session-intelligence';
import type {
  SessionContext,
  SessionState,
  ViewedItem,
  CartItem,
  RemovedCartItem,
  PlacedOrder,
} from './types';

type ViewStats = {
  name: string;
  count: number;
  totalDur: number;
  firstAt: string;
  lastAt: string;
};

type CartStats = {
  name: string;
  adds: number;
  removes: number;
  price: number;
  lastModified: string;
};

export function buildSessionState(
  events: RawSessionEvent[],
  session: SessionContext,
): SessionState {
  const now = new Date();

  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  // ── Orders ────────────────────────────────────────────────────────────────
  const ordersPlaced: PlacedOrder[] = sorted
    .filter((e) => e.event_type === 'ORDER_PLACED')
    .map((e) => ({
      order_id: (e.metadata.order_id as string) ?? null,
      order_number: (e.metadata.order_number as number) ?? null,
      placed_at: e.created_at,
      item_count: (e.metadata.item_count as number) ?? 0,
      subtotal: Number(e.metadata.subtotal ?? 0),
    }));

  // Cart state resets after each order — use events after the last ORDER_PLACED.
  const lastOrderAt =
    ordersPlaced.length > 0 ? ordersPlaced[ordersPlaced.length - 1].placed_at : null;

  const postOrderEvents = lastOrderAt
    ? sorted.filter((e) => new Date(e.created_at).getTime() > new Date(lastOrderAt).getTime())
    : sorted;

  // ── Item view stats (full session — not just post-order) ──────────────────
  const viewStatsMap = new Map<string, ViewStats>();

  for (const ev of sorted) {
    if (ev.event_type === 'ITEM_VIEWED' && ev.menu_item_id) {
      const name = (ev.metadata.item_name as string) ?? 'Unknown';
      const existing = viewStatsMap.get(ev.menu_item_id);
      if (!existing) {
        viewStatsMap.set(ev.menu_item_id, {
          name,
          count: 1,
          totalDur: 0,
          firstAt: ev.created_at,
          lastAt: ev.created_at,
        });
      } else {
        existing.count += 1;
        existing.lastAt = ev.created_at;
      }
    }
    if (ev.event_type === 'ITEM_VIEW_DURATION' && ev.menu_item_id) {
      const ms = (ev.metadata.duration_ms as number) ?? 0;
      const name = (ev.metadata.item_name as string) ?? 'Unknown';
      const existing = viewStatsMap.get(ev.menu_item_id);
      if (existing) {
        existing.totalDur += ms;
      } else {
        viewStatsMap.set(ev.menu_item_id, {
          name,
          count: 1,
          totalDur: ms,
          firstAt: ev.created_at,
          lastAt: ev.created_at,
        });
      }
    }
  }

  const itemsViewed: ViewedItem[] = Array.from(viewStatsMap.entries()).map(
    ([itemId, stats]) => ({
      menu_item_id: itemId,
      name: stats.name,
      view_count: stats.count,
      total_view_duration_ms: stats.totalDur,
      first_viewed_at: stats.firstAt,
      last_viewed_at: stats.lastAt,
    }),
  );

  // ── Cart state (post-last-order) ──────────────────────────────────────────
  const cartMap = new Map<string, CartStats>();

  for (const ev of postOrderEvents) {
    if (ev.event_type === 'ITEM_ADDED_TO_CART') {
      const key =
        ev.menu_item_id ??
        `__name__${(ev.metadata.item_name as string) ?? 'unknown'}`;
      const name = (ev.metadata.item_name as string) ?? 'Unknown';
      const price = Number(ev.metadata.price ?? 0);
      const existing = cartMap.get(key) ?? {
        name,
        adds: 0,
        removes: 0,
        price,
        lastModified: ev.created_at,
      };
      existing.adds += 1;
      existing.lastModified = ev.created_at;
      cartMap.set(key, existing);
    }
    if (ev.event_type === 'ITEM_REMOVED_FROM_CART') {
      const key =
        ev.menu_item_id ??
        `__name__${(ev.metadata.item_name as string) ?? 'unknown'}`;
      const name = (ev.metadata.item_name as string) ?? 'Unknown';
      const existing = cartMap.get(key) ?? {
        name,
        adds: 0,
        removes: 0,
        price: 0,
        lastModified: ev.created_at,
      };
      existing.removes += 1;
      existing.lastModified = ev.created_at;
      cartMap.set(key, existing);
    }
  }

  const itemsInCart: CartItem[] = Array.from(cartMap.entries())
    .filter(([, stats]) => stats.adds > stats.removes)
    .map(([key, stats]) => ({
      menu_item_id: key.startsWith('__name__') ? null : key,
      name: stats.name,
      net_quantity: stats.adds - stats.removes,
      price_per_item: stats.price,
      last_modified_at: stats.lastModified,
    }));

  const itemsRemovedFromCart: RemovedCartItem[] = Array.from(cartMap.entries())
    .filter(([, stats]) => stats.removes > 0)
    .map(([key, stats]) => ({
      menu_item_id: key.startsWith('__name__') ? null : key,
      name: stats.name,
      remove_count: stats.removes,
      last_removed_at: stats.lastModified,
    }));

  const currentCartValue = itemsInCart.reduce(
    (sum, item) => sum + item.price_per_item * item.net_quantity,
    0,
  );

  // ── Current category (last CATEGORY_OPENED in entire session) ────────────
  const catEvents = sorted.filter((e) => e.event_type === 'CATEGORY_OPENED');
  const currentCategory =
    catEvents.length > 0
      ? ((catEvents[catEvents.length - 1].metadata.category_name as string) ?? null)
      : null;

  // ── Time metrics ──────────────────────────────────────────────────────────
  const sessionDurationSeconds = Math.floor(
    (now.getTime() - new Date(session.started_at).getTime()) / 1000,
  );

  const lastEvent = sorted[sorted.length - 1];
  const timeSinceLastAction = lastEvent
    ? Math.floor((now.getTime() - new Date(lastEvent.created_at).getTime()) / 1000)
    : null;

  return {
    session_id: session.id,
    restaurant_id: session.restaurant_id,
    touchpoint_id: session.touchpoint_id,
    started_at: session.started_at,
    snapshot_at: now.toISOString(),
    session_duration_seconds: sessionDurationSeconds,
    time_since_last_action_seconds: timeSinceLastAction,
    current_category: currentCategory,
    items_viewed: itemsViewed,
    items_in_cart: itemsInCart,
    items_removed_from_cart: itemsRemovedFromCart,
    current_cart_value: currentCartValue,
    orders_placed: ordersPlaced,
    guest_count: session.guest_count,
    is_active: session.status === 'active',
  };
}

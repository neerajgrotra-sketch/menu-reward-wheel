// ── Session Reconstruction Engine ─────────────────────────────────────────────
//
// Pure functions — no DB calls, no side effects.
// Takes raw session_events + orders and reconstructs structured dining intelligence.
// This is the AI-readable behavioral layer that sits above raw event storage.

// ── Input types (from DB) ─────────────────────────────────────────────────────

export type RawSessionEvent = {
  id: string;
  session_id: string;
  guest_id: string | null;
  event_type: string;
  menu_item_id: string | null;
  promotion_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type RawOrderItem = {
  id: string;
  menu_item_id: string | null;
  name_snapshot: string;
  quantity: number;
  price_snapshot: number;
  effective_price_snapshot: number;
  line_total: number;
  special_instructions: string | null;
};

export type RawOrder = {
  id: string;
  order_number: number;
  status: string;
  subtotal: number;
  created_at: string;
  order_items: RawOrderItem[];
};

export type RawSession = {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  session_access_code: string;
  total_spend: number;
  restaurant_touchpoints: {
    id: string;
    name: string;
    type: string;
    section_name: string | null;
    touchpoint_code: string;
  } | null;
};

// ── Output types (structured intelligence) ────────────────────────────────────

export type TimelineEntry = {
  id: string;
  timestamp: string;
  event_type: string;
  label: string;
  detail: string | null;
  menu_item_id: string | null;
};

export type ViewedItem = {
  menu_item_id: string | null;
  name: string;
  view_count: number;
  total_view_duration_ms: number;
  avg_view_duration_ms: number;
};

export type OrderedItem = {
  menu_item_id: string | null;
  name: string;
  quantity: number;
  total_spend: number;
};

export type SessionMetrics = {
  session_duration_seconds: number | null;
  decision_latency_seconds: number | null;
  items_viewed_count: number;
  items_ordered_count: number;
  items_viewed_not_ordered: number;
  high_interest_items_not_ordered: ViewedItem[];
  average_item_view_duration_ms: number | null;
  menu_conversion_rate: number | null;
  total_orders: number;
  total_spend: number;
};

export type SessionSummary = {
  session_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  touchpoint_name: string;
  session_access_code: string;
};

export type SessionIntelligence = {
  session_summary: SessionSummary;
  timeline: TimelineEntry[];
  viewed_not_ordered: ViewedItem[];
  ordered_items: OrderedItem[];
  derived_metrics: SessionMetrics;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDurationDetail(durationMs: number): string | null {
  const sec = Math.round(durationMs / 1000);
  if (sec <= 0) return null;
  if (sec < 60) return `${sec} sec`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min} min ${rem} sec` : `${min} min`;
}

// ── Core reconstruction ───────────────────────────────────────────────────────

export function reconstructSession(
  events: RawSessionEvent[],
  orders: RawOrder[],
  session: RawSession,
): SessionIntelligence {
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  // ── Step 1: Build per-item view stats ─────────────────────────────────────
  // First collect all ITEM_VIEW_DURATION values per item so we can pair them
  // with ITEM_VIEWED timeline entries in chronological order.
  const itemDurationQueues = new Map<string, number[]>();
  for (const ev of sorted) {
    if (ev.event_type === 'ITEM_VIEW_DURATION' && ev.menu_item_id) {
      const q = itemDurationQueues.get(ev.menu_item_id) ?? [];
      q.push((ev.metadata.duration_ms as number) ?? 0);
      itemDurationQueues.set(ev.menu_item_id, q);
    }
  }

  // Per-item view tracking (view count + all durations for metric calculation)
  const itemViewStats = new Map<string, {
    name: string;
    viewCount: number;
    durations: number[];
  }>();
  for (const ev of sorted) {
    if (ev.event_type === 'ITEM_VIEWED' && ev.menu_item_id) {
      const name = (ev.metadata.item_name as string) ?? 'Unknown item';
      if (!itemViewStats.has(ev.menu_item_id)) {
        itemViewStats.set(ev.menu_item_id, { name, viewCount: 0, durations: [] });
      }
      itemViewStats.get(ev.menu_item_id)!.viewCount += 1;
    }
    if (ev.event_type === 'ITEM_VIEW_DURATION' && ev.menu_item_id) {
      const ms = (ev.metadata.duration_ms as number) ?? 0;
      if (!itemViewStats.has(ev.menu_item_id)) {
        const name = (ev.metadata.item_name as string) ?? 'Unknown item';
        itemViewStats.set(ev.menu_item_id, { name, viewCount: 1, durations: [] });
      }
      itemViewStats.get(ev.menu_item_id)!.durations.push(ms);
    }
  }

  // ── Step 2: Build ordered items map (from actual order_items rows) ─────────
  // Using name_snapshot (not menu_item_id) as the display key so deleted items
  // still appear. menu_item_id is used for the viewed-vs-ordered cross-reference.
  const orderedItemMap = new Map<string, { name: string; quantity: number; totalSpend: number }>();
  for (const order of orders) {
    for (const item of order.order_items) {
      // Key by menu_item_id when available, fall back to name for deleted items
      const key = item.menu_item_id ?? `__name__${item.name_snapshot}`;
      if (!orderedItemMap.has(key)) {
        orderedItemMap.set(key, { name: item.name_snapshot, quantity: 0, totalSpend: 0 });
      }
      const entry = orderedItemMap.get(key)!;
      entry.quantity += item.quantity;
      entry.totalSpend += Number(item.line_total);
    }
  }

  // ── Step 3: Build chronological timeline ──────────────────────────────────
  // ITEM_VIEW_DURATION events are folded into the corresponding ITEM_VIEWED entry;
  // they don't appear as separate timeline rows.
  const itemDurationConsumed = new Map<string, number>();
  const timeline: TimelineEntry[] = [];

  for (const ev of sorted) {
    if (ev.event_type === 'ITEM_VIEW_DURATION') continue;

    let label = '';
    let detail: string | null = null;

    switch (ev.event_type) {
      case 'MENU_OPENED':
        label = 'Menu opened';
        break;

      case 'CATEGORY_OPENED':
        label = `${(ev.metadata.category_name as string) ?? 'Category'} opened`;
        break;

      case 'ITEM_VIEWED': {
        const itemName = (ev.metadata.item_name as string) ?? 'Item';
        label = `${itemName} viewed`;
        // Attach the paired duration for this specific view occurrence
        if (ev.menu_item_id) {
          const queue = itemDurationQueues.get(ev.menu_item_id) ?? [];
          const consumed = itemDurationConsumed.get(ev.menu_item_id) ?? 0;
          if (consumed < queue.length) {
            detail = formatDurationDetail(queue[consumed]);
            itemDurationConsumed.set(ev.menu_item_id, consumed + 1);
          }
        }
        break;
      }

      case 'ITEM_ADDED_TO_CART': {
        const name = (ev.metadata.item_name as string) ?? 'Item';
        const qty = ev.metadata.quantity as number | undefined;
        label = `${name} added to cart`;
        detail = qty && qty > 1 ? `×${qty}` : null;
        break;
      }

      case 'ITEM_REMOVED_FROM_CART':
        label = `${(ev.metadata.item_name as string) ?? 'Item'} removed from cart`;
        break;

      case 'ORDER_PLACED': {
        const num = ev.metadata.order_number as number;
        const subtotal = ev.metadata.subtotal as number;
        const itemCount = (ev.metadata.item_count as number) ?? 0;
        label = `Order #${num} placed`;
        detail = `$${Number(subtotal).toFixed(2)} · ${itemCount} item${itemCount !== 1 ? 's' : ''}`;
        break;
      }

      case 'PROMOTION_VIEWED':
        label = 'Promotion viewed';
        detail = (ev.metadata.promotion_name as string) ?? null;
        break;

      case 'PROMOTION_PLAYED': {
        const result = ev.metadata.result as string | undefined;
        label = `Promotion played`;
        detail = result ? `Result: ${result}` : null;
        break;
      }

      case 'SESSION_ENDED': {
        const reason = ev.metadata.reason as string | undefined;
        const durSec = ev.metadata.duration_seconds as number | undefined;
        label = 'Session ended';
        const reasonLabel = reason === 'manual' ? 'Ended by staff' : reason === 'stale' ? 'Timed out' : 'Ended';
        detail = durSec != null ? `${reasonLabel} · ${Math.round(durSec / 60)} min` : reasonLabel ?? null;
        break;
      }

      default:
        label = ev.event_type.replace(/_/g, ' ').toLowerCase();
    }

    timeline.push({
      id: ev.id,
      timestamp: ev.created_at,
      event_type: ev.event_type,
      label,
      detail,
      menu_item_id: ev.menu_item_id,
    });
  }

  // ── Step 4: viewed_not_ordered ────────────────────────────────────────────
  const viewedItems: ViewedItem[] = Array.from(itemViewStats.entries()).map(([itemId, stats]) => {
    const totalDur = stats.durations.reduce((a: number, b: number) => a + b, 0);
    const avgDur = stats.durations.length > 0 ? totalDur / stats.durations.length : 0;
    return {
      menu_item_id: itemId,
      name: stats.name,
      view_count: stats.viewCount,
      total_view_duration_ms: totalDur,
      avg_view_duration_ms: avgDur,
    };
  });

  // Item was "ordered" if its menu_item_id appears as a key in orderedItemMap
  const orderedItemIdSet = new Set(
    Array.from(orderedItemMap.keys()).filter((k: string) => !k.startsWith('__name__')),
  );
  const viewedNotOrdered = viewedItems
    .filter(v => v.menu_item_id && !orderedItemIdSet.has(v.menu_item_id))
    .sort((a, b) => b.avg_view_duration_ms - a.avg_view_duration_ms);

  // ── Step 5: ordered_items (flat list across all session orders) ────────────
  const orderedItems: OrderedItem[] = Array.from(orderedItemMap.entries()).map(([key, data]) => ({
    menu_item_id: key.startsWith('__name__') ? null : key,
    name: data.name,
    quantity: data.quantity,
    total_spend: data.totalSpend,
  }));

  // ── Step 6: Derived metrics ───────────────────────────────────────────────
  const sessionStartMs = new Date(session.started_at).getTime();
  const sessionEndMs = session.ended_at ? new Date(session.ended_at).getTime() : null;
  const sessionDurationSeconds = sessionEndMs
    ? Math.floor((sessionEndMs - sessionStartMs) / 1000)
    : null;

  // Decision latency: time from MENU_OPENED to first ORDER_PLACED
  let decisionLatencySeconds: number | null = null;
  const menuOpenedAt = sorted.find(e => e.event_type === 'MENU_OPENED')?.created_at;
  const firstOrderAt = sorted.find(e => e.event_type === 'ORDER_PLACED')?.created_at;
  if (menuOpenedAt && firstOrderAt) {
    decisionLatencySeconds = Math.floor(
      (new Date(firstOrderAt).getTime() - new Date(menuOpenedAt).getTime()) / 1000,
    );
  }

  // Average item view duration across all ITEM_VIEW_DURATION events
  const allDurationValues = sorted
    .filter(e => e.event_type === 'ITEM_VIEW_DURATION')
    .map(e => (e.metadata.duration_ms as number) ?? 0);
  const avgViewDurationMs =
    allDurationValues.length > 0
      ? allDurationValues.reduce((a, b) => a + b, 0) / allDurationValues.length
      : null;

  // High interest: viewed, not ordered, avg view time >= 20 seconds
  const HIGH_INTEREST_THRESHOLD_MS = 20_000;
  const highInterestNotOrdered = viewedNotOrdered.filter(
    v => v.avg_view_duration_ms >= HIGH_INTEREST_THRESHOLD_MS,
  );

  const itemsViewedCount = itemViewStats.size;
  const itemsOrderedCount = orderedItemMap.size;
  const menuConversionRate =
    itemsViewedCount > 0 ? itemsOrderedCount / itemsViewedCount : null;

  const totalOrders = orders.length;
  const totalSpend = orders.reduce((s, o) => s + Number(o.subtotal), 0);

  // ── Step 7: Session summary ───────────────────────────────────────────────
  const tp = session.restaurant_touchpoints;
  const touchpointName = tp
    ? tp.section_name ? `${tp.section_name} — ${tp.name}` : tp.name
    : 'Unknown table';

  return {
    session_summary: {
      session_id: session.id,
      status: session.status,
      started_at: session.started_at,
      ended_at: session.ended_at,
      touchpoint_name: touchpointName,
      session_access_code: session.session_access_code,
    },
    timeline,
    viewed_not_ordered: viewedNotOrdered,
    ordered_items: orderedItems,
    derived_metrics: {
      session_duration_seconds: sessionDurationSeconds,
      decision_latency_seconds: decisionLatencySeconds,
      items_viewed_count: itemsViewedCount,
      items_ordered_count: itemsOrderedCount,
      items_viewed_not_ordered: viewedNotOrdered.length,
      high_interest_items_not_ordered: highInterestNotOrdered,
      average_item_view_duration_ms: avgViewDurationMs,
      menu_conversion_rate: menuConversionRate,
      total_orders: totalOrders,
      total_spend: totalSpend,
    },
  };
}

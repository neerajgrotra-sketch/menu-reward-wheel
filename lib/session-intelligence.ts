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
  restaurant_id?: string;
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

export type CartAbandonmentItem = {
  menu_item_id: string | null;
  name: string;
  added_count: number;
  removed_count: number;
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
  // Cart funnel signals
  cart_add_count: number;
  cart_remove_count: number;
  cart_abandonment_items: CartAbandonmentItem[];
  category_path: string[];
  viewed_added_not_ordered: CartAbandonmentItem[];
  added_removed_not_ordered: CartAbandonmentItem[];
};

export type SessionSummary = {
  session_id: string;
  restaurant_id: string | null;
  touchpoint_id: string | null;
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

  // ── Step 5b: Cart funnel — add/remove event aggregation ──────────────────
  // Keyed by menu_item_id (or __name__ fallback for items with null id)
  const cartAddMap = new Map<string, { name: string; addCount: number }>();
  const cartRemoveMap = new Map<string, { name: string; removeCount: number }>();
  const categoryPath: string[] = [];

  for (const ev of sorted) {
    if (ev.event_type === 'ITEM_ADDED_TO_CART') {
      const key = ev.menu_item_id ?? `__name__${(ev.metadata.item_name as string) ?? 'unknown'}`;
      const name = (ev.metadata.item_name as string) ?? 'Unknown item';
      const entry = cartAddMap.get(key) ?? { name, addCount: 0 };
      entry.addCount += 1;
      cartAddMap.set(key, entry);
    }
    if (ev.event_type === 'ITEM_REMOVED_FROM_CART') {
      const key = ev.menu_item_id ?? `__name__${(ev.metadata.item_name as string) ?? 'unknown'}`;
      const name = (ev.metadata.item_name as string) ?? 'Unknown item';
      const entry = cartRemoveMap.get(key) ?? { name, removeCount: 0 };
      entry.removeCount += 1;
      cartRemoveMap.set(key, entry);
    }
    if (ev.event_type === 'CATEGORY_OPENED') {
      const name = (ev.metadata.category_name as string) ?? 'Unknown';
      // Avoid consecutive duplicate entries (e.g. re-click on same tab)
      if (categoryPath[categoryPath.length - 1] !== name) {
        categoryPath.push(name);
      }
    }
  }

  // Items added to cart but not ordered
  const cartAddedIds = new Set(cartAddMap.keys());
  const viewedAddedNotOrdered: CartAbandonmentItem[] = Array.from(cartAddedIds)
    .filter((key) => !orderedItemIdSet.has(key))
    .map((key) => {
      const add = cartAddMap.get(key)!;
      const remove = cartRemoveMap.get(key);
      return {
        menu_item_id: key.startsWith('__name__') ? null : key,
        name: add.name,
        added_count: add.addCount,
        removed_count: remove?.removeCount ?? 0,
      };
    });

  // Items added then removed and never ordered
  const addedRemovedNotOrdered: CartAbandonmentItem[] = Array.from(cartAddedIds)
    .filter((key) => cartRemoveMap.has(key) && !orderedItemIdSet.has(key))
    .map((key) => {
      const add = cartAddMap.get(key)!;
      const remove = cartRemoveMap.get(key)!;
      return {
        menu_item_id: key.startsWith('__name__') ? null : key,
        name: add.name,
        added_count: add.addCount,
        removed_count: remove.removeCount,
      };
    });

  // All items that were ever added (for cart_abandonment_items: added but not ordered)
  const cartAbandonmentItems: CartAbandonmentItem[] = viewedAddedNotOrdered;

  const cartAddCount = sorted.filter((e) => e.event_type === 'ITEM_ADDED_TO_CART').length;
  const cartRemoveCount = sorted.filter((e) => e.event_type === 'ITEM_REMOVED_FROM_CART').length;

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
      restaurant_id: session.restaurant_id ?? null,
      touchpoint_id: tp?.id ?? null,
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
      cart_add_count: cartAddCount,
      cart_remove_count: cartRemoveCount,
      cart_abandonment_items: cartAbandonmentItems,
      category_path: categoryPath,
      viewed_added_not_ordered: viewedAddedNotOrdered,
      added_removed_not_ordered: addedRemovedNotOrdered,
    },
  };
}

// ── Behavioral Intelligence Engine V2 ─────────────────────────────────────────
//
// Infers WHY customer behavior happened, not just WHAT happened.
// Takes reconstructed SessionIntelligence + raw events and produces
// scored behavioral patterns, semantic narratives, and AI-readable insights.

export type AttentionScore = 'dismissed' | 'considered' | 'interested' | 'high_intent';
export type PurchaseStyle = 'impulsive' | 'deliberate' | 'hesitant';
export type DecisionComplexity = 'low' | 'medium' | 'high';

export type ScoredItem = {
  menu_item_id: string | null;
  name: string;
  attention_score: AttentionScore;
  view_duration_ms: number;
  confidence: number;
};

export type BehavioralPattern = {
  hesitation_items: CartAbandonmentItem[];
  high_interest_items: ViewedItem[];
  low_conversion_items: ViewedItem[];
  purchase_style: PurchaseStyle;
  decision_complexity: DecisionComplexity;
  category_preference: string | null;
};

export type TimelineNarrative = {
  timestamp: string;
  sentence: string;
  significance: 'high' | 'medium' | 'low';
};

export type SessionInsight = {
  finding: string;
  recommendation: string | null;
};

export type SessionMetadata = {
  session_id: string;
  restaurant_id: string | null;
  touchpoint_id: string | null;
  start_time: string;
  end_time: string | null;
  device_metadata: Record<string, unknown>;
  guest_uuids: string[];
  event_count: number;
};

export type BehavioralIntelligence = {
  patterns: BehavioralPattern;
  scored_items: ScoredItem[];
  semantic_timeline: TimelineNarrative[];
  insights: SessionInsight[];
  session_metadata: SessionMetadata;
};

// Attention score thresholds (per spec)
// 0–3s → dismissed | 4–12s → considered | 12–25s → interested | 25s+ → high intent
function scoreAttention(avgDurationMs: number): AttentionScore {
  if (avgDurationMs >= 25_001) return 'high_intent';
  if (avgDurationMs >= 12_001) return 'interested';
  if (avgDurationMs >= 3_001) return 'considered';
  return 'dismissed';
}

const SCORE_ORDER: Record<AttentionScore, number> = {
  high_intent: 4,
  interested: 3,
  considered: 2,
  dismissed: 1,
};

export function analyzeSessionBehavior(
  intelligence: SessionIntelligence,
  events: RawSessionEvent[],
): BehavioralIntelligence {
  const m = intelligence.derived_metrics;
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  // ── Rebuild per-item view stats from raw events ──────────────────────────
  const totalDurationMap = new Map<string, number>();
  const viewCountMap = new Map<string, number>();
  const itemNameMap = new Map<string, string>();

  for (const ev of sorted) {
    if (ev.event_type === 'ITEM_VIEW_DURATION' && ev.menu_item_id) {
      const ms = (ev.metadata.duration_ms as number) ?? 0;
      totalDurationMap.set(ev.menu_item_id, (totalDurationMap.get(ev.menu_item_id) ?? 0) + ms);
    }
    if (ev.event_type === 'ITEM_VIEWED' && ev.menu_item_id) {
      viewCountMap.set(ev.menu_item_id, (viewCountMap.get(ev.menu_item_id) ?? 0) + 1);
      const name = (ev.metadata.item_name as string) ?? 'Unknown';
      if (!itemNameMap.has(ev.menu_item_id)) itemNameMap.set(ev.menu_item_id, name);
    }
    if (ev.event_type === 'ITEM_VIEW_DURATION' && ev.menu_item_id) {
      const name = (ev.metadata.item_name as string) ?? 'Unknown';
      if (!itemNameMap.has(ev.menu_item_id)) itemNameMap.set(ev.menu_item_id, name);
    }
  }

  const avgDurationMap = new Map<string, number>();
  Array.from(totalDurationMap.entries()).forEach(([itemId, total]) => {
    const count = viewCountMap.get(itemId) ?? 1;
    avgDurationMap.set(itemId, total / count);
  });

  // ── Ordered item ID set ──────────────────────────────────────────────────
  const orderedItemIdSet = new Set(
    intelligence.ordered_items.filter(i => i.menu_item_id).map(i => i.menu_item_id as string),
  );

  // ── Scored items (all viewed items, ordered by attention) ─────────────────
  const allItemIds = Array.from(
    new Set(Array.from(viewCountMap.keys()).concat(Array.from(totalDurationMap.keys()))),
  );
  const scoredItems: ScoredItem[] = [];

  for (const itemId of allItemIds) {
    const avgDur = avgDurationMap.get(itemId) ?? 0;
    const viewCount = viewCountMap.get(itemId) ?? 1;
    const score = scoreAttention(avgDur);
    const confidence = Math.min(1.0, 0.4 + (avgDur > 0 ? 0.3 : 0) + Math.min(viewCount * 0.1, 0.3));
    scoredItems.push({
      menu_item_id: itemId,
      name: itemNameMap.get(itemId) ?? 'Unknown',
      attention_score: score,
      view_duration_ms: Math.round(avgDur),
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  scoredItems.sort(
    (a, b) =>
      SCORE_ORDER[b.attention_score] - SCORE_ORDER[a.attention_score] ||
      b.view_duration_ms - a.view_duration_ms,
  );

  // ── High interest items: viewed > 15s, not ordered ───────────────────────
  const HIGH_INTEREST_MS = 15_000;
  const highInterestItems: ViewedItem[] = Array.from(avgDurationMap.entries())
    .filter(([itemId, avgDur]) => avgDur >= HIGH_INTEREST_MS && !orderedItemIdSet.has(itemId))
    .map(([itemId, avgDur]) => ({
      menu_item_id: itemId,
      name: itemNameMap.get(itemId) ?? 'Unknown',
      view_count: viewCountMap.get(itemId) ?? 1,
      total_view_duration_ms: totalDurationMap.get(itemId) ?? 0,
      avg_view_duration_ms: avgDur,
    }));
  highInterestItems.sort((a, b) => b.avg_view_duration_ms - a.avg_view_duration_ms);

  // ── Hesitation items: added then removed, never ordered ──────────────────
  const hesitationItems = m.added_removed_not_ordered;

  // ── Category preference: most-visited category ───────────────────────────
  let categoryPreference: string | null = null;
  if (m.category_path.length > 0) {
    const catCounts = new Map<string, number>();
    for (const cat of m.category_path) catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
    let maxCount = 0;
    Array.from(catCounts.entries()).forEach(([cat, count]) => {
      if (count > maxCount) { maxCount = count; categoryPreference = cat; }
    });
  }

  // ── Purchase style ────────────────────────────────────────────────────────
  const isQuickDecision = m.decision_latency_seconds !== null && m.decision_latency_seconds < 90;
  const hasCartRemovals = m.cart_remove_count > 0;
  const manyHighInterestNotOrdered = highInterestItems.length >= 2;

  let purchaseStyle: PurchaseStyle;
  if (isQuickDecision && !hasCartRemovals && m.total_orders > 0) {
    purchaseStyle = 'impulsive';
  } else if (hasCartRemovals || manyHighInterestNotOrdered) {
    purchaseStyle = 'hesitant';
  } else {
    purchaseStyle = 'deliberate';
  }

  // ── Decision complexity ───────────────────────────────────────────────────
  const uniqueCategoriesVisited = new Set(m.category_path).size;
  const totalCartActions = m.cart_add_count + m.cart_remove_count;

  let decisionComplexity: DecisionComplexity;
  if (m.items_viewed_count <= 3 && uniqueCategoriesVisited <= 1 && totalCartActions <= 2) {
    decisionComplexity = 'low';
  } else if (m.items_viewed_count >= 8 || uniqueCategoriesVisited >= 4 || totalCartActions >= 6) {
    decisionComplexity = 'high';
  } else {
    decisionComplexity = 'medium';
  }

  // ── Semantic timeline ─────────────────────────────────────────────────────
  const semanticTimeline: TimelineNarrative[] = [];

  for (const entry of intelligence.timeline) {
    let sentence = '';
    let significance: 'high' | 'medium' | 'low' = 'low';

    switch (entry.event_type) {
      case 'MENU_OPENED':
        sentence = 'Customer opened the menu.';
        break;

      case 'CATEGORY_OPENED': {
        const cat = entry.label.replace(/ opened$/, '');
        sentence = `Customer browsed the ${cat} section.`;
        break;
      }

      case 'ITEM_VIEWED': {
        const itemName = entry.label.replace(/ viewed$/, '');
        const avgDur = entry.menu_item_id ? (avgDurationMap.get(entry.menu_item_id) ?? 0) : 0;
        const durSec = Math.round(avgDur / 1000);
        const wasOrdered = entry.menu_item_id && orderedItemIdSet.has(entry.menu_item_id);

        if (avgDur >= 25_001) {
          sentence = wasOrdered
            ? `Customer spent ${durSec}s on ${itemName} and ordered it — strong conviction.`
            : `Customer strongly considered ${itemName} for ${durSec}s but abandoned before checkout.`;
          significance = 'high';
        } else if (avgDur >= 12_001) {
          sentence = `Customer spent ${durSec}s reviewing ${itemName}.`;
          significance = 'medium';
        } else if (avgDur >= 3_001) {
          sentence = `Customer briefly considered ${itemName} (${durSec}s).`;
        } else if (avgDur > 0) {
          sentence = `Customer glanced at ${itemName}.`;
        } else {
          sentence = `Customer viewed ${itemName}.`;
        }
        break;
      }

      case 'ITEM_ADDED_TO_CART': {
        const name = entry.label.replace(/ added to cart$/, '');
        sentence = `Customer added ${name} to cart.`;
        significance = 'medium';
        break;
      }

      case 'ITEM_REMOVED_FROM_CART': {
        const name = entry.label.replace(/ removed from cart$/, '');
        sentence = `Customer removed ${name} from cart — possible hesitation or substitution.`;
        significance = 'high';
        break;
      }

      case 'ORDER_PLACED':
        sentence = `Customer confirmed an order${entry.detail ? ` (${entry.detail})` : ''}.`;
        significance = 'high';
        break;

      case 'PROMOTION_VIEWED':
        sentence = `Customer viewed${entry.detail ? ` the "${entry.detail}" promotion` : ' a promotion'}.`;
        break;

      case 'PROMOTION_PLAYED':
        sentence = `Customer played the reward wheel${entry.detail ? ` — ${entry.detail}` : ''}.`;
        significance = 'medium';
        break;

      case 'SESSION_ENDED':
        sentence = `Session concluded${entry.detail ? ` — ${entry.detail}` : ''}.`;
        break;

      default:
        sentence = entry.label.charAt(0).toUpperCase() + entry.label.slice(1) + '.';
    }

    if (sentence) semanticTimeline.push({ timestamp: entry.timestamp, sentence, significance });
  }

  // ── AI insights engine ────────────────────────────────────────────────────
  const insights: SessionInsight[] = [];

  // High interest items not ordered (top 3)
  for (const item of highInterestItems.slice(0, 3)) {
    const durSec = Math.round(item.avg_view_duration_ms / 1000);
    insights.push({
      finding: `${item.name} had ${durSec}s of engagement but was not ordered.`,
      recommendation: `Offer a limited-time deal or combo including ${item.name} to close the conversion.`,
    });
  }

  // Hesitation items (top 2)
  for (const item of hesitationItems.slice(0, 2)) {
    insights.push({
      finding: `${item.name} was added to cart then removed — customer showed clear indecision.`,
      recommendation: `Consider a smaller portion or lower price point for ${item.name} to reduce friction.`,
    });
  }

  // Purchase style
  if (purchaseStyle === 'impulsive') {
    insights.push({
      finding: 'Customer ordered quickly with no cart hesitation — high-confidence purchase decision.',
      recommendation: 'Upsell opportunities are strong. Surface premium add-ons at checkout.',
    });
  } else if (purchaseStyle === 'hesitant') {
    insights.push({
      finding: 'Customer showed decision uncertainty across multiple items.',
      recommendation: "A curated 'Chef's Picks' or staff recommendation prompt may help this customer type.",
    });
  } else {
    insights.push({
      finding: 'Customer carefully evaluated options before committing — deliberate purchase style.',
      recommendation: 'Detailed item descriptions and visible ratings support this customer type.',
    });
  }

  // Category preference
  if (categoryPreference) {
    insights.push({
      finding: `Customer spent the most time in the ${categoryPreference} category.`,
      recommendation: `Surface seasonal or featured items from ${categoryPreference} prominently.`,
    });
  }

  // Low conversion signal
  if (m.menu_conversion_rate !== null && m.menu_conversion_rate < 0.3 && m.items_viewed_count >= 4) {
    insights.push({
      finding: `Low menu conversion — ${m.items_viewed_count} items viewed, ${m.items_ordered_count} ordered.`,
      recommendation: 'Item photography or descriptions may need improvement to support decision-making.',
    });
  }

  // Beverage combo opportunity
  const beveragePattern = /tea|coffee|juice|lassi|drink|chai|soda|shake|smoothie|lemonade|beverage|water/i;
  const unconvertedBeverages = highInterestItems.filter(i => beveragePattern.test(i.name));
  if (unconvertedBeverages.length > 0) {
    const names = unconvertedBeverages.map(i => i.name).join(', ');
    insights.push({
      finding: `${names} had strong engagement but failed conversion.`,
      recommendation: 'Offer a beverage combo promotion — pair with the main order for a discount.',
    });
  }

  if (insights.length === 0) {
    insights.push({
      finding: 'Insufficient behavioral data to generate detailed insights for this session.',
      recommendation: null,
    });
  }

  // ── Session metadata ──────────────────────────────────────────────────────
  const guestUuids = Array.from(new Set(
    sorted.map(e => e.guest_id).filter((g): g is string => g !== null),
  ));

  const deviceMetadata: Record<string, unknown> = {};
  for (const ev of sorted) {
    if (ev.metadata.user_agent && !deviceMetadata.user_agent) deviceMetadata.user_agent = ev.metadata.user_agent;
    if (ev.metadata.device_type && !deviceMetadata.device_type) deviceMetadata.device_type = ev.metadata.device_type;
    if (ev.metadata.screen_width && !deviceMetadata.screen_width) deviceMetadata.screen_width = ev.metadata.screen_width;
    if (Object.keys(deviceMetadata).length >= 3) break;
  }

  return {
    patterns: {
      hesitation_items: hesitationItems,
      high_interest_items: highInterestItems,
      low_conversion_items: intelligence.viewed_not_ordered,
      purchase_style: purchaseStyle,
      decision_complexity: decisionComplexity,
      category_preference: categoryPreference,
    },
    scored_items: scoredItems,
    semantic_timeline: semanticTimeline,
    insights,
    session_metadata: {
      session_id: intelligence.session_summary.session_id,
      restaurant_id: intelligence.session_summary.restaurant_id,
      touchpoint_id: intelligence.session_summary.touchpoint_id,
      start_time: intelligence.session_summary.started_at,
      end_time: intelligence.session_summary.ended_at,
      device_metadata: deviceMetadata,
      guest_uuids: guestUuids,
      event_count: events.length,
    },
  };
}

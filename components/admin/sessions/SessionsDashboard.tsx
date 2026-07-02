'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type {
  SessionIntelligence,
  TimelineEntry,
  ViewedItem,
  OrderedItem,
  CartAbandonmentItem,
  BehavioralIntelligence,
  AttentionScore,
  PurchaseStyle,
  DecisionComplexity,
  SessionMetadata,
  GuestSessionSummary,
  EnrichedGuestProfile,
  GuestIdentitySummary,
} from '@/lib/session-intelligence';

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionStatus = 'active' | 'completed' | 'abandoned';

type Touchpoint = {
  id: string;
  name: string;
  type: string;
  section_name: string | null;
  touchpoint_code: string;
};

type VisitSession = {
  id: string;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  last_activity_at: string;
  guest_count: number;
  menu_items_viewed: number;
  orders_count: number;
  promotion_interactions: number;
  coupons_issued: number;
  total_spend: number;
  assigned_ai_agent: string | null;
  restaurant_touchpoints: Touchpoint | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function formatDuration(startIso: string, endIso: string | null): string {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const mins = Math.floor((end - new Date(startIso).getTime()) / 60_000);
  if (mins < 1) return '<1 min';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function formatSeconds(sec: number | null): string {
  if (sec === null) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatPercent(ratio: number | null): string {
  if (ratio === null) return '—';
  return `${Math.round(ratio * 100)}%`;
}

const TAB_LABELS: Record<SessionStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  abandoned: 'Abandoned',
};

// ─── Event type colors ────────────────────────────────────────────────────────

function eventDot(eventType: string): string {
  if (eventType === 'MENU_OPENED') return 'bg-emerald-400';
  if (eventType === 'ITEM_VIEWED') return 'bg-blue-400';
  if (eventType === 'ORDER_PLACED') return 'bg-orange-400';
  if (eventType === 'SESSION_ENDED') return 'bg-stone-400';
  if (eventType.startsWith('PROMOTION')) return 'bg-violet-400';
  if (eventType.includes('CART')) return 'bg-amber-400';
  return 'bg-stone-300';
}

// ─── Intelligence Panel ───────────────────────────────────────────────────────

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-stone-50 px-3 py-2 text-center">
      <span className="text-sm font-black text-stone-900">{value}</span>
      <span className="text-[10px] font-semibold text-stone-400 leading-tight mt-0.5">{label}</span>
    </div>
  );
}

function TimelinePanel({ timeline }: { timeline: TimelineEntry[] }) {
  if (timeline.length === 0) {
    return (
      <p className="text-xs text-stone-400 italic">No behavioral events recorded yet.</p>
    );
  }
  return (
    <div className="space-y-1.5">
      {timeline.map((entry) => (
        <div key={entry.id} className="flex items-start gap-2.5">
          <span className="mt-1.5 shrink-0 text-[10px] font-semibold text-stone-400 w-12 text-right leading-tight">
            {formatTime(entry.timestamp)}
          </span>
          <span className={`mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full ${eventDot(entry.event_type)}`} />
          <div>
            <span className="text-xs font-semibold text-stone-800">{entry.label}</span>
            {entry.detail && (
              <span className="ml-1.5 text-xs text-stone-400">{entry.detail}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ViewedNotOrderedPanel({ items }: { items: ViewedItem[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-stone-400 italic">Everything viewed was ordered.</p>;
  }
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item.menu_item_id ?? item.name} className="flex items-center justify-between gap-2">
          <div>
            <span className="text-xs font-semibold text-stone-800">{item.name}</span>
            {item.view_count > 1 && (
              <span className="ml-1 text-[10px] text-stone-400">×{item.view_count}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {item.avg_view_duration_ms >= 20_000 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-700">
                High interest
              </span>
            )}
            {item.avg_view_duration_ms > 0 && (
              <span className="text-[10px] text-stone-400">{formatMs(item.avg_view_duration_ms)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function OrderedItemsPanel({ items }: { items: OrderedItem[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-stone-400 italic">No items ordered.</p>;
  }
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item.menu_item_id ?? item.name} className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-stone-800">
            {item.name}
            {item.quantity > 1 && (
              <span className="ml-1 text-stone-400">×{item.quantity}</span>
            )}
          </span>
          <span className="shrink-0 text-xs font-semibold text-stone-500">
            ${item.total_spend.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

function CartFunnelPanel({ items, label }: { items: CartAbandonmentItem[]; label: string }) {
  if (items.length === 0) {
    return <p className="text-xs text-stone-400 italic">None.</p>;
  }
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item.menu_item_id ?? item.name} className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-stone-800 truncate">{item.name}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {item.added_count > 0 && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">
                +{item.added_count}
              </span>
            )}
            {item.removed_count > 0 && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-black text-red-600">
                −{item.removed_count}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Behavioral Intelligence Components ───────────────────────────────────────

const PURCHASE_STYLE_CONFIG: Record<PurchaseStyle, { bg: string; text: string; label: string }> = {
  impulsive:  { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Impulsive' },
  deliberate: { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Deliberate' },
  hesitant:   { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Hesitant' },
};

const COMPLEXITY_CONFIG: Record<DecisionComplexity, { bg: string; text: string; label: string }> = {
  low:    { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Simple decision' },
  medium: { bg: 'bg-yellow-100',  text: 'text-yellow-700',  label: 'Moderate complexity' },
  high:   { bg: 'bg-red-100',     text: 'text-red-700',     label: 'Complex decision' },
};

const ATTENTION_CONFIG: Record<AttentionScore, { bg: string; text: string; label: string }> = {
  dismissed:  { bg: 'bg-stone-100',   text: 'text-stone-500',   label: 'Dismissed' },
  considered: { bg: 'bg-blue-50',     text: 'text-blue-600',    label: 'Considered' },
  interested: { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Interested' },
  high_intent:{ bg: 'bg-violet-100',  text: 'text-violet-700',  label: 'High intent' },
};

function BehaviorBadge({ cfg }: { cfg: { bg: string; text: string; label: string } }) {
  return (
    <span className={`rounded-full ${cfg.bg} ${cfg.text} px-2.5 py-1 text-[11px] font-bold`}>
      {cfg.label}
    </span>
  );
}

function AIInsightsPanel({ behavior }: { behavior: BehavioralIntelligence }) {
  const { patterns, scored_items, semantic_timeline, insights } = behavior;

  const keyMoments = semantic_timeline.filter(e => e.significance === 'high' || e.significance === 'medium');

  return (
    <div className="space-y-4">
      {/* Behavior profile */}
      <div>
        <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-stone-400">
          Behavior Profile
        </p>
        <div className="flex flex-wrap gap-2">
          <BehaviorBadge cfg={PURCHASE_STYLE_CONFIG[patterns.purchase_style]} />
          <BehaviorBadge cfg={COMPLEXITY_CONFIG[patterns.decision_complexity]} />
          {patterns.category_preference && (
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-600">
              Focus: {patterns.category_preference}
            </span>
          )}
        </div>
      </div>

      {/* Item attention scores */}
      {scored_items.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-stone-400">
            Item Attention
          </p>
          <div className="space-y-1.5">
            {scored_items.map((item) => (
              <div key={item.menu_item_id ?? item.name} className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-stone-800 truncate">{item.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`rounded-full ${ATTENTION_CONFIG[item.attention_score].bg} ${ATTENTION_CONFIG[item.attention_score].text} px-1.5 py-0.5 text-[10px] font-black`}
                  >
                    {ATTENTION_CONFIG[item.attention_score].label}
                  </span>
                  {item.view_duration_ms > 0 && (
                    <span className="text-[10px] text-stone-400">{formatMs(item.view_duration_ms)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Behavioral narrative (key moments only) */}
      {keyMoments.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-stone-400">
            Behavioral Narrative
          </p>
          <div className="space-y-1.5">
            {keyMoments.map((entry, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  className={`mt-1 shrink-0 h-1.5 w-1.5 rounded-full ${
                    entry.significance === 'high' ? 'bg-orange-400' : 'bg-blue-300'
                  }`}
                />
                <p className="text-xs text-stone-700">{entry.sentence}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI insights — findings + recommendations */}
      {insights.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-stone-400">
            AI Insights
          </p>
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <div key={i} className="rounded-xl bg-stone-50 px-3 py-2.5">
                <p className="text-xs text-stone-700">{insight.finding}</p>
                {insight.recommendation && (
                  <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                    → {insight.recommendation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionMetadataPanel({ metadata }: { metadata: SessionMetadata }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Session ID',     value: metadata.session_id },
    { label: 'Restaurant ID',  value: metadata.restaurant_id ?? '—' },
    { label: 'Touchpoint ID',  value: metadata.touchpoint_id ?? '—' },
    { label: 'Started',        value: new Date(metadata.start_time).toLocaleString() },
    { label: 'Ended',          value: metadata.end_time ? new Date(metadata.end_time).toLocaleString() : 'Active' },
    { label: 'Event count',    value: String(metadata.event_count) },
    { label: 'Devices',        value: metadata.guest_uuids.length > 0 ? `${metadata.guest_uuids.length} device(s)` : '—' },
  ];

  if (metadata.guest_uuids.length > 0) {
    rows.push({ label: 'Guest UUID', value: metadata.guest_uuids[0] });
  }

  const deviceKeys = Object.keys(metadata.device_metadata);

  return (
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-stone-400">
        Session Metadata
      </p>
      <div className="rounded-xl bg-stone-50 px-3 py-2.5 space-y-1">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-start gap-2">
            <span className="shrink-0 w-28 text-[10px] font-semibold text-stone-400">{label}</span>
            <span className="text-[10px] font-mono text-stone-600 break-all">{value}</span>
          </div>
        ))}
        {deviceKeys.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="shrink-0 w-28 text-[10px] font-semibold text-stone-400">Device</span>
            <span className="text-[10px] font-mono text-stone-600 break-all">
              {JSON.stringify(metadata.device_metadata)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Guest Intelligence Panel (V3) ───────────────────────────────────────────

function GuestIntelligencePanel({
  guestProfiles,
  tableSummary,
  identitySummary,
}: {
  guestProfiles: EnrichedGuestProfile[];
  tableSummary: GuestSessionSummary;
  identitySummary?: GuestIdentitySummary;
}) {
  const [expandedGuest, setExpandedGuest] = useState<string | null>(null);

  if (guestProfiles.length === 0) {
    return <p className="text-xs text-stone-400 italic">No per-guest data captured yet.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Identity summary — who is at the table */}
      {identitySummary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricChip label="Connected" value={String(identitySummary.connected_guests)} />
          <MetricChip label="Named" value={String(identitySummary.named_guests)} />
          <MetricChip label="Ordered" value={String(identitySummary.guests_ordered)} />
          <MetricChip label="Not ordered" value={String(identitySummary.guests_not_ordered)} />
        </div>
      )}

      {/* Behavioral table summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricChip label="Cart activity" value={String(tableSummary.guests_with_cart_activity)} />
        <MetricChip label="Hesitating" value={String(tableSummary.guests_showing_hesitation)} />
        <MetricChip label="Partial order" value={tableSummary.partial_table_ordering ? 'Yes' : 'No'} />
        {identitySummary && (
          <MetricChip label="Anonymous" value={String(identitySummary.anonymous_guests)} />
        )}
      </div>

      {(tableSummary.dessert_interest || tableSummary.beverage_interest) && (
        <div className="flex flex-wrap gap-2">
          {tableSummary.dessert_interest && (
            <span className="rounded-full bg-pink-100 px-2.5 py-1 text-[11px] font-bold text-pink-700">
              Dessert interest
            </span>
          )}
          {tableSummary.beverage_interest && (
            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-700">
              Beverage interest
            </span>
          )}
        </div>
      )}

      {/* Cross-guest behavioral insights */}
      {tableSummary.cross_guest_insights.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-stone-400">
            Group Insights
          </p>
          <div className="space-y-1">
            {tableSummary.cross_guest_insights.map((insight, i) => (
              <p key={i} className="text-xs text-stone-600">• {insight}</p>
            ))}
          </div>
        </div>
      )}

      {tableSummary.most_viewed_across_table.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-stone-400">
            Viewed by Multiple Guests
          </p>
          <div className="space-y-1">
            {tableSummary.most_viewed_across_table.map((item) => (
              <div key={item.menu_item_id ?? item.name} className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-stone-800 truncate">{item.name}</span>
                <span className="shrink-0 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-black text-stone-500">
                  {item.viewer_count} guests
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tableSummary.collective_high_interest.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-stone-400">
            Table High Interest
          </p>
          <div className="space-y-1">
            {tableSummary.collective_high_interest.map((item) => (
              <div key={item.menu_item_id ?? item.name} className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-stone-800 truncate">{item.name}</span>
                <span className="text-[10px] text-stone-400">{formatMs(item.avg_view_duration_ms)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-guest profiles */}
      <div>
        <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-stone-400">
          Per-Guest Profiles
        </p>
        <div className="space-y-2">
          {guestProfiles.map((profile, index) => {
            const label = profile.guest_name ?? `Guest ${index + 1}`;
            const isExpanded = expandedGuest === profile.guest_id;
            return (
              <div key={profile.guest_id} className="rounded-xl border border-stone-200 overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setExpandedGuest(isExpanded ? null : profile.guest_id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-black text-stone-700 shrink-0">{label}</span>
                    <BehaviorBadge cfg={PURCHASE_STYLE_CONFIG[profile.purchase_style]} />
                    {profile.attention_score && (
                      <BehaviorBadge cfg={ATTENTION_CONFIG[profile.attention_score]} />
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-stone-400">
                      {profile.items_viewed.length} items · {profile.event_count} events
                      {profile.orders_placed.length > 0 && ` · ${profile.orders_placed.length} order${profile.orders_placed.length !== 1 ? 's' : ''}`}
                    </span>
                    <span className="text-[10px] text-stone-400">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-stone-100 px-3 py-2.5 space-y-3">
                    <BehaviorBadge cfg={COMPLEXITY_CONFIG[profile.decision_complexity]} />

                    {profile.orders_placed.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-stone-400">
                          Orders Placed
                        </p>
                        <div className="space-y-0.5">
                          {profile.orders_placed.map((item, i) => (
                            <p key={i} className="text-xs text-stone-700">
                              • {item.quantity > 1 ? `${item.quantity}× ` : ''}{item.name}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {profile.cart_add_count > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        <MetricChip label="Cart adds" value={String(profile.cart_add_count)} />
                        <MetricChip label="Cart removes" value={String(profile.cart_remove_count)} />
                      </div>
                    )}

                    {profile.high_interest_items.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-stone-400">
                          High Interest
                        </p>
                        <div className="space-y-1">
                          {profile.high_interest_items.map((item) => (
                            <div key={item.menu_item_id ?? item.name} className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-stone-800 truncate">{item.name}</span>
                              <span className="shrink-0 flex items-center gap-1.5">
                                {item.avg_view_duration_ms >= 25_001 && (
                                  <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-black text-violet-700">
                                    High intent
                                  </span>
                                )}
                                <span className="text-[10px] text-stone-400">{formatMs(item.avg_view_duration_ms)}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {profile.hesitation_items.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-stone-400">
                          Hesitation Items
                        </p>
                        <CartFunnelPanel items={profile.hesitation_items} label="Hesitation" />
                      </div>
                    )}

                    {profile.items_viewed.length > 0 && profile.high_interest_items.length === 0 && profile.orders_placed.length === 0 && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-stone-400">
                          Items Viewed
                        </p>
                        <ViewedNotOrderedPanel items={profile.items_viewed} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Intelligence Panel ───────────────────────────────────────────────────────

function IntelligencePanel({ intelligence, behavior, guestProfiles, tableSummary, guestIdentitySummary }: {
  intelligence: SessionIntelligence;
  behavior: BehavioralIntelligence | null;
  guestProfiles?: EnrichedGuestProfile[];
  tableSummary?: GuestSessionSummary;
  guestIdentitySummary?: GuestIdentitySummary;
}) {
  const m = intelligence.derived_metrics;

  return (
    <div className="mt-3 space-y-4 border-t border-stone-100 pt-4">
      {/* Derived metrics strip */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <MetricChip label="Session" value={formatSeconds(m.session_duration_seconds)} />
        <MetricChip label="Decision" value={formatSeconds(m.decision_latency_seconds)} />
        <MetricChip label="Viewed" value={String(m.items_viewed_count)} />
        <MetricChip label="Ordered" value={String(m.items_ordered_count)} />
        <MetricChip label="Avg view time" value={formatMs(m.average_item_view_duration_ms)} />
        <MetricChip label="Conversion" value={formatPercent(m.menu_conversion_rate)} />
      </div>

      {/* Cart funnel metrics strip */}
      {(m.cart_add_count > 0 || m.cart_remove_count > 0) && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricChip label="Cart adds" value={String(m.cart_add_count)} />
          <MetricChip label="Cart removes" value={String(m.cart_remove_count)} />
          <MetricChip label="Added not ordered" value={String(m.viewed_added_not_ordered.length)} />
          <MetricChip label="Add→remove" value={String(m.added_removed_not_ordered.length)} />
        </div>
      )}

      {/* Category path */}
      {m.category_path.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-stone-400">
            Category Path
          </p>
          <p className="text-xs text-stone-600">
            {m.category_path.join(' → ')}
          </p>
        </div>
      )}

      {/* Timeline + three-column item analysis */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Timeline */}
        <div className="sm:col-span-1">
          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-stone-400">
            Session Timeline
          </p>
          <TimelinePanel timeline={intelligence.timeline} />
        </div>

        {/* Viewed not ordered */}
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-stone-400">
            Viewed · Not Ordered
            {m.items_viewed_not_ordered > 0 && (
              <span className="ml-1 text-stone-300">({m.items_viewed_not_ordered})</span>
            )}
          </p>
          <ViewedNotOrderedPanel items={intelligence.viewed_not_ordered} />
        </div>

        {/* Ordered items */}
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-stone-400">
            Ordered
            {m.total_orders > 0 && (
              <span className="ml-1 text-stone-300">
                ({m.total_orders} order{m.total_orders !== 1 ? 's' : ''} · ${m.total_spend.toFixed(2)})
              </span>
            )}
          </p>
          <OrderedItemsPanel items={intelligence.ordered_items} />
        </div>
      </div>

      {/* Cart abandonment detail — only shown when there is cart funnel data */}
      {m.viewed_added_not_ordered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-stone-400">
              Added · Not Ordered
            </p>
            <CartFunnelPanel items={m.viewed_added_not_ordered} label="Added not ordered" />
          </div>
          {m.added_removed_not_ordered.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-stone-400">
                Added then Removed
              </p>
              <CartFunnelPanel items={m.added_removed_not_ordered} label="Added then removed" />
            </div>
          )}
        </div>
      )}

      {/* AI Insights + Session Metadata */}
      {behavior && (
        <>
          <div className="border-t border-stone-100 pt-4">
            <p className="mb-3 text-[10px] font-black uppercase tracking-wider text-stone-400">
              AI Insights
            </p>
            <AIInsightsPanel behavior={behavior} />
          </div>
          <div className="border-t border-stone-100 pt-4">
            <SessionMetadataPanel metadata={behavior.session_metadata} />
          </div>
        </>
      )}

      {/* Guest Intelligence (V3.1) */}
      {guestProfiles && guestProfiles.length > 0 && tableSummary && (
        <div className="border-t border-stone-100 pt-4">
          <p className="mb-3 text-[10px] font-black uppercase tracking-wider text-stone-400">
            Guest Intelligence
          </p>
          <GuestIntelligencePanel
            guestProfiles={guestProfiles}
            tableSummary={tableSummary}
            identitySummary={guestIdentitySummary}
          />
        </div>
      )}
    </div>
  );
}

// ─── Table Status Header ──────────────────────────────────────────────────────
// Shows a pulsing green indicator when the session is active, the table label,
// and a live active guest count sourced from session_guests.

function TableStatusHeader({
  session,
  label,
}: {
  session: VisitSession;
  label: string;
}) {
  const [activeGuests, setActiveGuests] = useState<number | null>(null);

  useEffect(() => {
    if (session.status !== 'active') return;

    async function fetchCount() {
      const res = await fetch(`/api/admin/sessions/${session.id}/guest-count`);
      if (!res.ok) return;
      const payload = await res.json();
      setActiveGuests(payload.count ?? 0);
    }

    fetchCount();

    // Subscribe to session_guests changes for live updates
    const supabase = createClient();

    const channel = supabase
      .channel(`session-presence:${session.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_guests',
          filter: `session_id=eq.${session.id}`,
        },
        () => { fetchCount(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session.id, session.status]);

  const isActive = session.status === 'active';
  const guestDisplay = activeGuests !== null ? activeGuests : session.guest_count;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {isActive && (
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
      )}
      <p className="text-base font-black text-stone-900 truncate">{label}</p>
      {isActive && (
        <span className="shrink-0 flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-black text-stone-600">
          <span>👥</span>
          <span>{guestDisplay}</span>
        </span>
      )}
    </div>
  );
}

// ─── Live Decisions Panel ─────────────────────────────────────────────────────

function LiveInterventionsPanel({
  sessionId,
  isActive,
}: {
  sessionId: string;
  isActive: boolean;
}) {
  type LiveIntervention = {
    id: string;
    opportunity_type: string;
    confidence_score: number;
    reasoning_summary: string;
    status: 'pending' | 'acknowledged' | 'dismissed' | 'expired' | 'converted';
    created_at: string;
    guest_name: string | null;
  };

  const [items, setItems] = useState<LiveIntervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const supabase = createClient();

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/sessions/${sessionId}/interventions`);
    if (res.ok) {
      const data: { interventions?: LiveIntervention[] } = await res.json();
      setItems(data.interventions ?? []);
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    void load();
    if (!isActive) return;
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load, isActive]);

  async function updateStatus(id: string, status: 'acknowledged' | 'dismissed') {
    setActioning(id);
    const update: { status: string; acknowledged_at?: string | null } = { status };
    if (status === 'acknowledged') update.acknowledged_at = new Date().toISOString();
    const { error } = await supabase.from('live_interventions').update(update).eq('id', id);
    if (!error) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    }
    setActioning(null);
  }

  const OPPORTUNITY_LABEL: Record<string, string> = {
    high_interest_no_purchase: 'High Interest',
    dessert_interest_after_main_order: 'Dessert Signal',
    cart_abandonment: 'Cart Abandoned',
    multi_guest_partial_order: 'Partial Orders',
    long_decision_without_cart: 'Long Browse',
    post_order_rebrowse: 'Rebrowse',
  };

  function statusCls(status: string) {
    if (status === 'pending') return 'bg-amber-100 text-amber-800';
    if (status === 'acknowledged') return 'bg-emerald-100 text-emerald-700';
    if (status === 'dismissed') return 'bg-stone-100 text-stone-500';
    if (status === 'converted') return 'bg-violet-100 text-violet-700';
    return 'bg-stone-100 text-stone-400';
  }

  if (loading) return <p className="text-xs text-stone-400">Loading decisions…</p>;

  if (items.length === 0) {
    return (
      <p className="text-xs text-stone-400 italic">
        No decisions dispatched yet for this session.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`rounded-xl border p-3 ${
            item.status === 'pending'
              ? 'border-amber-200 bg-amber-50'
              : 'border-stone-100 bg-stone-50'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-black text-stone-800">
                  {OPPORTUNITY_LABEL[item.opportunity_type] ?? item.opportunity_type}
                </span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${statusCls(item.status)}`}>
                  {item.status}
                </span>
                <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">
                  {Math.round(item.confidence_score * 100)}% confidence
                </span>
                {item.guest_name && (
                  <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                    {item.guest_name}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
                {item.reasoning_summary}
              </p>
              <p className="mt-0.5 text-[10px] text-stone-400">
                {relativeTime(item.created_at)}
              </p>
            </div>
            {item.status === 'pending' && (
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => void updateStatus(item.id, 'acknowledged')}
                  disabled={actioning === item.id}
                  className="rounded-lg bg-emerald-500 px-2 py-1 text-[10px] font-black text-white active:bg-emerald-600 disabled:opacity-50"
                >
                  {actioning === item.id ? '…' : 'Done'}
                </button>
                <button
                  type="button"
                  onClick={() => void updateStatus(item.id, 'dismissed')}
                  disabled={actioning === item.id}
                  className="rounded-lg border border-stone-200 px-2 py-1 text-[10px] font-black text-stone-500 active:bg-stone-100 disabled:opacity-50"
                >
                  Skip
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Session Card ─────────────────────────────────────────────────────────────

function SessionCard({
  session,
  onEnd,
  ending,
}: {
  session: VisitSession;
  onEnd: (id: string) => void;
  ending: boolean;
}) {
  type FullIntelligence = SessionIntelligence & {
    behavior?: BehavioralIntelligence;
    guest_profiles?: EnrichedGuestProfile[];
    table_summary?: GuestSessionSummary;
    guest_identity_summary?: GuestIdentitySummary;
  };
  const [expanded, setExpanded] = useState(false);
  const [intelligence, setIntelligence] = useState<FullIntelligence | null>(null);
  const [loadingIntelligence, setLoadingIntelligence] = useState(false);
  const [intelligenceError, setIntelligenceError] = useState('');

  const tp = session.restaurant_touchpoints;
  const label = tp
    ? tp.section_name ? `${tp.section_name} — ${tp.name}` : tp.name
    : 'Unknown table';

  async function toggleExpand() {
    const next = !expanded;
    setExpanded(next);
    // Lazy-load intelligence on first expand
    if (next && !intelligence && !loadingIntelligence) {
      setLoadingIntelligence(true);
      setIntelligenceError('');
      try {
        const res = await fetch(`/api/admin/sessions/${session.id}/intelligence`);
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || 'Failed to load intelligence.');
        setIntelligence(payload as FullIntelligence);
      } catch (err: unknown) {
        setIntelligenceError(err instanceof Error ? err.message : 'Failed to load.');
      } finally {
        setLoadingIntelligence(false);
      }
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <TableStatusHeader session={session} label={label} />
            <p className="text-xs font-semibold text-stone-400">
              Started {relativeTime(session.started_at)} · {formatDuration(session.started_at, session.ended_at)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {session.status === 'active' && (
              <button
                type="button"
                onClick={() => onEnd(session.id)}
                disabled={ending}
                className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-black text-stone-700 active:bg-stone-100 disabled:opacity-50"
              >
                {ending ? 'Ending…' : 'End Session'}
              </button>
            )}
            <button
              type="button"
              onClick={toggleExpand}
              className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-black text-stone-700 active:bg-stone-100"
              aria-expanded={expanded}
            >
              {expanded ? 'Hide' : 'Intelligence'} {expanded ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-stone-50 p-3 sm:grid-cols-6">
          {[
            { label: 'Guests', value: session.guest_count },
            { label: 'Items Viewed', value: session.menu_items_viewed },
            { label: 'Orders', value: session.orders_count },
            { label: 'Promotions', value: session.promotion_interactions },
            { label: 'Coupons', value: session.coupons_issued },
            { label: 'Spend', value: `$${Number(session.total_spend).toFixed(2)}` },
          ].map(({ label: metricLabel, value }) => (
            <div key={metricLabel} className="text-center">
              <p className="text-base font-black text-stone-800">{value}</p>
              <p className="text-[10px] font-semibold text-stone-400">{metricLabel}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-2 flex items-center gap-3">
          <p className="text-[10px] font-semibold text-stone-400">
            Last activity {relativeTime(session.last_activity_at)}
          </p>
          {session.assigned_ai_agent && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700">
              AI: {session.assigned_ai_agent}
            </span>
          )}
        </div>

        {/* Expanded: Live Decisions + Intelligence */}
        {expanded && (
          <>
            {/* Decision Runtime feed */}
            <div className="mt-3 border-t border-stone-100 pt-4">
              <p className="text-xs font-black uppercase tracking-widest text-stone-500">
                Live Decisions
              </p>
              <div className="mt-2">
                <LiveInterventionsPanel
                  sessionId={session.id}
                  isActive={session.status === 'active'}
                />
              </div>
            </div>

            {/* Intelligence panel */}
            {loadingIntelligence && (
              <div className="mt-3 border-t border-stone-100 pt-4">
                <p className="text-xs text-stone-400">Reconstructing session intelligence…</p>
              </div>
            )}
            {intelligenceError && (
              <div className="mt-3 border-t border-stone-100 pt-4">
                <p className="text-xs text-red-500">{intelligenceError}</p>
              </div>
            )}
            {intelligence && !loadingIntelligence && (
              <IntelligencePanel
                intelligence={intelligence}
                behavior={intelligence.behavior ?? null}
                guestProfiles={intelligence.guest_profiles}
                tableSummary={intelligence.table_summary}
                guestIdentitySummary={intelligence.guest_identity_summary}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({ sessions }: { sessions: VisitSession[] }) {
  const totalGuests = sessions.reduce((s, v) => s + v.guest_count, 0);
  const totalOrders = sessions.reduce((s, v) => s + v.orders_count, 0);
  const totalSpend = sessions.reduce((s, v) => s + Number(v.total_spend), 0);
  const totalCoupons = sessions.reduce((s, v) => s + v.coupons_issued, 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: 'Total Guests', value: totalGuests },
        { label: 'Total Orders', value: totalOrders },
        { label: 'Total Spend', value: `$${totalSpend.toFixed(2)}` },
        { label: 'Coupons Issued', value: totalCoupons },
      ].map(({ label, value }) => (
        <div key={label} className="rounded-2xl border border-stone-100 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-black text-stone-900">{value}</p>
          <p className="mt-0.5 text-xs font-semibold text-stone-400">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Sessions Dashboard ───────────────────────────────────────────────────────
// Tab bar + live session cards + intelligence panels for a single restaurant.
// Rendered by app/admin/sessions/[restaurantId]/page.tsx — restaurant
// selection itself lives one level up on the Dining Intelligence landing page.

export function SessionsDashboard({ restaurantId }: { restaurantId: string }) {
  const [activeTab, setActiveTab] = useState<SessionStatus>('active');
  const [sessions, setSessions] = useState<VisitSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [endingId, setEndingId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(
        `/api/admin/sessions?restaurant_id=${restaurantId}&status=${activeTab}`,
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Failed to load sessions.');
      setSessions(payload.sessions ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId, activeTab]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!restaurantId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-sessions-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'visit_sessions',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => { loadSessions(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, loadSessions]);

  async function handleEndSession(sessionId: string) {
    setEndingId(sessionId);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/end`, { method: 'PATCH' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to end session.');
      }
      await loadSessions();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to end session.');
    } finally {
      setEndingId(null);
    }
  }

  const activeSessions = activeTab === 'active' ? sessions : [];

  return (
    <div className="space-y-6">
      {activeTab === 'active' && activeSessions.length > 0 && (
        <SummaryBar sessions={activeSessions} />
      )}

      <div className="flex gap-1 rounded-2xl border border-stone-200 bg-white p-1 shadow-sm w-fit">
        {(['active', 'completed', 'abandoned'] as SessionStatus[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-xl px-4 py-2 text-sm font-black transition-colors ${
              activeTab === tab
                ? 'bg-stone-900 text-white'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-sm text-stone-400">Loading sessions…</p>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {!loading && !error && sessions.length === 0 && (
        <div className="rounded-2xl border border-stone-100 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-stone-400">
            {activeTab === 'active'
              ? 'No active sessions. Sessions start when a customer scans a table QR code.'
              : `No ${activeTab} sessions yet.`}
          </p>
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <div className="space-y-3">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onEnd={handleEndSession}
              ending={endingId === session.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

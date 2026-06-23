'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

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

type Restaurant = { id: string; name: string };

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

const TAB_LABELS: Record<SessionStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  abandoned: 'Abandoned',
};

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
  const tp = session.restaurant_touchpoints;
  const label = tp
    ? tp.section_name
      ? `${tp.section_name} — ${tp.name}`
      : tp.name
    : 'Unknown table';

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-black text-stone-900">{label}</p>
          <p className="text-xs font-semibold text-stone-400">
            Started {relativeTime(session.started_at)} · {formatDuration(session.started_at, session.ended_at)}
          </p>
        </div>
        {session.status === 'active' && (
          <button
            type="button"
            onClick={() => onEnd(session.id)}
            disabled={ending}
            className="shrink-0 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-black text-stone-700 active:bg-stone-100 disabled:opacity-50"
          >
            {ending ? 'Ending…' : 'End Session'}
          </button>
        )}
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
    </div>
  );
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({ sessions }: { sessions: VisitSession[] }) {
  const totalGuests = sessions.reduce((s, v) => s + v.guest_count, 0);
  const totalOrders = sessions.reduce((s, v) => s + v.orders_count, 0);
  const totalSpend = sessions.reduce((s, v) => s + v.total_spend, 0);
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminSessionsPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<SessionStatus>('active');
  const [sessions, setSessions] = useState<VisitSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [endingId, setEndingId] = useState<string | null>(null);

  // Load restaurants on mount
  useEffect(() => {
    async function loadRestaurants() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data } = await supabase
        .from('restaurants')
        .select('id,name')
        .eq('owner_id', userData.user.id)
        .order('name');

      const list = (data ?? []) as Restaurant[];
      setRestaurants(list);
      if (list.length > 0) setSelectedRestaurantId(list[0].id);
    }
    loadRestaurants();
  }, []);

  // Load sessions when restaurant or tab changes
  const loadSessions = useCallback(async () => {
    if (!selectedRestaurantId) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(
        `/api/admin/sessions?restaurant_id=${selectedRestaurantId}&status=${activeTab}`,
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Failed to load sessions.');
      setSessions(payload.sessions ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId, activeTab]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Realtime: re-fetch on any visit_sessions change for this restaurant
  useEffect(() => {
    if (!selectedRestaurantId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-sessions-${selectedRestaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'visit_sessions',
          filter: `restaurant_id=eq.${selectedRestaurantId}`,
        },
        () => { loadSessions(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedRestaurantId, loadSessions]);

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
    <div className="min-h-screen bg-stone-50 p-4 pb-16 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-black text-stone-900">Sessions</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            Live dining intelligence — track every table in real time
          </p>
        </div>

        {/* Restaurant selector */}
        {restaurants.length > 1 && (
          <select
            value={selectedRestaurantId}
            onChange={(e) => setSelectedRestaurantId(e.target.value)}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-800 shadow-sm focus:outline-none"
          >
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        )}

        {/* Summary bar — active sessions only */}
        {activeTab === 'active' && activeSessions.length > 0 && (
          <SummaryBar sessions={activeSessions} />
        )}

        {/* Tabs */}
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

        {/* Content */}
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
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';

type ActivityEvent = {
  id: string;
  type: 'promotion' | 'coupon_redeemed' | 'order_completed' | 'guest_joined';
  title: string;
  meta: string;
  occurredAt: string;
};

const DOT_COLOR: Record<ActivityEvent['type'], string> = {
  promotion: 'bg-[#FF6B00]',
  coupon_redeemed: 'bg-[#1F8A5B]',
  order_completed: 'bg-[#1F8A5B]',
  guest_joined: 'bg-stone-300',
};

const VISIBLE_DEFAULT = 5;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function RecentActivityTimeline() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch('/api/admin/dashboard-activity', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || 'Could not load recent activity.');
        if (!cancelled) setEvents(payload.events || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load recent activity.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const visibleEvents = expanded ? events : events.slice(0, VISIBLE_DEFAULT);
  const hiddenCount = events.length - visibleEvents.length;

  return (
    <div className="rounded-3xl bg-white p-5 shadow">
      <p className="text-sm font-black text-[#1F1F1F]">Recent activity</p>

      {loading && <p className="mt-3 text-sm font-semibold text-stone-400">Loading activity…</p>}
      {error && <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
      {!loading && !error && events.length === 0 && (
        <p className="mt-3 text-sm font-semibold text-stone-400">Nothing yet — activity will show up here as it happens.</p>
      )}

      {!loading && !error && events.length > 0 && (
        <>
          <ol className="mt-2">
            {visibleEvents.map((event, index) => (
              <li
                key={event.id}
                className={`flex items-start gap-3 py-2.5 ${index < visibleEvents.length - 1 ? 'border-b border-stone-100' : ''}`}
              >
                <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${DOT_COLOR[event.type]}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#1F1F1F]">{event.title}</p>
                  <p className="truncate text-xs font-semibold text-stone-500">{event.meta}</p>
                </div>
                <span className="flex-none pt-0.5 text-xs font-semibold text-stone-400">{timeAgo(event.occurredAt)}</span>
              </li>
            ))}
          </ol>
          {(hiddenCount > 0 || expanded) && events.length > VISIBLE_DEFAULT && (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="mt-2 text-xs font-bold text-[#FF6B00] hover:underline"
            >
              {expanded ? 'Show less' : `Show ${hiddenCount} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

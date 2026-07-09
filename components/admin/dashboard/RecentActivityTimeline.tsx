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

  if (loading) return <p className="text-sm font-semibold text-stone-400">Loading activity…</p>;
  if (error) return <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>;
  if (events.length === 0) {
    return <p className="rounded-3xl bg-white p-4 text-sm font-semibold text-stone-400 shadow">Nothing yet today — activity will show up here as it happens.</p>;
  }

  return (
    <ol className="rounded-3xl bg-white shadow">
      {events.map((event, index) => (
        <li
          key={event.id}
          className={`flex items-start gap-3 px-4 py-3 ${index < events.length - 1 ? 'border-b border-stone-100' : ''}`}
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
  );
}

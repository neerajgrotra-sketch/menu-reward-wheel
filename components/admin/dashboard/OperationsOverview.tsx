'use client';

import { useEffect, useState } from 'react';
import { DashboardIcon, type DashboardIconName } from './icons';

type Health = 'good' | 'warn' | 'bad' | 'neutral';

type Row = {
  label: string;
  icon: DashboardIconName;
  note: string;
  health: Health;
};

type OperationsPayload = {
  orders: { count: number; health: Health; note: string };
  tables: { count: number; health: Health; note: string };
  payments: { count: number; health: Health; note: string };
};

const HEALTH_PILL: Record<Health, { label: string; bg: string; text: string }> = {
  good: { label: 'On track', bg: '#E1F3EA', text: '#1F8A5B' },
  warn: { label: 'Attention', bg: '#FBEDD1', text: '#B4790C' },
  bad: { label: 'Needs attention', bg: '#FBE6E0', text: '#C1442D' },
  neutral: { label: 'Idle', bg: '#F3EBDF', text: '#7A6B59' },
};

type Props = {
  activePromotions: number;
};

export function OperationsOverview({ activePromotions }: Props) {
  const [operations, setOperations] = useState<OperationsPayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch('/api/admin/dashboard-operations', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || 'Could not load operations status.');
        if (!cancelled) setOperations(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load operations status.');
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (error) return <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>;

  const rows: Row[] = [
    {
      label: 'Orders',
      icon: 'list',
      health: operations ? operations.orders.health : 'neutral',
      note: operations?.orders.note ?? 'Loading…',
    },
    {
      label: 'Promotions',
      icon: 'tag',
      health: activePromotions > 0 ? 'good' : 'neutral',
      note: activePromotions > 0 ? `${activePromotions} live` : 'None live',
    },
    {
      label: 'Payments',
      icon: 'card',
      health: operations ? operations.payments.health : 'neutral',
      note: operations?.payments.note ?? 'Loading…',
    },
    {
      label: 'Tables',
      icon: 'grid',
      health: operations ? operations.tables.health : 'neutral',
      note: operations?.tables.note ?? 'Loading…',
    },
  ];

  return (
    <div className="rounded-3xl bg-white p-5 shadow">
      <p className="text-sm font-black text-[#1F1F1F]">Operations</p>
      <ul className="mt-3">
        {rows.map((row, index) => {
          const pill = HEALTH_PILL[row.health];
          return (
            <li
              key={row.label}
              className={`flex items-center gap-3 py-2.5 ${index < rows.length - 1 ? 'border-b border-stone-100' : ''}`}
            >
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#FFF8F0] text-stone-400">
                <DashboardIcon name={row.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[#1F1F1F]">{row.label}</span>
                <span className="block truncate text-xs font-semibold text-stone-500">{row.note}</span>
              </span>
              <span
                className="flex-none rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={{ background: pill.bg, color: pill.text }}
              >
                {pill.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

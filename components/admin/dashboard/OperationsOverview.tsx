'use client';

import { useEffect, useState } from 'react';
import { DashboardIcon, type DashboardIconName } from './icons';

type Health = 'good' | 'warn' | 'bad' | 'neutral';

type Tile = {
  label: string;
  icon: DashboardIconName;
  count: number;
  health: Health;
  note: string;
};

type OperationsPayload = {
  orders: { count: number; health: Health; note: string };
  tables: { count: number; health: Health; note: string };
  payments: { count: number; health: Health; note: string };
};

const HEALTH_DOT: Record<Health, string> = {
  good: 'bg-[#1F8A5B]',
  warn: 'bg-[#B4790C]',
  bad: 'bg-[#C1442D]',
  neutral: 'bg-stone-300',
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

  const tiles: Tile[] = [
    {
      label: 'Orders',
      icon: 'list',
      count: operations?.orders.count ?? 0,
      health: operations ? operations.orders.health : 'neutral',
      note: operations?.orders.note ?? 'Loading…',
    },
    {
      label: 'Promotions',
      icon: 'tag',
      count: activePromotions,
      health: activePromotions > 0 ? 'good' : 'neutral',
      note: activePromotions > 0 ? `${activePromotions} live` : 'None live',
    },
    {
      label: 'Payments',
      icon: 'ticket',
      count: operations?.payments.count ?? 0,
      health: operations ? operations.payments.health : 'neutral',
      note: operations?.payments.note ?? 'Loading…',
    },
    {
      label: 'Tables',
      icon: 'store',
      count: operations?.tables.count ?? 0,
      health: operations ? operations.tables.health : 'neutral',
      note: operations?.tables.note ?? 'Loading…',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-3xl bg-white p-4 shadow">
          <div className="flex items-center justify-between">
            <DashboardIcon name={tile.icon} className="h-4 w-4 text-stone-400" />
            <span className={`h-2 w-2 rounded-full ${HEALTH_DOT[tile.health]}`} aria-hidden="true" />
          </div>
          <p className="mt-2 text-sm font-black text-[#1F1F1F]">{tile.label}</p>
          <p className="mt-0.5 text-xs font-semibold text-stone-500">{tile.note}</p>
        </div>
      ))}
    </div>
  );
}

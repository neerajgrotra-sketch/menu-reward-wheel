'use client';

import type { WeekHours, DayHours } from './types';

const DAYS: Array<{ key: keyof WeekHours; short: string }> = [
  { key: 'monday',    short: 'Mon' },
  { key: 'tuesday',   short: 'Tue' },
  { key: 'wednesday', short: 'Wed' },
  { key: 'thursday',  short: 'Thu' },
  { key: 'friday',    short: 'Fri' },
  { key: 'saturday',  short: 'Sat' },
  { key: 'sunday',    short: 'Sun' },
];

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 6; h < 24; h++) {
    slots.push(`${h.toString().padStart(2, '0')}:00`);
    slots.push(`${h.toString().padStart(2, '0')}:30`);
  }
  for (let h = 0; h <= 3; h++) {
    slots.push(`${h.toString().padStart(2, '0')}:00`);
    if (h < 3) slots.push(`${h.toString().padStart(2, '0')}:30`);
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

function formatTime12(t24: string): string {
  const [hStr, mStr] = t24.split(':');
  const h = parseInt(hStr, 10);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${period}`;
}

type Props = {
  hours: WeekHours;
  onChange: (day: keyof WeekHours, patch: Partial<DayHours>) => void;
};

export function HoursEditor({ hours, onChange }: Props) {
  return (
    <div className="space-y-2">
      {DAYS.map(({ key, short }) => {
        const dh = hours[key];
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="w-9 shrink-0 text-sm font-black text-stone-500">{short}</span>
            <button
              type="button"
              onClick={() => onChange(key, { closed: !dh.closed })}
              className={`w-16 shrink-0 rounded-xl py-1.5 text-xs font-black transition-colors ${dh.closed ? 'bg-stone-100 text-stone-500' : 'bg-green-100 text-green-700'}`}
            >
              {dh.closed ? 'Closed' : 'Open'}
            </button>
            {!dh.closed && (
              <>
                <select
                  value={dh.open}
                  onChange={(e) => onChange(key, { open: e.target.value })}
                  className="min-w-0 flex-1 rounded-xl border border-stone-200 px-2 py-1.5 text-xs font-semibold focus:border-[#FF6B00] focus:outline-none"
                >
                  {TIME_SLOTS.map((t) => <option key={t} value={t}>{formatTime12(t)}</option>)}
                </select>
                <span className="shrink-0 text-xs text-stone-400">–</span>
                <select
                  value={dh.close}
                  onChange={(e) => onChange(key, { close: e.target.value })}
                  className="min-w-0 flex-1 rounded-xl border border-stone-200 px-2 py-1.5 text-xs font-semibold focus:border-[#FF6B00] focus:outline-none"
                >
                  {TIME_SLOTS.map((t) => <option key={t} value={t}>{formatTime12(t)}</option>)}
                </select>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

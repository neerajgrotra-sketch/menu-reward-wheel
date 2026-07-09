import { DashboardIcon } from './icons';

type Props = {
  restaurantName: string;
};

const CONNECTED_SIGNALS = ['Orders', 'Revenue', 'Guests', 'Promotions', 'Coupons'];

export function AiStatusCard({ restaurantName }: Props) {
  return (
    <div className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow">
      <div className="relative flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[#FFF8F0]">
        <div
          className="absolute inset-[-3px] rounded-full opacity-60 [animation:dash-spin_3.2s_linear_infinite]"
          style={{ background: 'conic-gradient(from 0deg, #6C4FD1, transparent 40%, #6C4FD1 100%)' }}
          aria-hidden="true"
        />
        <div className="absolute inset-[3px] rounded-full bg-white" aria-hidden="true" />
        <DashboardIcon name="sparkle" className="relative z-10 h-4 w-4 text-[#6C4FD1]" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-black text-[#1F1F1F]">Reading {restaurantName}, live</p>
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {CONNECTED_SIGNALS.map((signal) => (
            <li key={signal} className="flex items-center gap-1 text-xs font-semibold text-stone-500">
              <DashboardIcon name="check" className="h-3 w-3 text-[#1F8A5B]" />
              {signal}
            </li>
          ))}
        </ul>
      </div>
      <style>
        {'@keyframes dash-spin { to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { [style*="dash-spin"] { animation: none !important; } }'}
      </style>
    </div>
  );
}

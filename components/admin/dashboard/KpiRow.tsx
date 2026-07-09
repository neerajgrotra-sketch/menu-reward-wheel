type Kpi = {
  label: string;
  value: string | number;
  href?: string;
  /** Raw numeric series, oldest → newest, last entry = today. Renders a sparkline + delta vs. the prior average. */
  trend?: number[];
};

type Props = {
  kpis: Kpi[];
};

function Sparkline({ trend }: { trend: number[] }) {
  const max = Math.max(...trend);
  const min = Math.min(...trend);
  const range = max - min;
  const points = trend
    .map((value, index) => {
      const x = (index / (trend.length - 1)) * 100;
      const y = range === 0 ? 15 : 28 - ((value - min) / range) * 26;
      return `${x},${y}`;
    })
    .join(' ');

  const isFlat = range === 0;

  return (
    <svg className="mt-2 h-6 w-full" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={isFlat ? '#D9CFC0' : '#1F8A5B'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrendDelta({ trend }: { trend: number[] }) {
  const today = trend[trend.length - 1];
  const priorDays = trend.slice(0, -1);
  const priorAvg = priorDays.length > 0 ? priorDays.reduce((sum, v) => sum + v, 0) / priorDays.length : 0;

  if (priorAvg === 0) {
    return <p className="mt-1 text-xs font-semibold text-stone-400">{today > 0 ? 'First today' : '7d flat'}</p>;
  }

  const changePct = Math.round(((today - priorAvg) / priorAvg) * 100);
  if (changePct === 0) return <p className="mt-1 text-xs font-semibold text-stone-400">— steady</p>;

  const isUp = changePct > 0;
  return (
    <p className={`mt-1 text-xs font-bold ${isUp ? 'text-[#1F8A5B]' : 'text-[#C1442D]'}`}>
      {isUp ? '▲' : '▼'} {Math.abs(changePct)}% vs. 7d avg
    </p>
  );
}

export function KpiRow({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {kpis.map((kpi) => {
        const content = (
          <>
            <p className="text-2xl font-black text-[#1F1F1F] md:text-3xl">{kpi.value}</p>
            <p className="mt-1 text-xs font-bold text-stone-500">{kpi.label}</p>
            {kpi.trend && kpi.trend.length > 1 && (
              <>
                <Sparkline trend={kpi.trend} />
                <TrendDelta trend={kpi.trend} />
              </>
            )}
          </>
        );
        const className = 'rounded-3xl bg-white p-4 text-center shadow';
        return kpi.href ? (
          <a key={kpi.label} href={kpi.href} className={`${className} transition hover:-translate-y-1 hover:shadow-xl`}>
            {content}
          </a>
        ) : (
          <div key={kpi.label} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

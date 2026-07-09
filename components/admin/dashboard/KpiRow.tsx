type Kpi = {
  label: string;
  value: string | number;
  href?: string;
};

type Props = {
  kpis: Kpi[];
};

export function KpiRow({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {kpis.map((kpi) => {
        const content = (
          <>
            <p className="text-2xl font-black text-[#1F1F1F] md:text-3xl">{kpi.value}</p>
            <p className="mt-1 text-xs font-bold text-stone-500">{kpi.label}</p>
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

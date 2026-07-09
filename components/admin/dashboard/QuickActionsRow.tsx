import { DashboardIcon, type DashboardIconName } from './icons';

type Action = {
  label: string;
  href: string;
  icon: DashboardIconName;
};

type Props = {
  actions: Action[];
};

export function QuickActionsRow({ actions }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <a
          key={action.label}
          href={action.href}
          className="flex items-center gap-2 rounded-full border border-stone-200 bg-white py-2.5 pl-2.5 pr-3.5 text-sm font-bold text-stone-600 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:text-[#1F1F1F]"
        >
          <DashboardIcon name={action.icon} className="h-4 w-4 text-stone-400" />
          {action.label}
        </a>
      ))}
    </div>
  );
}

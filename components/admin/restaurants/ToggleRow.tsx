'use client';

type Props = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
};

export function ToggleRow({ label, description, checked, onChange, disabled }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-stone-100 p-4">
      <div className="min-w-0">
        <p className="text-sm font-black text-[#1F1F1F]">{label}</p>
        <p className="mt-0.5 text-xs font-semibold leading-5 text-stone-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[#FF6B00] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${checked ? 'bg-[#FF6B00]' : 'bg-stone-200'}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
}

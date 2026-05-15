'use client';

export type PromotionMetadataSectionProps = {
  label: string;
  name: string;
  onNameChange: (name: string) => void;
};

export function PromotionMetadataSection({
  label,
  name,
  onNameChange,
}: PromotionMetadataSectionProps) {
  return (
    <section className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
      <p className="text-sm font-black uppercase text-[#FF6B00]">{label}</p>
      <input
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="Halloween, Lunch Rush, Weekend Spin..."
        className="mt-3 w-full rounded-2xl border border-stone-200 px-4 py-4 font-semibold outline-none focus:border-[#FF6B00]"
      />
    </section>
  );
}

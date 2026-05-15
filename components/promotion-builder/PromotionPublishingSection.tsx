'use client';

export type PromotionPublishingSectionProps = {
  title: string;
  saving: boolean;
  disabled: boolean;
  onPublish: () => void;
};

export function PromotionPublishingSection({
  title,
  saving,
  disabled,
  onPublish,
}: PromotionPublishingSectionProps) {
  return (
    <section className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
      <p className="text-sm font-black uppercase text-[#FF6B00]">Step 4: {title}</p>
      <button
        onClick={onPublish}
        disabled={disabled}
        className="mt-3 w-full rounded-3xl bg-green-600 px-5 py-5 text-xl font-black text-white shadow-xl disabled:bg-stone-400"
      >
        {saving ? 'Creating...' : title}
      </button>
    </section>
  );
}

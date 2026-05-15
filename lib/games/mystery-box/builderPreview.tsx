'use client';

export default function MysteryBoxBuilderPreview() {
  return (
    <div className="grid grid-cols-3 gap-3 rounded-3xl bg-orange-50 p-5">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="flex h-24 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF6B00] to-[#E63939] text-4xl shadow-lg"
        >
          🎁
        </div>
      ))}
    </div>
  );
}

'use client';

export function AddRestaurantTile() {
  return (
    <a
      href="/setup"
      className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-orange-200 bg-orange-50/50 text-center shadow-xl transition hover:-translate-y-1 hover:border-[#FF6B00] hover:bg-orange-50"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FF6B00] text-3xl font-black text-white">+</span>
      <p className="text-xl font-black text-[#FF6B00]">Add Restaurant</p>
    </a>
  );
}

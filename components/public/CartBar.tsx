'use client';

type CartBarProps = {
  itemCount: number;
  subtotal: number;
  brandColor: string;
  onOpen: () => void;
};

export function CartBar({ itemCount, subtotal, brandColor, onOpen }: CartBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-safe-bottom pb-4">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between rounded-2xl px-5 py-4 text-white shadow-2xl active:opacity-80"
        style={{ backgroundColor: brandColor }}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-sm font-black">
            {itemCount}
          </span>
          <span className="text-sm font-black">View Order</span>
        </div>
        <span className="text-sm font-black">${Number(subtotal).toFixed(2)}</span>
      </button>
    </div>
  );
}

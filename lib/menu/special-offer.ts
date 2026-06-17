// Special Offer Engine — server-side helpers
// Rule 52: all pricing logic lives here, never in React components.
// Rule 54: future AI can call these functions directly.

export type SpecialOfferItem = {
  special_enabled: boolean;
  special_type: string | null;
  special_percent: number | null;
  special_price: number | null;
  special_start_at: string | null;
  special_end_at: string | null;
  special_no_expiry: boolean;
};

export function isSpecialOfferActive(item: SpecialOfferItem, now: Date = new Date()): boolean {
  if (!item.special_enabled) return false;
  if (item.special_no_expiry) return true;
  if (!item.special_start_at) return false;
  if (now < new Date(item.special_start_at)) return false;
  if (item.special_end_at && now > new Date(item.special_end_at)) return false;
  return true;
}

export function calculateSpecialPrice(
  originalPrice: number,
  type: string,
  percent: number | null,
  specialPrice: number | null,
): number {
  if (type === 'percentage' && percent != null) {
    return Math.round(originalPrice * (1 - percent / 100) * 100) / 100;
  }
  if (type === 'fixed_price' && specialPrice != null) {
    return specialPrice;
  }
  return originalPrice;
}

export function getDiscountLabel(
  originalPrice: number,
  type: string,
  percent: number | null,
  specialPrice: number | null,
): string {
  if (type === 'percentage' && percent != null) {
    return `${percent}% OFF`;
  }
  if (type === 'fixed_price' && specialPrice != null) {
    const saved = originalPrice - specialPrice;
    if (saved > 0) return `Save $${saved.toFixed(2)}`;
    return 'Special Price';
  }
  return 'On Special';
}

// Fallback tax/service-fee rates used when a restaurant has not set
// restaurant_settings.tax_rate_percent / service_fee_percent. Both default to
// zero — the platform makes no assumption about a restaurant's jurisdiction
// or fee policy; owners opt into non-zero values explicitly.
export const DEFAULT_TAX_RATE_PERCENT = 0;
export const DEFAULT_SERVICE_FEE_PERCENT = 0;

export const TIP_PERCENT_OPTIONS = [10, 15, 18] as const;
export type TipPercentOption = (typeof TIP_PERCENT_OPTIONS)[number];

export function isTipPercentOption(value: unknown): value is TipPercentOption {
  return typeof value === 'number' && (TIP_PERCENT_OPTIONS as readonly number[]).includes(value);
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

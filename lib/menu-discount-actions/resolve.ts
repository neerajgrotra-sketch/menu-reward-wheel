// Turns a parsed MenuDiscountAction (which references menu content by name,
// never by ID — see lib/intelligence/actions/menu-discount-schema.ts) into a
// concrete before/after preview against a restaurant's real menu data. Pure
// data logic, no AI calls and no writes — safe to run on every request.
//
// The discount's schedule ("after 7 PM") is deliberately NOT parsed here.
// "19:00" only means something relative to the restaurant's local time, and
// this module may run in a server runtime with a different timezone than the
// restaurant — the caller resolves DiscountSpec.startTime into concrete
// specialStartAt/specialEndAt timestamps in the browser (where the admin's
// local time is a reasonable proxy for the restaurant's) before calling in.

import type { MenuCategoryRow, MenuItemRow } from '@/lib/menu/queries';
import type { DiscountTarget } from '@/lib/intelligence/actions/menu-discount-schema';

export type ResolvedDiscountSpec = {
  discountType: 'percentage' | 'fixed_price';
  value: number;
  specialStartAt: string | null;
  specialEndAt: string | null;
  specialNoExpiry: boolean;
};

export type ResolvableAction =
  | { type: 'clear_discount'; target: DiscountTarget }
  | { type: 'set_discount'; target: DiscountTarget; discount: ResolvedDiscountSpec };

export type ResolvedDiscountItem = {
  id: string;
  name: string;
  categoryName: string;
  price: number | null;
  before: {
    specialEnabled: boolean;
    specialType: 'percentage' | 'fixed_price' | null;
    specialPercent: number | null;
    specialPrice: number | null;
  };
  after: {
    specialEnabled: boolean;
    specialType: 'percentage' | 'fixed_price' | null;
    specialPercent: number | null;
    specialPrice: number | null;
    specialStartAt: string | null;
    specialEndAt: string | null;
    specialNoExpiry: boolean;
  };
};

export type ResolveResult =
  | { resolved: true; items: ResolvedDiscountItem[] }
  | { resolved: false; reason: string; candidates?: string[] };

// Local, intentionally minimal runtime guard — deliberately not shared with
// lib/intelligence/actions/menu-discount-schema.ts's isDiscountTarget, which
// checks the AI-facing DiscountSpec (raw startTime string), a different shape
// than ResolvedDiscountSpec (concrete timestamps) used here.
export function isResolvableAction(value: unknown): value is ResolvableAction {
  if (typeof value !== 'object' || value === null) return false;
  const action = value as Record<string, unknown>;
  const target = action.target as Record<string, unknown> | undefined;
  const validTarget =
    typeof target === 'object' &&
    target !== null &&
    (target.scope === 'all' ||
      ((target.scope === 'category' || target.scope === 'item') && typeof target.name === 'string' && target.name.trim().length > 0));
  if (!validTarget) return false;

  if (action.type === 'clear_discount') return true;

  if (action.type === 'set_discount') {
    const discount = action.discount as Record<string, unknown> | undefined;
    if (typeof discount !== 'object' || discount === null) return false;
    if (discount.discountType !== 'percentage' && discount.discountType !== 'fixed_price') return false;
    if (typeof discount.value !== 'number' || !Number.isFinite(discount.value) || discount.value <= 0) return false;
    if (discount.specialStartAt !== null && typeof discount.specialStartAt !== 'string') return false;
    if (discount.specialEndAt !== null && typeof discount.specialEndAt !== 'string') return false;
    if (typeof discount.specialNoExpiry !== 'boolean') return false;
    return true;
  }

  return false;
}

function matchByName<T extends { name: string }>(rows: T[], query: string): T[] {
  const normalized = query.trim().toLowerCase();
  const exact = rows.filter((r) => r.name.trim().toLowerCase() === normalized);
  if (exact.length > 0) return exact;
  return rows.filter((r) => r.name.toLowerCase().includes(normalized) || normalized.includes(r.name.toLowerCase()));
}

function resolveTargetItems(
  target: DiscountTarget,
  categories: MenuCategoryRow[],
  items: MenuItemRow[],
): { items: MenuItemRow[] } | { reason: string; candidates?: string[] } {
  if (target.scope === 'all') return { items };

  if (target.scope === 'category') {
    const matches = matchByName(categories, target.name);
    if (matches.length === 0) return { reason: `No category found matching "${target.name}".` };
    if (matches.length > 1) {
      return { reason: `Multiple categories match "${target.name}" — be more specific.`, candidates: matches.map((c) => c.name) };
    }
    const categoryId = matches[0].id;
    return { items: items.filter((i) => i.category_id === categoryId) };
  }

  const matches = matchByName(items, target.name);
  if (matches.length === 0) return { reason: `No menu item found matching "${target.name}".` };
  if (matches.length > 1) {
    return { reason: `Multiple items match "${target.name}" — be more specific.`, candidates: matches.map((i) => i.name) };
  }
  return { items: matches };
}

export function resolveMenuDiscountAction(
  action: ResolvableAction,
  categories: MenuCategoryRow[],
  items: MenuItemRow[],
): ResolveResult {
  const targetResult = resolveTargetItems(action.target, categories, items);
  if ('reason' in targetResult) return { resolved: false, reason: targetResult.reason, candidates: targetResult.candidates };

  let candidates = targetResult.items;

  if (action.type === 'clear_discount') {
    candidates = candidates.filter((item) => item.special_enabled);
    if (candidates.length === 0) return { resolved: false, reason: 'No matching items currently have a discount to remove.' };
  }

  if (action.type === 'set_discount' && action.discount.discountType === 'fixed_price') {
    // A "discount" that isn't actually lower than the current price is nonsensical.
    candidates = candidates.filter((item) => item.price === null || action.discount.value < item.price);
    if (candidates.length === 0) {
      return { resolved: false, reason: 'The requested fixed price is not lower than the current price for any matching item.' };
    }
  }

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const resolvedItems: ResolvedDiscountItem[] = candidates.map((item) => {
    const before = {
      specialEnabled: item.special_enabled,
      specialType: item.special_type as 'percentage' | 'fixed_price' | null,
      specialPercent: item.special_percent,
      specialPrice: item.special_price,
    };
    const after =
      action.type === 'clear_discount'
        ? {
            specialEnabled: false,
            specialType: null,
            specialPercent: null,
            specialPrice: null,
            specialStartAt: null,
            specialEndAt: null,
            specialNoExpiry: false,
          }
        : {
            specialEnabled: true,
            specialType: action.discount.discountType,
            specialPercent: action.discount.discountType === 'percentage' ? action.discount.value : null,
            specialPrice: action.discount.discountType === 'fixed_price' ? action.discount.value : null,
            specialStartAt: action.discount.specialStartAt,
            specialEndAt: action.discount.specialEndAt,
            specialNoExpiry: action.discount.specialNoExpiry,
          };
    return {
      id: item.id,
      name: item.name,
      categoryName: categoryNameById.get(item.category_id) || '',
      price: item.price,
      before,
      after,
    };
  });

  return { resolved: true, items: resolvedItems };
}

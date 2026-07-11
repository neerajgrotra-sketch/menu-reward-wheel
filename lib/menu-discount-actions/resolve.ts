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
import { isDiscountTarget, type DiscountTarget } from '@/lib/intelligence/actions/menu-discount-schema';

export type ResolvedDiscountSpec = {
  discountType: 'percentage' | 'fixed_price';
  value: number;
  specialStartAt: string | null;
  specialEndAt: string | null;
  specialNoExpiry: boolean;
  // V2: true when the AI supplied a non-empty startTime that didn't parse as
  // strict 24-hour "HH:MM" — specialStartAt is still null (same fallback to
  // "starts immediately" as Phase 1), but this makes that fallback visible
  // instead of silent. Surfaced as a Proposal warning, not a new UI element.
  startTimeParseFailed?: boolean;
};

export type ResolvableAction =
  | { type: 'clear_discount'; target: DiscountTarget }
  | { type: 'set_discount'; target: DiscountTarget; discount: ResolvedDiscountSpec };

export type ResolvedDiscountItem = {
  id: string;
  name: string;
  categoryId: string;
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

// V2: how the target was resolved — the raw fact confidence scoring
// (lib/restaurant-planner/proposal.ts's computeConfidence) is derived from.
// 'category_exact'/'item_exact' preserve exactly what Phase 1 always did
// (the only tiers that existed before); the rest are new.
export type MatchKind =
  | 'all'
  | 'category_exact'
  | 'category_substring'
  | 'item_exact'
  | 'item_substring'
  | 'items_explicit'
  | 'name_contains';

export type ResolveResult =
  | { resolved: true; items: ResolvedDiscountItem[]; matchKind: MatchKind }
  | { resolved: false; reason: string; candidates?: string[] };

// The target portion reuses isDiscountTarget from menu-discount-schema.ts
// (ResolvableAction's target field is that exact DiscountTarget type) — only
// the discount portion is checked here, since ResolvedDiscountSpec (concrete
// specialStartAt/specialEndAt timestamps) is a genuinely different shape
// from the AI-facing DiscountSpec (raw startTime string) that file validates.
export function isResolvableAction(value: unknown): value is ResolvableAction {
  if (typeof value !== 'object' || value === null) return false;
  const action = value as Record<string, unknown>;
  if (!isDiscountTarget(action.target)) return false;

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

// V2: also reports whether the hit came from the exact tier or the
// substring-fallback tier — feeds confidence scoring. Return shape is
// additive (an extra `exact` field); every existing call site that only
// destructured `.rows`/used the old array-only return has been updated
// below, so this is not a silent behavior change for any caller.
//
// Exported (Restaurant Tool Library) so lib/restaurant-planner/tools/menu.ts's
// searchMenuItems/searchMenuCategories can reuse this exact matching
// primitive instead of reimplementing it — the single source of truth for
// "does this name match that row" stays here.
export function matchByName<T extends { name: string }>(rows: T[], query: string): { rows: T[]; exact: boolean } {
  const normalized = query.trim().toLowerCase();
  const exact = rows.filter((r) => r.name.trim().toLowerCase() === normalized);
  if (exact.length > 0) return { rows: exact, exact: true };
  return { rows: rows.filter((r) => r.name.toLowerCase().includes(normalized) || normalized.includes(r.name.toLowerCase())), exact: false };
}

// Items whose name exact-or-substring matches any entry in `exclude` are
// dropped. Shared by scope 'category' and 'name_contains' — the only two
// scopes that accept an exclude list.
function applyExclude(candidates: MenuItemRow[], exclude: string[] | undefined): MenuItemRow[] {
  if (!exclude || exclude.length === 0) return candidates;
  const normalizedExcludes = exclude.map((e) => e.trim().toLowerCase());
  return candidates.filter((item) => {
    const name = item.name.trim().toLowerCase();
    return !normalizedExcludes.some((ex) => name === ex || name.includes(ex) || ex.includes(name));
  });
}

function resolveTargetItems(
  target: DiscountTarget,
  categories: MenuCategoryRow[],
  items: MenuItemRow[],
): { items: MenuItemRow[]; matchKind: MatchKind } | { reason: string; candidates?: string[] } {
  if (target.scope === 'all') return { items, matchKind: 'all' };

  if (target.scope === 'category') {
    const { rows: matches, exact } = matchByName(categories, target.name);
    if (matches.length === 0) return { reason: `No category found matching "${target.name}".` };
    if (matches.length > 1) {
      return { reason: `Multiple categories match "${target.name}" — be more specific.`, candidates: matches.map((c) => c.name) };
    }
    const categoryId = matches[0].id;
    const resolved = applyExclude(items.filter((i) => i.category_id === categoryId), target.exclude);
    if (resolved.length === 0) return { reason: `Every item in "${matches[0].name}" was excluded — nothing left to change.` };
    return { items: resolved, matchKind: exact ? 'category_exact' : 'category_substring' };
  }

  if (target.scope === 'items') {
    const problems: string[] = [];
    const resolvedById = new Map<string, MenuItemRow>();
    for (const name of target.names) {
      const { rows: matches } = matchByName(items, name);
      if (matches.length === 0) problems.push(`No menu item found matching "${name}".`);
      else if (matches.length > 1) problems.push(`"${name}" matches more than one item (${matches.map((m) => m.name).join(', ')}) — be more specific.`);
      else resolvedById.set(matches[0].id, matches[0]);
    }
    if (problems.length > 0) {
      return { reason: problems.join(' '), candidates: Array.from(resolvedById.values()).map((i) => i.name) };
    }
    return { items: Array.from(resolvedById.values()), matchKind: 'items_explicit' };
  }

  if (target.scope === 'name_contains') {
    const normalized = target.query.trim().toLowerCase();
    const matches = items.filter((i) => i.name.toLowerCase().includes(normalized) || normalized.includes(i.name.toLowerCase()));
    const resolved = applyExclude(matches, target.exclude);
    if (resolved.length === 0) return { reason: `No menu item found matching "${target.query}".` };
    return { items: resolved, matchKind: 'name_contains' };
  }

  // scope === 'item' — the one case where >1 real matches is intentionally
  // still treated as ambiguous, unlike 'name_contains'. This is the exact
  // Phase 1 behavior, unchanged.
  const { rows: matches, exact } = matchByName(items, target.name);
  if (matches.length === 0) return { reason: `No menu item found matching "${target.name}".` };
  if (matches.length > 1) {
    return { reason: `Multiple items match "${target.name}" — be more specific.`, candidates: matches.map((i) => i.name) };
  }
  return { items: matches, matchKind: exact ? 'item_exact' : 'item_substring' };
}

export function resolveMenuDiscountAction(
  action: ResolvableAction,
  categories: MenuCategoryRow[],
  items: MenuItemRow[],
): ResolveResult {
  const targetResult = resolveTargetItems(action.target, categories, items);
  if ('reason' in targetResult) return { resolved: false, reason: targetResult.reason, candidates: targetResult.candidates };

  const { matchKind } = targetResult;
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
      categoryId: item.category_id,
      categoryName: categoryNameById.get(item.category_id) || '',
      price: item.price,
      before,
      after,
    };
  });

  return { resolved: true, items: resolvedItems, matchKind };
}

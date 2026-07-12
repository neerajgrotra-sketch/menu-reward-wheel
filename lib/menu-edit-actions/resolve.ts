// Turns a parsed MenuEditAction (which references menu content by name,
// never by ID — see lib/intelligence/actions/menu-edit-schema.ts) into a
// concrete before/after preview against a restaurant's real menu data. Pure
// data logic, no AI calls and no writes — safe to run on every request. This
// is the menu_edit sibling of lib/menu-discount-actions/resolve.ts.
//
// Deliberately does NOT import DiscountTarget/resolveTargetItems from
// menu-discount-actions/resolve.ts, even though the target-scope shape is
// structurally identical — see menu-edit-schema.ts's header comment. It
// DOES import matchByName from there: that helper is already an
// established, capability-agnostic, read-only export (tools/menu.ts already
// reuses it the same way) — importing it a second time costs zero changes
// to menu_pricing's files.

import type { MenuCategoryRow, MenuItemRow } from '@/lib/menu/queries';
import { matchByName } from '@/lib/menu-discount-actions/resolve';
import { isMenuEditTarget, type MenuEditAction, type MenuEditTarget } from '@/lib/intelligence/actions/menu-edit-schema';

// The fields any single MenuEditAction can touch. Before/after snapshots on
// a resolved item only ever carry the subset relevant to that action's
// type — e.g. a rename's before/after only has `name` — so
// applyMenuEditProposal can pass `after` straight into a menu_items
// `.update()` call without writing untouched columns.
export type EditPatch = Partial<{
  name: string;
  price: number | null;
  description: string | null;
  category_id: string;
  available: boolean;
  is_featured: boolean;
  tags: string[];
}>;

export type ResolvedMenuEditItem = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  before: EditPatch;
  after: EditPatch;
  // Display-only, move_category-only: human-readable category names for
  // the before/after diff. NOT part of before/after (those only ever hold
  // real menu_items columns — before.category_id/after.category_id — since
  // applyMenuEditProposal passes `after` straight into a menu_items
  // `.update()` call; adding a display label there would attempt to write
  // a nonexistent column).
  categoryChange?: { before: string; after: string };
};

// Mirrors lib/menu-discount-actions/resolve.ts's MatchKind exactly (same
// tiers, same meaning) but redefined independently rather than imported —
// same reasoning as MenuEditTarget above.
export type MatchKind =
  | 'all'
  | 'category_exact'
  | 'category_substring'
  | 'item_exact'
  | 'item_substring'
  | 'items_explicit'
  | 'name_contains';

export type MenuEditResolveResult =
  | { resolved: true; items: ResolvedMenuEditItem[]; matchKind: MatchKind }
  | { resolved: false; reason: string; candidates?: string[] };

export function isResolvableMenuEditAction(value: unknown): value is MenuEditAction {
  if (typeof value !== 'object' || value === null) return false;
  const action = value as Record<string, unknown>;
  return isMenuEditTarget(action.target);
}

function applyExclude(candidates: MenuItemRow[], exclude: string[] | undefined): MenuItemRow[] {
  if (!exclude || exclude.length === 0) return candidates;
  const normalizedExcludes = exclude.map((e) => e.trim().toLowerCase());
  return candidates.filter((item) => {
    const name = item.name.trim().toLowerCase();
    return !normalizedExcludes.some((ex) => name === ex || name.includes(ex) || ex.includes(name));
  });
}

function resolveTargetItems(
  target: MenuEditTarget,
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

  // scope === 'item' — >1 real matches is intentionally still ambiguous,
  // same as menu_pricing's identical rule.
  const { rows: matches, exact } = matchByName(items, target.name);
  if (matches.length === 0) return { reason: `No menu item found matching "${target.name}".` };
  if (matches.length > 1) {
    return { reason: `Multiple items match "${target.name}" — be more specific.`, candidates: matches.map((i) => i.name) };
  }
  return { items: matches, matchKind: exact ? 'item_exact' : 'item_substring' };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeAdjustedPrice(current: number, action: Extract<MenuEditAction, { type: 'adjust_price' }>): number {
  const { direction, amount } = action.adjustment;
  const delta = amount.kind === 'percentage' ? current * (amount.value / 100) : amount.value;
  const signed = direction === 'increase' ? current + delta : current - delta;
  return roundCurrency(signed);
}

function resolveDestinationCategory(
  toCategoryName: string,
  categories: MenuCategoryRow[],
): { category: MenuCategoryRow } | { reason: string; candidates?: string[] } {
  const { rows: matches } = matchByName(categories, toCategoryName);
  if (matches.length === 0) return { reason: `No category found matching "${toCategoryName}".` };
  if (matches.length > 1) {
    return { reason: `Multiple categories match "${toCategoryName}" — be more specific.`, candidates: matches.map((c) => c.name) };
  }
  return { category: matches[0] };
}

// Bulk Edit Safety: rename_item and update_description are the only two
// action types where "apply the same treatment to every matched item" is
// NOT correct bulk semantics — a rename/description is a single literal
// string, applied identically to every item a scope resolves to, unlike
// set_price/adjust_price/set_availability/set_tag, where the same rule
// genuinely does apply correctly per item (each keeps its own price base,
// or all become featured — both sensible). Found during the menu_edit
// pre-merge audit: nothing previously stopped a category/all/name_contains
// scope from silently setting every matched item's name or description to
// the exact same text.
const NEEDS_EXPLICIT_BULK_TARGET = new Set<MenuEditAction['type']>(['rename_item', 'update_description']);

export function resolveMenuEditAction(
  action: MenuEditAction,
  categories: MenuCategoryRow[],
  items: MenuItemRow[],
  opts?: { bulkConfirmed?: boolean },
): MenuEditResolveResult {
  const targetResult = resolveTargetItems(action.target, categories, items);
  if ('reason' in targetResult) return { resolved: false, reason: targetResult.reason, candidates: targetResult.candidates };

  const { matchKind } = targetResult;
  let candidates = targetResult.items;

  // Requires an explicit owner choice before a proposal is ever generated —
  // "apply to all" (re-submitted as an explicit scope:'items' list via
  // TargetSelector, bulkConfirmed:true) or a narrowed selection. Never
  // silently proceeds with N items all getting the same literal text.
  if (NEEDS_EXPLICIT_BULK_TARGET.has(action.type) && !opts?.bulkConfirmed && candidates.length > 1) {
    const valueLabel = action.type === 'rename_item' ? `renaming to "${action.name}"` : 'the new description';
    return {
      resolved: false,
      reason: `This would apply ${valueLabel} identically to all ${candidates.length} matched items. Choose "Apply to all" to confirm that's intended, or select specific items to narrow it down.`,
      candidates: candidates.map((c) => c.name),
    };
  }

  // move_category resolves its destination once, up front — a target-item
  // problem and a destination problem are both possible, but the target
  // resolution above already ran, so only the destination can still fail
  // here.
  let destinationCategory: MenuCategoryRow | null = null;
  if (action.type === 'move_category') {
    const destResult = resolveDestinationCategory(action.toCategoryName, categories);
    if ('reason' in destResult) return { resolved: false, reason: destResult.reason, candidates: destResult.candidates };
    destinationCategory = destResult.category;
  }

  // adjust_price: items with no price can't be adjusted, and a decrease
  // that would take a price to $0 or below is nonsensical — both filtered
  // out rather than silently clamped, same "don't guess, don't fabricate"
  // posture as menu_pricing's fixed_price < current-price filter.
  if (action.type === 'adjust_price') {
    candidates = candidates.filter((item) => {
      if (item.price === null) return false;
      return computeAdjustedPrice(item.price, action) > 0;
    });
    if (candidates.length === 0) {
      return { resolved: false, reason: 'None of the matching items have a price that can be adjusted by that amount.' };
    }
  }

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const resolvedItems: ResolvedMenuEditItem[] = candidates.map((item) => {
    let before: EditPatch = {};
    let after: EditPatch = {};
    let categoryChange: { before: string; after: string } | undefined;

    switch (action.type) {
      case 'set_price':
        before = { price: item.price };
        after = { price: roundCurrency(action.price) };
        break;
      case 'adjust_price':
        before = { price: item.price };
        after = { price: item.price === null ? null : computeAdjustedPrice(item.price, action) };
        break;
      case 'rename_item':
        before = { name: item.name };
        after = { name: action.name.trim() };
        break;
      case 'update_description':
        before = { description: item.description };
        after = { description: action.description.trim() || null };
        break;
      case 'move_category':
        before = { category_id: item.category_id };
        after = { category_id: destinationCategory!.id };
        categoryChange = { before: categoryNameById.get(item.category_id) || '', after: destinationCategory!.name };
        break;
      case 'set_availability':
        before = { available: item.available };
        after = { available: action.available };
        break;
      case 'set_tag':
        if (action.tag === 'featured') {
          before = { is_featured: item.is_featured };
          after = { is_featured: action.enabled };
        } else {
          const withoutTag = item.tags.filter((t) => t !== action.tag);
          before = { tags: item.tags };
          after = { tags: action.enabled ? [...withoutTag, action.tag] : withoutTag };
        }
        break;
    }

    return {
      id: item.id,
      name: item.name,
      categoryId: item.category_id,
      categoryName: categoryNameById.get(item.category_id) || '',
      before,
      after,
      categoryChange,
    };
  });

  return { resolved: true, items: resolvedItems, matchKind };
}

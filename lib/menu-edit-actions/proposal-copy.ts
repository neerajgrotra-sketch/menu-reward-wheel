// Composes the generic ProposalCopy/ProposalItemView shapes
// (lib/restaurant-planner/proposal-view.ts) ProposalCard.tsx renders, for
// the menu_edit capability — the sibling of
// lib/menu-discount-actions/proposal-copy.ts. No schedule/visibility
// concept (menu_edit changes are immediate and permanent, and there is no
// "promotion channel" for a catalog edit) — both left undefined, which the
// card renders as "section hidden."

import type { MenuEditAction, MenuEditTarget } from '@/lib/intelligence/actions/menu-edit-schema';
import type { ResolvedMenuEditItem } from './resolve';
import type { ProposalCopy, ProposalItemView } from '@/lib/restaurant-planner/proposal-view';

function targetLabel(target: MenuEditTarget): string {
  switch (target.scope) {
    case 'all':
      return 'all menu items';
    case 'category':
      return `the "${target.name}" category`;
    case 'item':
      return `"${target.name}"`;
    case 'items':
      return target.names.map((n) => `"${n}"`).join(', ');
    case 'name_contains':
      return `items matching "${target.query}"`;
  }
}

function changeLabel(action: MenuEditAction): string {
  switch (action.type) {
    case 'set_price':
      return `a price of $${action.price.toFixed(2)}`;
    case 'adjust_price': {
      const { direction, amount } = action.adjustment;
      const amountLabel = amount.kind === 'percentage' ? `${amount.value}%` : `$${amount.value.toFixed(2)}`;
      return `a ${direction === 'increase' ? 'price increase' : 'price decrease'} of ${amountLabel}`;
    }
    case 'rename_item':
      return `the new name "${action.name}"`;
    case 'update_description':
      return 'an updated description';
    case 'move_category':
      return `a move to the "${action.toCategoryName}" category`;
    case 'set_availability':
      return action.available ? 'visibility on the menu' : 'hidden status';
    case 'set_tag': {
      const tagLabel = action.tag === 'chef_special' ? 'Chef Special' : action.tag === 'popular' ? 'Popular' : 'Featured';
      return action.enabled ? `the "${tagLabel}" tag` : `removal of the "${tagLabel}" tag`;
    }
  }
}

// The card's header title — always ends in "Recommendation," same framing
// as menu_pricing's promotionLabel.
function titleLabel(action: MenuEditAction): string {
  switch (action.type) {
    case 'set_price':
    case 'adjust_price':
      return 'Price Change Recommendation';
    case 'rename_item':
      return 'Rename Recommendation';
    case 'update_description':
      return 'Description Update Recommendation';
    case 'move_category':
      return 'Category Move Recommendation';
    case 'set_availability':
      return action.available ? 'Visibility Recommendation' : 'Hide Item Recommendation';
    case 'set_tag':
      return 'Menu Highlight Recommendation';
  }
}

function shortSummaryLabel(action: MenuEditAction): string {
  switch (action.type) {
    case 'set_price':
      return `set the price to $${action.price.toFixed(2)}`;
    case 'adjust_price': {
      const { direction, amount } = action.adjustment;
      const amountLabel = amount.kind === 'percentage' ? `${amount.value}%` : `$${amount.value.toFixed(2)}`;
      return `${direction === 'increase' ? 'increase' : 'decrease'} the price by ${amountLabel}`;
    }
    case 'rename_item':
      return `rename to "${action.name}"`;
    case 'update_description':
      return 'update the description';
    case 'move_category':
      return `move to "${action.toCategoryName}"`;
    case 'set_availability':
      return action.available ? 'show it on the menu' : 'hide it from the menu';
    case 'set_tag': {
      const tagLabel = action.tag === 'chef_special' ? 'Chef Special' : action.tag === 'popular' ? 'Popular' : 'Featured';
      return action.enabled ? `mark it as ${tagLabel}` : `remove the ${tagLabel} tag`;
    }
  }
}

// Deliberately not framed as a revenue/sales claim the way menu_pricing's
// objectiveLabel is ("Increase X sales") — a rename or visibility change
// has no honest revenue objective to state, and menu_pricing's phrasing
// would be a fabricated claim if reused here.
function objectiveLabel(action: MenuEditAction): string {
  switch (action.type) {
    case 'set_price':
    case 'adjust_price':
      return 'Update menu pricing';
    case 'rename_item':
    case 'update_description':
      return 'Update catalog information';
    case 'move_category':
      return 'Reorganize menu structure';
    case 'set_availability':
      return 'Update menu visibility';
    case 'set_tag':
      return 'Update item highlighting';
  }
}

export function toItemView(item: ResolvedMenuEditItem): ProposalItemView {
  if (item.categoryChange) {
    return { id: item.id, name: item.name, categoryName: item.categoryName, beforeLabel: item.categoryChange.before, afterLabel: item.categoryChange.after };
  }
  if ('price' in item.before || 'price' in item.after) {
    return {
      id: item.id,
      name: item.name,
      categoryName: item.categoryName,
      beforeLabel: item.before.price !== null && item.before.price !== undefined ? `$${item.before.price.toFixed(2)}` : '—',
      afterLabel: item.after.price !== null && item.after.price !== undefined ? `$${item.after.price.toFixed(2)}` : '—',
    };
  }
  if ('name' in item.before || 'name' in item.after) {
    return { id: item.id, name: item.name, categoryName: item.categoryName, beforeLabel: item.before.name ?? '—', afterLabel: item.after.name ?? '—' };
  }
  if ('description' in item.before || 'description' in item.after) {
    return {
      id: item.id,
      name: item.name,
      categoryName: item.categoryName,
      beforeLabel: item.before.description || '(no description)',
      afterLabel: item.after.description || '(no description)',
    };
  }
  if ('available' in item.before || 'available' in item.after) {
    return {
      id: item.id,
      name: item.name,
      categoryName: item.categoryName,
      beforeLabel: item.before.available ? 'Visible' : 'Hidden',
      afterLabel: item.after.available ? 'Visible' : 'Hidden',
      badge: item.after.available === false ? 'HIDDEN' : undefined,
    };
  }
  if ('is_featured' in item.before || 'is_featured' in item.after) {
    return {
      id: item.id,
      name: item.name,
      categoryName: item.categoryName,
      beforeLabel: item.before.is_featured ? 'Featured' : 'Not Featured',
      afterLabel: item.after.is_featured ? 'Featured' : 'Not Featured',
      badge: item.after.is_featured ? 'FEATURED' : undefined,
    };
  }
  // 'tags' — set_tag for chef_special/popular.
  return {
    id: item.id,
    name: item.name,
    categoryName: item.categoryName,
    beforeLabel: (item.before.tags ?? []).join(', ') || '(no tags)',
    afterLabel: (item.after.tags ?? []).join(', ') || '(no tags)',
  };
}

export function composeProposalCopy(action: MenuEditAction): ProposalCopy {
  return {
    title: titleLabel(action),
    shortSummary: shortSummaryLabel(action),
    recommendationText: `Apply ${changeLabel(action)} to ${targetLabel(action.target)}`,
    objectiveText: objectiveLabel(action),
    // No scheduleText, no visibilityChannels — menu_edit has neither concept.
    afterApprovalSteps: ['Menu catalog updates', 'Customers immediately see the change'],
  };
}

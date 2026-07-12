// Short natural-language restatement of a MenuEditAction, stored as the chat
// bubble content for a role='assistant', intent='menu_edit_action' message
// (app/api/admin/assistant/messages/route.ts) — the menu_edit sibling of
// describe-action.ts. The full structured action lives in that row's
// `action` column and is what ProposalCard.tsx actually resolves/applies —
// this string is only for display and for conversation_history transcripts.

import type { MenuEditAction } from '@/lib/intelligence/actions/menu-edit-schema';

function describeTarget(target: MenuEditAction['target']): string {
  switch (target.scope) {
    case 'all':
      return 'all items';
    case 'category': {
      const exclude = target.exclude?.length ? ` (except ${target.exclude.join(', ')})` : '';
      return `the "${target.name}" category${exclude}`;
    }
    case 'item':
      return `"${target.name}"`;
    case 'items':
      return target.names.map((n) => `"${n}"`).join(', ');
    case 'name_contains': {
      const exclude = target.exclude?.length ? ` (except ${target.exclude.join(', ')})` : '';
      return `every item matching "${target.query}"${exclude}`;
    }
  }
}

function describeChange(action: MenuEditAction): string {
  switch (action.type) {
    case 'set_price':
      return `setting the price to $${action.price.toFixed(2)}`;
    case 'adjust_price': {
      const { direction, amount } = action.adjustment;
      const amountLabel = amount.kind === 'percentage' ? `${amount.value}%` : `$${amount.value.toFixed(2)}`;
      return `${direction === 'increase' ? 'increasing' : 'decreasing'} the price by ${amountLabel}`;
    }
    case 'rename_item':
      return `renaming to "${action.name}"`;
    case 'update_description':
      return 'updating the description';
    case 'move_category':
      return `moving to the "${action.toCategoryName}" category`;
    case 'set_availability':
      return action.available ? 'making it visible on the menu' : 'hiding it from the menu';
    case 'set_tag': {
      const tagLabel = action.tag === 'chef_special' ? 'Chef Special' : action.tag === 'popular' ? 'Popular' : 'Featured';
      return action.enabled ? `marking it as ${tagLabel}` : `removing the ${tagLabel} tag`;
    }
  }
}

export function describeProposedMenuEditAction(action: MenuEditAction): string {
  const targetLabel = describeTarget(action.target);
  return `Here's what I recommend: ${describeChange(action)} on ${targetLabel}. Take a look below and let me know if you'd like any changes.`;
}

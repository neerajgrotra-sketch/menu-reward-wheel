// Short natural-language restatement of a MenuDiscountAction, stored as the
// chat bubble content for a role='assistant', intent='menu_discount_action'
// message (app/api/admin/assistant/messages/route.ts). The full structured
// action lives in that row's `action` column and is what
// ProposalCard.tsx actually resolves/applies — this string is only
// for display and for conversation_history transcripts.

import type { MenuDiscountAction } from '@/lib/intelligence/actions/menu-discount-schema';

function describeTarget(target: MenuDiscountAction['target']): string {
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

export function describeProposedAction(action: MenuDiscountAction): string {
  const targetLabel = describeTarget(action.target);

  if (action.type === 'clear_discount') {
    return `Proposed: remove the discount from ${targetLabel}.`;
  }

  const valueLabel =
    action.discount.discountType === 'percentage'
      ? `${action.discount.value}% off`
      : `a fixed price of $${action.discount.value}`;

  return `Proposed: ${valueLabel} on ${targetLabel}.`;
}

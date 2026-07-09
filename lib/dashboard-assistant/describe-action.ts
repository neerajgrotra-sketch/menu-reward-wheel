// Short natural-language restatement of a MenuDiscountAction, stored as the
// chat bubble content for a role='assistant', intent='menu_discount_action'
// message (app/api/admin/assistant/messages/route.ts). The full structured
// action lives in that row's `action` column and is what
// DiscountActionPreview.tsx actually resolves/applies — this string is only
// for display and for conversation_history transcripts.

import type { MenuDiscountAction } from '@/lib/intelligence/actions/menu-discount-schema';

export function describeProposedAction(action: MenuDiscountAction): string {
  const targetLabel =
    action.target.scope === 'all'
      ? 'all items'
      : action.target.scope === 'category'
        ? `the "${action.target.name}" category`
        : `"${action.target.name}"`;

  if (action.type === 'clear_discount') {
    return `Proposed: remove the discount from ${targetLabel}.`;
  }

  const valueLabel =
    action.discount.discountType === 'percentage'
      ? `${action.discount.value}% off`
      : `a fixed price of $${action.discount.value}`;

  return `Proposed: ${valueLabel} on ${targetLabel}.`;
}

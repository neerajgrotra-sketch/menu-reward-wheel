// What happened to a menu_discount_action proposal, recorded as a follow-up
// chat message (intent = 'action_outcome') by
// app/api/admin/assistant/messages/outcome/route.ts. Content is always
// composed deterministically from these fixed templates, never AI-authored —
// no Rule 20 concern. This is the mechanism that carries
// lib/menu-discount-actions/resolve.ts's ambiguity reason/candidates (only
// known after /api/admin/menus/discount-action/preview resolves against live
// menu data) back into conversation_history for the next turn.

export type ActionOutcomePayload =
  | { kind: 'ambiguous'; reason: string; candidates?: string[] }
  | { kind: 'applied'; applied: number; total: number; failed?: Array<{ name: string; error?: string }> }
  | { kind: 'cancelled' };

export function describeOutcome(payload: ActionOutcomePayload): string {
  switch (payload.kind) {
    case 'ambiguous': {
      const suffix =
        payload.candidates && payload.candidates.length > 0
          ? ` Did you mean: ${payload.candidates.join(', ')}?`
          : '';
      return `${payload.reason}${suffix}`;
    }
    case 'applied': {
      const failedSuffix =
        payload.failed && payload.failed.length > 0
          ? ` Couldn't update: ${payload.failed.map((f) => f.name).join(', ')}.`
          : '';
      return `Applied to ${payload.applied} of ${payload.total} items.${failedSuffix}`;
    }
    case 'cancelled':
      return 'Cancelled — no changes made.';
  }
}

export function isActionOutcomePayload(value: unknown): value is ActionOutcomePayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind === 'ambiguous') return typeof v.reason === 'string';
  if (v.kind === 'applied') return typeof v.applied === 'number' && typeof v.total === 'number';
  if (v.kind === 'cancelled') return true;
  return false;
}

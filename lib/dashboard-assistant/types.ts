import type { Database } from '@/lib/supabase/database.types';

export type DashboardAssistantMessage = Database['public']['Tables']['dashboard_assistant_messages']['Row'];
export type DashboardAssistantConversation = Database['public']['Tables']['dashboard_assistant_conversations']['Row'];

// True once a later action_outcome message (ambiguous/applied/cancelled)
// points its related_message_id at this proposal — it already has its own
// follow-up bubble telling the full story, so no extra caption is needed.
export function hasResolvedOutcome(message: DashboardAssistantMessage, messages: DashboardAssistantMessage[]): boolean {
  return messages.some((m) => m.related_message_id === message.id);
}

// A menu_discount_action message is "live" (renders an actionable
// ProposalCard) iff nothing has resolved it yet and it's still the
// most recent assistant turn. Moving on to a new ask without resolving a
// proposal makes the old one inert; re-applying a stale, possibly-superseded
// proposal from scroll-back would be unsafe.
export function isProposalLive(message: DashboardAssistantMessage, messages: DashboardAssistantMessage[]): boolean {
  if (message.intent !== 'menu_discount_action') return false;
  if (hasResolvedOutcome(message, messages)) return false;
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  return lastAssistantMessage?.id === message.id;
}

// V2 (Objective 2): a clarification carrying structured candidates renders
// TargetSelector's checkboxes instead of a plain question bubble, but only
// while it's still the most recent assistant turn — same "moving on makes
// the old one inert" rule as isProposalLive, just without an outcome-message
// mechanism (selecting/cancelling here always produces a newer message,
// which is what actually retires it).
export function isClarificationLive(message: DashboardAssistantMessage, messages: DashboardAssistantMessage[]): boolean {
  if (message.intent !== 'clarification' || !message.candidates) return false;
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  return lastAssistantMessage?.id === message.id;
}

// Revenue Intelligence Agent V1 — same "still the most recent assistant
// turn" rule as isClarificationLive; a revenue_opportunities message has no
// outcome-message mechanism of its own the way a proposal does (see
// hasResolvedOutcome), since a converted opportunity produces its own new
// message rather than mutating this one.
export function isOpportunityListLive(message: DashboardAssistantMessage, messages: DashboardAssistantMessage[]): boolean {
  if (message.intent !== 'revenue_opportunities') return false;
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  return lastAssistantMessage?.id === message.id;
}

// Whether one specific opportunity from a revenue_opportunities message has
// already been turned into a proposal — derived, not client state, so it
// survives a reload and can't be defeated by a double-click. The
// {sourceOpportunityId} breadcrumb is written by
// app/api/admin/assistant/revenue-intelligence/create-proposal/route.ts onto
// whatever new message it creates; it is never a decision boundary
// elsewhere, same posture as every other `outcome` payload in this system.
export function isOpportunityConverted(opportunityId: string, listMessageId: string, messages: DashboardAssistantMessage[]): boolean {
  return messages.some((m) => {
    if (m.related_message_id !== listMessageId) return false;
    const outcome = m.outcome as unknown as { sourceOpportunityId?: string } | null;
    return outcome?.sourceOpportunityId === opportunityId;
  });
}

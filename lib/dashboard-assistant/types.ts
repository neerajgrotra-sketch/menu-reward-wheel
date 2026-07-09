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
// DiscountActionPreview) iff nothing has resolved it yet and it's still the
// most recent assistant turn. Moving on to a new ask without resolving a
// proposal makes the old one inert; re-applying a stale, possibly-superseded
// proposal from scroll-back would be unsafe.
export function isProposalLive(message: DashboardAssistantMessage, messages: DashboardAssistantMessage[]): boolean {
  if (message.intent !== 'menu_discount_action') return false;
  if (hasResolvedOutcome(message, messages)) return false;
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  return lastAssistantMessage?.id === message.id;
}

// Flattens prior Ask SpinBite turns into a single string for the
// dashboard_assistant prompt template's {{conversation_history}} variable
// (see lib/intelligence/context-builder.ts). Every message row already has
// natural-language content regardless of intent (answer text, a proposed
// action's restatement, or a deterministic outcome summary — see
// lib/dashboard-assistant/outcome.ts), so no per-intent special-casing is
// needed here.
//
// V2: an optional openProposalGroupId tags the one message that represents
// the conversation's currently-open proposal with `[proposal:<id>]` — the
// id the model may echo back verbatim as `refersToProposalId`
// (lib/restaurant-planner/types.ts) to modify it in place instead of
// starting a new one (Objective 7). The caller (messages/route.ts) already
// has to look this up for its own re-verification step, so buildTranscript
// stays a pure formatter rather than re-deriving "which proposal is open."

import type { Database } from '@/lib/supabase/database.types';

type MessageRow = Database['public']['Tables']['dashboard_assistant_messages']['Row'];

const MAX_TRANSCRIPT_MESSAGES = 20;

export function buildTranscript(messages: MessageRow[], openProposalGroupId?: string): string {
  return messages
    .slice(-MAX_TRANSCRIPT_MESSAGES)
    .map((m) => {
      const tag = openProposalGroupId && m.proposal_group_id === openProposalGroupId ? ` [proposal:${openProposalGroupId}]` : '';
      return `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}${tag}`;
    })
    .join('\n');
}

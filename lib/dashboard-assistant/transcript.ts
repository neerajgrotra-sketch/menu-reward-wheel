// Flattens prior Ask SpinBite turns into a single string for the
// dashboard_assistant prompt template's {{conversation_history}} variable
// (see lib/intelligence/context-builder.ts). Every message row already has
// natural-language content regardless of intent (answer text, a proposed
// action's restatement, or a deterministic outcome summary — see
// lib/dashboard-assistant/outcome.ts), so no per-intent special-casing is
// needed here.

import type { Database } from '@/lib/supabase/database.types';

type MessageRow = Database['public']['Tables']['dashboard_assistant_messages']['Row'];

const MAX_TRANSCRIPT_MESSAGES = 20;

export function buildTranscript(messages: MessageRow[]): string {
  return messages
    .slice(-MAX_TRANSCRIPT_MESSAGES)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');
}

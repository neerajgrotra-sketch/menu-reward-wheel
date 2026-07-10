// Conversation Tools. getOpenProposal/getConversationContext extract logic
// that used to be inlined directly in app/api/admin/assistant/messages/route.ts
// (a duplicated open-status filter, and a separate prior-messages-fetch +
// buildTranscript() call) — the route now calls these instead.
// getConversationSummary is genuinely new but deliberately small and
// deterministic (counts and the latest proposal's status) — never prose,
// no LLM call, matching every other tool's "structured JSON only" contract.

import { getOpenProposalForConversation, getProposalGroupHistory, type ProposalRow } from '../proposals';
import { buildTranscript } from '@/lib/dashboard-assistant/transcript';
import type { Database } from '@/lib/supabase/database.types';
import type { ToolDefinition } from './types';
import { ok } from './types';

type MessageRow = Database['public']['Tables']['dashboard_assistant_messages']['Row'];

export const getOpenProposal: ToolDefinition<{ conversationId: string }, ProposalRow | null> = {
  name: 'getOpenProposal',
  description: "The conversation's currently-open proposal (status draft/modified), or null if the latest proposal has already been approved/executed/cancelled or none exists yet.",
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => ok(await getOpenProposalForConversation(ctx.supabase, input.conversationId)),
};

export const getProposalHistory: ToolDefinition<{ proposalGroupId: string }, ProposalRow[]> = {
  name: 'getProposalHistory',
  description: 'Every version of a proposal group, oldest first — free given the append-only design.',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => ok(await getProposalGroupHistory(ctx.supabase, input.proposalGroupId)),
};

export type ConversationContext = { messages: MessageRow[]; transcript: string; openProposalGroupId?: string };

export const getConversationContext: ToolDefinition<{ conversationId: string }, ConversationContext> = {
  name: 'getConversationContext',
  description: 'Prior messages plus the flattened transcript string used as the {{conversation_history}} prompt variable, with the currently-open proposal (if any) tagged.',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const [{ data: messages }, openProposal] = await Promise.all([
      ctx.supabase.from('dashboard_assistant_messages').select('*').eq('conversation_id', input.conversationId).order('created_at', { ascending: true }),
      getOpenProposalForConversation(ctx.supabase, input.conversationId),
    ]);
    const openProposalGroupId = openProposal?.proposal_group_id;
    const transcript = buildTranscript(messages ?? [], openProposalGroupId);
    return ok({ messages: messages ?? [], transcript, openProposalGroupId });
  },
};

export type ConversationSummary = {
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  openProposalStatus: string | null;
};

export const getConversationSummary: ToolDefinition<{ conversationId: string }, ConversationSummary> = {
  name: 'getConversationSummary',
  description: 'A small deterministic structured summary of a conversation — message counts and the open proposal status, if any. Never prose, no LLM call.',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const [{ data: messages }, openProposal] = await Promise.all([
      ctx.supabase.from('dashboard_assistant_messages').select('role').eq('conversation_id', input.conversationId),
      getOpenProposalForConversation(ctx.supabase, input.conversationId),
    ]);
    const rows = messages ?? [];
    return ok({
      messageCount: rows.length,
      userMessageCount: rows.filter((m) => m.role === 'user').length,
      assistantMessageCount: rows.filter((m) => m.role === 'assistant').length,
      openProposalStatus: openProposal?.status ?? null,
    });
  },
};

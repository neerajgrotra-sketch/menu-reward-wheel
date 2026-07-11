// Pure reducer behind GET /api/admin/assistant/conversations/list — kept
// separate from the route so History-panel logic (title fallback, last-
// message preview, archived/open-proposal flags) is unit-testable without a
// Supabase mock. The route does only fetching; this does the shaping.

import { deriveConversationTitle } from './title';

export type ConversationSummaryInput = {
  id: string;
  title: string | null;
  last_message_at: string;
  archived_at: string | null;
};

export type MessageSummaryInput = {
  conversation_id: string;
  role: string;
  content: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  archived: boolean;
  hasOpenProposal: boolean;
};

// `messages` must already be ordered ascending by created_at — the caller
// (the route, which already fetches in that order for transcript hydration
// elsewhere) guarantees this rather than this function re-sorting.
export function summarizeConversations(
  conversations: ConversationSummaryInput[],
  messages: MessageSummaryInput[],
  openProposalConversationIds: Set<string>,
): ConversationSummary[] {
  const firstUserMessageByConversation = new Map<string, string>();
  const lastMessageByConversation = new Map<string, string>();

  for (const message of messages) {
    if (message.role === 'user' && !firstUserMessageByConversation.has(message.conversation_id)) {
      firstUserMessageByConversation.set(message.conversation_id, message.content);
    }
    // Ascending order means the last write for a given conversation is
    // always its most recent message, regardless of role.
    lastMessageByConversation.set(message.conversation_id, message.content);
  }

  return conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title ?? deriveConversationTitle(firstUserMessageByConversation.get(conversation.id)),
    preview: lastMessageByConversation.get(conversation.id) ?? '',
    updatedAt: conversation.last_message_at,
    archived: conversation.archived_at !== null,
    hasOpenProposal: openProposalConversationIds.has(conversation.id),
  }));
}

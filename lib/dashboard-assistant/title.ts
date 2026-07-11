// Deterministic conversation titling — no LLM call (Conversation Management
// V1, Part 4). dashboard_assistant_conversations.title stays NULL until a
// future LLM-generated-title feature writes it; until then this derives a
// display title from the first user message so History rows are never blank.

const MAX_TITLE_LENGTH = 48;

export function deriveConversationTitle(firstUserMessageContent: string | null | undefined): string {
  if (!firstUserMessageContent) return 'New conversation';
  const normalized = firstUserMessageContent.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'New conversation';
  if (normalized.length <= MAX_TITLE_LENGTH) return normalized;
  const truncated = normalized.slice(0, MAX_TITLE_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');
  const clean = lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated;
  return `${clean.trim()}…`;
}

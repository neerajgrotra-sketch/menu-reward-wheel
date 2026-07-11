import { describe, it, expect } from 'vitest';
import { summarizeConversations } from './conversation-summary';

describe('summarizeConversations (Conversation Management V1)', () => {
  it('derives a title from the first user message when no explicit title is set', () => {
    const summaries = summarizeConversations(
      [{ id: 'c1', title: null, last_message_at: '2026-07-11T10:00:00Z', archived_at: null }],
      [
        { conversation_id: 'c1', role: 'user', content: 'Apply 20% discount to chai' },
        { conversation_id: 'c1', role: 'assistant', content: "I've prepared a recommendation." },
      ],
      new Set(),
    );
    expect(summaries[0].title).toBe('Apply 20% discount to chai');
  });

  it('prefers an explicit title over the derived one', () => {
    const summaries = summarizeConversations(
      [{ id: 'c1', title: 'Chai pricing', last_message_at: '2026-07-11T10:00:00Z', archived_at: null }],
      [{ conversation_id: 'c1', role: 'user', content: 'Apply 20% discount to chai' }],
      new Set(),
    );
    expect(summaries[0].title).toBe('Chai pricing');
  });

  it('falls back to a placeholder title for a conversation with no messages yet', () => {
    const summaries = summarizeConversations(
      [{ id: 'c1', title: null, last_message_at: '2026-07-11T10:00:00Z', archived_at: null }],
      [],
      new Set(),
    );
    expect(summaries[0].title).toBe('New conversation');
    expect(summaries[0].preview).toBe('');
  });

  it('previews the most recent message regardless of role, given ascending input order', () => {
    const summaries = summarizeConversations(
      [{ id: 'c1', title: null, last_message_at: '2026-07-11T10:05:00Z', archived_at: null }],
      [
        { conversation_id: 'c1', role: 'user', content: 'Apply 20% discount to chai' },
        { conversation_id: 'c1', role: 'assistant', content: "I've prepared a recommendation for you." },
      ],
      new Set(),
    );
    expect(summaries[0].preview).toBe("I've prepared a recommendation for you.");
  });

  it('keeps each conversation isolated from another conversation\'s messages', () => {
    const summaries = summarizeConversations(
      [
        { id: 'c1', title: null, last_message_at: '2026-07-11T10:00:00Z', archived_at: null },
        { id: 'c2', title: null, last_message_at: '2026-07-11T09:00:00Z', archived_at: null },
      ],
      [
        { conversation_id: 'c1', role: 'user', content: 'Chai discount' },
        { conversation_id: 'c2', role: 'user', content: 'Dessert combo' },
      ],
      new Set(),
    );
    expect(summaries.find((s) => s.id === 'c1')?.title).toBe('Chai discount');
    expect(summaries.find((s) => s.id === 'c2')?.title).toBe('Dessert combo');
  });

  it('preserves the caller-supplied conversation order (already sorted by recency)', () => {
    const summaries = summarizeConversations(
      [
        { id: 'newest', title: 'B', last_message_at: '2026-07-11T12:00:00Z', archived_at: null },
        { id: 'oldest', title: 'A', last_message_at: '2026-07-11T09:00:00Z', archived_at: null },
      ],
      [],
      new Set(),
    );
    expect(summaries.map((s) => s.id)).toEqual(['newest', 'oldest']);
  });

  it('maps archived_at presence to the archived flag', () => {
    const summaries = summarizeConversations(
      [
        { id: 'active', title: 'A', last_message_at: '2026-07-11T09:00:00Z', archived_at: null },
        { id: 'archived', title: 'B', last_message_at: '2026-07-11T09:00:00Z', archived_at: '2026-07-11T10:00:00Z' },
      ],
      [],
      new Set(),
    );
    expect(summaries.find((s) => s.id === 'active')?.archived).toBe(false);
    expect(summaries.find((s) => s.id === 'archived')?.archived).toBe(true);
  });

  it('flags a conversation as having an open proposal only when its id is in the provided set', () => {
    const summaries = summarizeConversations(
      [
        { id: 'c1', title: 'A', last_message_at: '2026-07-11T09:00:00Z', archived_at: null },
        { id: 'c2', title: 'B', last_message_at: '2026-07-11T09:00:00Z', archived_at: null },
      ],
      [],
      new Set(['c1']),
    );
    expect(summaries.find((s) => s.id === 'c1')?.hasOpenProposal).toBe(true);
    expect(summaries.find((s) => s.id === 'c2')?.hasOpenProposal).toBe(false);
  });
});

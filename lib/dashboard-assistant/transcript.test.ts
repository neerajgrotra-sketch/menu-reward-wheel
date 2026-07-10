import { describe, it, expect } from 'vitest';
import { buildTranscript } from './transcript';
import type { Database } from '@/lib/supabase/database.types';

type MessageRow = Database['public']['Tables']['dashboard_assistant_messages']['Row'];

function message(overrides: Partial<MessageRow>): MessageRow {
  return {
    id: 'm1',
    conversation_id: 'c1',
    restaurant_id: 'r1',
    role: 'user',
    content: 'hi',
    intent: null,
    action: null,
    outcome: null,
    capability: null,
    proposal_group_id: null,
    proposal_id: null,
    candidates: null,
    related_message_id: null,
    created_by: 'u1',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildTranscript', () => {
  it('flattens messages without a tag when no open proposal group is given', () => {
    const result = buildTranscript([message({ role: 'user', content: 'Apply 20% off chai' })]);
    expect(result).toBe('User: Apply 20% off chai');
  });

  it('tags only the message belonging to the open proposal group (V2)', () => {
    const messages = [
      message({ id: 'm1', role: 'user', content: 'Apply 20% off chai' }),
      message({ id: 'm2', role: 'assistant', content: 'Proposed: 20% off on "Cardamom Chai".', proposal_group_id: 'p1' }),
      message({ id: 'm3', role: 'user', content: 'Make it 15%' }),
    ];
    const result = buildTranscript(messages, 'p1');
    expect(result).toBe(
      'User: Apply 20% off chai\n' + 'Assistant: Proposed: 20% off on "Cardamom Chai". [proposal:p1]\n' + 'User: Make it 15%',
    );
  });

  it('does not tag a message belonging to a different (closed/older) proposal group', () => {
    const messages = [message({ id: 'm1', role: 'assistant', content: 'Proposed: X.', proposal_group_id: 'old-group' })];
    const result = buildTranscript(messages, 'p1');
    expect(result).toBe('Assistant: Proposed: X.');
  });
});

import { describe, it, expect } from 'vitest';
import { isOpportunityListLive, isOpportunityConverted, type DashboardAssistantMessage } from './types';

function message(overrides: Partial<DashboardAssistantMessage>): DashboardAssistantMessage {
  return {
    id: 'm1',
    conversation_id: 'c1',
    restaurant_id: 'r1',
    role: 'assistant',
    content: 'hi',
    intent: null,
    action: null,
    outcome: null,
    capability: null,
    proposal_group_id: null,
    proposal_id: null,
    candidates: null,
    related_message_id: null,
    revenue_opportunities: null,
    created_by: 'u1',
    created_at: new Date().toISOString(),
    ...overrides,
  } as DashboardAssistantMessage;
}

describe('isOpportunityListLive', () => {
  it('is live when it is the most recent assistant message', () => {
    const list = message({ id: 'list1', intent: 'revenue_opportunities' });
    expect(isOpportunityListLive(list, [list])).toBe(true);
  });

  it('is not live once a newer assistant message exists — moving on makes it inert', () => {
    const list = message({ id: 'list1', intent: 'revenue_opportunities' });
    const later = message({ id: 'later', intent: 'answer' });
    expect(isOpportunityListLive(list, [list, later])).toBe(false);
  });

  it('is false for a message with a different intent', () => {
    const answer = message({ id: 'a1', intent: 'answer' });
    expect(isOpportunityListLive(answer, [answer])).toBe(false);
  });
});

describe('isOpportunityConverted', () => {
  it('is true once a later message carries the matching {sourceOpportunityId} breadcrumb', () => {
    const list = message({ id: 'list1', intent: 'revenue_opportunities' });
    const proposalMsg = message({
      id: 'p1',
      intent: 'menu_discount_action',
      related_message_id: 'list1',
      outcome: { sourceOpportunityId: 'opp-1' } as unknown as DashboardAssistantMessage['outcome'],
    });
    expect(isOpportunityConverted('opp-1', 'list1', [list, proposalMsg])).toBe(true);
  });

  it('is false for a different opportunity id from the same list — one converted card does not gray out its siblings', () => {
    const list = message({ id: 'list1', intent: 'revenue_opportunities' });
    const proposalMsg = message({
      id: 'p1',
      intent: 'menu_discount_action',
      related_message_id: 'list1',
      outcome: { sourceOpportunityId: 'opp-1' } as unknown as DashboardAssistantMessage['outcome'],
    });
    expect(isOpportunityConverted('opp-2', 'list1', [list, proposalMsg])).toBe(false);
  });

  it('is false when nothing points back at the list message yet', () => {
    const list = message({ id: 'list1', intent: 'revenue_opportunities' });
    expect(isOpportunityConverted('opp-1', 'list1', [list])).toBe(false);
  });
});

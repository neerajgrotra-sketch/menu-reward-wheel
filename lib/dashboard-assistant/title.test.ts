import { describe, it, expect } from 'vitest';
import { deriveConversationTitle } from './title';

describe('deriveConversationTitle (Conversation Management V1)', () => {
  it('falls back to a placeholder for an empty conversation', () => {
    expect(deriveConversationTitle(null)).toBe('New conversation');
    expect(deriveConversationTitle(undefined)).toBe('New conversation');
    expect(deriveConversationTitle('')).toBe('New conversation');
    expect(deriveConversationTitle('   ')).toBe('New conversation');
  });

  it('uses the first message verbatim when it fits within the length cap', () => {
    expect(deriveConversationTitle('Apply 20% discount to chai')).toBe('Apply 20% discount to chai');
  });

  it('collapses internal whitespace and newlines', () => {
    expect(deriveConversationTitle('Apply  20%\n\ndiscount   to chai')).toBe('Apply 20% discount to chai');
  });

  it('truncates a long message at a word boundary and appends an ellipsis', () => {
    const long = 'Please apply a twenty percent discount to every dessert item on the weekend menu starting Friday';
    const title = deriveConversationTitle(long);
    expect(title.length).toBeLessThanOrEqual(49); // 48 chars + ellipsis
    expect(title.endsWith('…')).toBe(true);
    expect(title.endsWith(' …')).toBe(false);
  });

  it('is deterministic — the same input always produces the same title', () => {
    const input = 'Increase beverage sales this weekend';
    expect(deriveConversationTitle(input)).toBe(deriveConversationTitle(input));
  });
});

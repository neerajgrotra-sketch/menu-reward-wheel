// Tier 1 entry point — picked up by the default `vitest run` / `npm test`,
// same as every other suite in the repo. Zero API calls, zero network. See
// eval/README.md for the full two-tier design.

import { describe, it, expect } from 'vitest';
import { discoverGoldenConversations } from './runner/discover';
import { replayConversation } from './runner/replay';

// Async describe callback (not top-level await, which this repo's es5
// tsconfig target rejects at typecheck time) — vitest awaits it during
// collection, letting `it()` be generated dynamically per discovered
// golden conversation.
describe('Ask SpinBite Evaluation Framework — golden conversation replay (Tier 1, deterministic)', async () => {
  const conversations = await discoverGoldenConversations();

  it('discovered at least one golden conversation per registered capability', () => {
    const capabilities = new Set(conversations.map((c) => c.capability));
    expect(capabilities.has('menu_pricing')).toBe(true);
    expect(capabilities.has('revenue_intelligence')).toBe(true);
  });

  for (const conversation of conversations) {
    it(`${conversation.capability} / ${conversation.id} — ${conversation.description}`, async () => {
      const result = await replayConversation(conversation);
      if (result.error) throw new Error(result.error);

      const failures: string[] = [];
      for (const turn of result.turns) {
        for (const a of turn.assertions) {
          if (!a.pass) failures.push(`turn ${turn.turnIndex} ("${turn.userMessage}"): ${a.message}`);
        }
        for (const a of turn.actionAssertions ?? []) {
          if (!a.pass) failures.push(`turn ${turn.turnIndex} ("${turn.userMessage}") action: ${a.message}`);
        }
      }
      expect(failures, `Golden conversation "${conversation.id}" failed:\n${failures.join('\n')}`).toEqual([]);
    });
  }

  // Cross-cutting proof (not per-conversation) that "proposal versioning" is
  // a real connected chain: inspects the fake client's own
  // restaurant_planner_proposals table after a full multi-turn replay,
  // rather than trusting each turn's isolated assertions.
  it('proposal versioning: modifying an open proposal writes a real second version in the SAME group, not a new one', async () => {
    const conversation = conversations.find((c) => c.id === 'menu_pricing/modify-open-proposal');
    if (!conversation) throw new Error('eval/conversations/menu_pricing/modify-open-proposal.golden.ts not found by discovery.');

    const result = await replayConversation(conversation);
    if (result.error || !result.ctx) throw new Error(result.error ?? 'replay produced no context to inspect.');

    const rows = result.ctx.fakeClient.getTable('restaurant_planner_proposals') as Array<{
      proposal_group_id: string;
      version: number;
      status: string;
      action: { discount: { value: number } };
    }>;

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.proposal_group_id)).size).toBe(1);
    expect(rows.map((r) => r.version).sort()).toEqual([1, 2]);

    const latest = rows.find((r) => r.version === 2);
    expect(latest?.status).toBe('modified');
    expect(latest?.action.discount.value).toBe(15);
  });
});

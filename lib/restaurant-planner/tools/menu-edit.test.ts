import { describe, it, expect } from 'vitest';
import { createMenuEditDraft, previewMenuEdit, applyMenuEdit } from './menu-edit';
import type { ToolContext } from './types';

describe('TOOL_REGISTRY shape — menu_agent tools', () => {
  it('createMenuEditDraft is a propose, non-mutating, menu_agent tool', () => {
    expect(createMenuEditDraft).toMatchObject({ capability: 'menu_agent', permission: 'propose', mutating: false });
  });

  it('previewMenuEdit is a read, non-mutating, menu_agent tool', () => {
    expect(previewMenuEdit).toMatchObject({ capability: 'menu_agent', permission: 'read', mutating: false });
  });

  it('applyMenuEdit is the only write tool for menu_agent', () => {
    expect(applyMenuEdit).toMatchObject({ capability: 'menu_agent', permission: 'write', mutating: true });
  });
});

// Minimal chainable fake — same shape as capabilities/menu-edit.test.ts's
// fakeAuthClient, reused here to prove applyMenuEdit.execute is a thin,
// behavior-preserving wrap around applyMenuEditProposal (pass-through
// fidelity), not a reimplementation.
function fakeAuthClient() {
  const updateChain: any = { eq: () => updateChain, then: (resolve: any) => resolve({ error: null }) };
  return {
    from: (table: string) => {
      if (table === 'menu_items') return { update: () => updateChain };
      if (table === 'menu_edit_change_log') return { insert: async () => ({ error: null }) };
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

describe('applyMenuEdit (pass-through fidelity)', () => {
  it('writes through to menu_items and reports the same shape applyMenuEditProposal would', async () => {
    const ctx: ToolContext = { supabase: fakeAuthClient(), serviceClient: {} as any, restaurantId: 'r1', ownerId: 'o1' };
    const item = { id: 'item-id', name: 'Ras Malai', categoryId: 'cat-1', categoryName: 'Desserts', before: { price: 6.99 }, after: { price: 7.99 } };
    const outcome = await applyMenuEdit.execute({ items: [item] }, ctx);
    expect(outcome).toEqual({
      ok: true,
      data: {
        applied: 1,
        total: 1,
        failed: undefined,
        skippedNoOp: undefined,
        appliedItems: [{ name: 'Ras Malai', description: 'Ras Malai: $6.99 → $7.99' }],
      },
    });
  });
});

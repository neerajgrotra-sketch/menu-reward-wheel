// Menu Edit Tools — the menu_edit sibling of tools/promotion.ts. Every
// function wraps existing, already-tested logic from
// lib/restaurant-planner/capabilities/menu-edit.ts — no new business logic.
// No cancel tool needed here: tools/promotion.ts's cancelPromotion already
// reads `capability` off the proposal row it's cancelling rather than
// hardcoding 'menu_pricing', so it works for a menu_edit proposal unchanged
// (verified — see messages/outcome/route.ts, which calls it generically).

import { fetchAssignedMenus, fetchMenuContents } from '@/lib/menu/queries';
import { resolveMenuEditAction, type ResolvedMenuEditItem, type MatchKind } from '@/lib/menu-edit-actions/resolve';
import {
  buildProposal,
  estimateMenuEditImpact,
  applyMenuEditProposal,
  revalidateProposal,
  type ProposalBuildResult,
  type ApplyOutcome,
  type ApplyMenuEditResult,
} from '../capabilities/menu-edit';
import type { MenuEditAction } from '@/lib/intelligence/actions/menu-edit-schema';
import type { ToolDefinition } from './types';
import { ok } from './types';

export const createMenuEditDraft: ToolDefinition<{ action: MenuEditAction }, ProposalBuildResult> = {
  name: 'createMenuEditDraft',
  description: 'Resolves a raw menu-edit action against the real menu and builds a not-yet-persisted proposal draft (confidence, reasoning, plan tasks) — or an "unresolved" result with real candidates if the target is ambiguous or absent.',
  capability: 'menu_agent',
  permission: 'propose',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => ok(await buildProposal(ctx.supabase, ctx.restaurantId, input.action)),
};

// Shaped to match what a ProposalCard-consuming preview route needs: items,
// not just a count.
export type MenuEditPreviewResult =
  | { resolved: true; items: ResolvedMenuEditItem[]; revenueImpact: string | null; margin: string | null; warnings: string[]; matchKind: MatchKind }
  | { resolved: false; reason: string; candidates?: string[] };

export const previewMenuEdit: ToolDefinition<{ action: MenuEditAction }, MenuEditPreviewResult> = {
  name: 'previewMenuEdit',
  description: 'Read-only before/after preview of a menu-edit action against live menu data. Never writes.',
  capability: 'menu_agent',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const menus = await fetchAssignedMenus(ctx.supabase, ctx.restaurantId);
    const { categories, items } = await fetchMenuContents(ctx.supabase, menus.map((m) => m.id));
    // Bulk Edit Safety: bulkConfirmed:true, always — preview only ever runs
    // against an action that already produced a resolved proposal once
    // (ProposalCard's background refresh of an existing message), which
    // means resolve.ts's NEEDS_EXPLICIT_BULK_TARGET gate already passed.
    // Re-applying it here would incorrectly re-block an already-approved
    // bulk rename/description on every reload. See capabilities/menu-edit.ts's
    // buildProposal and edit-action/apply/route.ts for the same reasoning.
    const result = resolveMenuEditAction(input.action, categories, items, { bulkConfirmed: true });
    if (!result.resolved) return ok({ resolved: false, reason: result.reason, candidates: result.candidates });
    const impact = estimateMenuEditImpact();
    return ok({ resolved: true, items: result.items, matchKind: result.matchKind, ...impact });
  },
};

export const applyMenuEdit: ToolDefinition<{ items: ResolvedMenuEditItem[] }, ApplyMenuEditResult> = {
  name: 'applyMenuEdit',
  description: 'The only tool that writes menu_items for the menu_edit capability — applies a resolved catalog change, skipping any item whose live state already exactly matches (no-op), and logs one menu_edit_change_log row per real write.',
  capability: 'menu_agent',
  permission: 'write',
  mutating: true,
  version: 1,
  execute: async (input, ctx) => ok(await applyMenuEditProposal(ctx.supabase, ctx.restaurantId, ctx.ownerId, input.items)),
};

export { revalidateProposal };
export type { ApplyOutcome };

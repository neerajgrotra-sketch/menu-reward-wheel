// Promotion Tools. Every function wraps existing, already-tested logic from
// lib/restaurant-planner/capabilities/menu-pricing.ts and
// lib/restaurant-planner/proposals.ts — no new business logic. archivePromotion
// is deliberately NOT implemented: there is no "archived" ProposalStatus in
// the schema, and inventing one would be new business logic, not extraction.

import { fetchAssignedMenus, fetchMenuContents } from '@/lib/menu/queries';
import { resolveMenuDiscountAction, type ResolvableAction, type MatchKind } from '@/lib/menu-discount-actions/resolve';
import { buildProposal, estimateDiscountImpact, applyDiscountProposal, revalidateProposal, type ProposalBuildResult, type ApplyOutcome, type ApplyDiscountResult } from '../capabilities/menu-pricing';
import type { ResolvedDiscountItem } from '@/lib/menu-discount-actions/resolve';
import { insertProposalVersion, type ProposalRow } from '../proposals';
import type { MenuDiscountAction } from '@/lib/intelligence/actions/menu-discount-schema';
import type { ToolDefinition } from './types';
import { ok, fail } from './types';

export const createPromotionDraft: ToolDefinition<{ action: MenuDiscountAction }, ProposalBuildResult> = {
  name: 'createPromotionDraft',
  description: 'Resolves a raw discount action against the real menu and builds a not-yet-persisted proposal draft (confidence, reasoning, plan tasks, impact estimate) — or an "unresolved" result with real candidates if the target is ambiguous or absent.',
  capability: 'menu_pricing',
  permission: 'propose',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => ok(await buildProposal(ctx.supabase, ctx.restaurantId, input.action)),
};

// Shaped to match exactly what ProposalCard.tsx's PreviewResponse consumes
// (items, not just a count — the card renders each resolved item by name).
export type PreviewResult =
  | { resolved: true; items: ResolvedDiscountItem[]; revenueImpact: string | null; margin: string | null; warnings: string[]; matchKind: MatchKind }
  | { resolved: false; reason: string; candidates?: string[] };

// Wraps the exact resolve+estimate sequence
// app/api/admin/menus/discount-action/preview/route.ts runs — that route
// calls this tool directly rather than re-deriving the sequence inline.
// Schedule-warning augmentation and proposal revalidation stay in the route
// itself (route-specific concerns layered on top of this shared core, not
// part of the reusable preview primitive).
export const previewPromotion: ToolDefinition<{ action: ResolvableAction }, PreviewResult> = {
  name: 'previewPromotion',
  description: 'Read-only before/after preview of a discount action against live menu data, plus a revenue-impact estimate. Never writes.',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const menus = await fetchAssignedMenus(ctx.supabase, ctx.restaurantId);
    const { categories, items } = await fetchMenuContents(ctx.supabase, menus.map((m) => m.id));
    const result = resolveMenuDiscountAction(input.action, categories, items);
    if (!result.resolved) return ok({ resolved: false, reason: result.reason, candidates: result.candidates });
    const impact = estimateDiscountImpact(input.action, result.items);
    return ok({ resolved: true, items: result.items, matchKind: result.matchKind, ...impact });
  },
};

export const applyPromotion: ToolDefinition<{ items: ResolvedDiscountItem[] }, ApplyDiscountResult> = {
  name: 'applyPromotion',
  description: 'The only tool that writes menu_items — applies a resolved discount, skipping any item whose live state already exactly matches (no-op), and logs one menu_discount_change_log row per real write.',
  capability: 'menu_pricing',
  permission: 'write',
  mutating: true,
  version: 1,
  execute: async (input, ctx) => ok(await applyDiscountProposal(ctx.supabase, ctx.restaurantId, ctx.ownerId, input.items)),
};

// Wraps the append-only "cancelled" version transition
// app/api/admin/assistant/messages/outcome/route.ts inserts — that route
// calls this tool directly instead of re-deriving the insertProposalVersion
// field mapping inline. insertProposalVersion can throw on a DB error; the
// original inline code caught that around a "best-effort" call (a failure
// to log the cancellation must not break the outcome response) — caught
// here instead, now that the call is behind execute()'s ToolOutcome
// contract, so every caller gets that guarantee for free rather than
// needing its own try/catch.
export const cancelPromotion: ToolDefinition<{ openProposal: ProposalRow }, ProposalRow> = {
  name: 'cancelPromotion',
  description: "Appends a 'cancelled' version to an open proposal's group — never mutates the original rows, matching this system's append-only convention. Does not touch menu_items.",
  capability: 'menu_pricing',
  permission: 'propose',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    try {
      return ok(
        await insertProposalVersion(ctx.supabase, {
          proposalGroupId: input.openProposal.proposal_group_id,
          restaurantId: ctx.restaurantId,
          conversationId: input.openProposal.conversation_id,
          capability: input.openProposal.capability,
          action: input.openProposal.action,
          resolvedSnapshot: input.openProposal.resolved_snapshot,
          confidence: input.openProposal.confidence,
          reasoning: input.openProposal.reasoning,
          planTasks: input.openProposal.plan_tasks,
          status: 'cancelled',
          createdBy: ctx.ownerId,
        }),
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not record the cancellation.');
    }
  },
};

// Re-exported so callers of this file don't also need to import
// revalidateProposal from capabilities/menu-pricing.ts directly for the
// apply-time re-check (discount-action/apply/route.ts already does this).
export { revalidateProposal };
export type { ApplyOutcome };

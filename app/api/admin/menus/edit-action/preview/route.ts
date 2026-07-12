import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { isResolvableMenuEditAction, type ResolvedMenuEditItem } from '@/lib/menu-edit-actions/resolve';
import type { MenuEditAction } from '@/lib/intelligence/actions/menu-edit-schema';
import { revalidateProposal, computeConfidence, makeMenuEditDecisionCopyAdapter } from '@/lib/restaurant-planner/capabilities/menu-edit';
import { composeDecisionCard } from '@/lib/restaurant-planner/decision-intelligence';
import { toItemView, composeProposalCopy } from '@/lib/menu-edit-actions/proposal-copy';
import { getProposalById } from '@/lib/restaurant-planner/proposals';
import { getRestaurant } from '@/lib/restaurant-planner/tools/restaurant';
import { previewMenuEdit } from '@/lib/restaurant-planner/tools/menu-edit';
import { getPromotionCoverage, getItemOrderStats, getFrequentlyCoOrderedItems } from '@/lib/restaurant-planner/tools/analytics';
import { MIN_ORDERS_FOR_ANY_OPPORTUNITY } from '@/lib/restaurant-planner/revenue-intelligence/facts';
import type { ToolContext } from '@/lib/restaurant-planner/tools/types';
import { makeServiceClient } from '@/lib/intelligence/generate-route-helpers';

const RECENT_ACTIVITY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

// POST /api/admin/menus/edit-action/preview
// Read-only: resolves a structured menu-edit action against a restaurant's
// real menu data and returns a before/after preview — the menu_edit sibling
// of discount-action/preview/route.ts.
//
// Capability-aware Decision Intelligence: uses composeDecisionCard()
// (lib/restaurant-planner/decision-intelligence.ts) with menu_edit's OWN
// DecisionCopyAdapter (capabilities/menu-edit.ts's
// makeMenuEditDecisionCopyAdapter) — not menu_pricing's. This replaces the
// earlier version of this route, which reused menu_pricing's composers
// directly and produced pricing-flavored copy ("Complete pricing
// information," "Average order value" as a rename's success metric) on
// every menu_edit proposal — the pre-merge audit's Important finding #1.
//
// "Recent activity" here means recent menu_edit_change_log activity on the
// affected items (this capability's own audit table), not recent discount
// activity — distinct from discount-action/preview/route.ts's identically-
// shaped query against menu_discount_change_log.

export async function POST(request: Request) {
  const authClient = createServerAuthClient();
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let restaurantId: string;
  let action: MenuEditAction;
  let proposalId: string | undefined;
  try {
    const body = await request.json();
    restaurantId = (body.restaurantId ?? '').trim();
    if (!isResolvableMenuEditAction(body.action)) {
      return NextResponse.json({ error: 'Malformed action.' }, { status: 400 });
    }
    action = body.action;
    proposalId = typeof body.proposalId === 'string' && body.proposalId.trim() ? body.proposalId.trim() : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!restaurantId) {
    return NextResponse.json({ error: 'restaurantId is required.' }, { status: 400 });
  }

  const toolCtx: ToolContext = { supabase: authClient, serviceClient: makeServiceClient(), restaurantId, ownerId: userData.user.id };
  const restaurantResult = await getRestaurant.execute({}, toolCtx);
  if (!restaurantResult.ok) {
    return NextResponse.json({ error: restaurantResult.reason }, { status: 403 });
  }

  const previewResult = await previewMenuEdit.execute({ action }, toolCtx);
  if (!previewResult.ok) {
    return NextResponse.json({ error: previewResult.reason }, { status: 500 });
  }
  const preview = previewResult.data;
  if (!preview.resolved) return NextResponse.json(preview);

  let revalidation: { ok: boolean; reason?: string } | undefined;
  if (proposalId) {
    const proposal = await getProposalById(authClient, { proposalId, restaurantId });
    const snapshot = (proposal?.resolved_snapshot as unknown as ResolvedMenuEditItem[] | null) ?? null;
    const check = revalidateProposal(snapshot, preview.items);
    revalidation = check.ok ? { ok: true } : { ok: false, reason: check.reason };
  }

  const itemIds = preview.items.map((item) => item.id);
  const categoryIds = Array.from(new Set(preview.items.map((item) => item.categoryId)));
  const primaryCategoryId = categoryIds.length === 1 ? categoryIds[0] : undefined;

  const [coverageResult, orderStatsResult, recentEditResult, coOrderedResult] = await Promise.all([
    getPromotionCoverage.execute({ categoryId: primaryCategoryId }, toolCtx),
    getItemOrderStats.execute({ menuItemIds: itemIds }, toolCtx),
    authClient
      .from('menu_edit_change_log')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .in('menu_item_id', itemIds)
      .gte('created_at', new Date(Date.now() - RECENT_ACTIVITY_WINDOW_MS).toISOString())
      .limit(1),
    getFrequentlyCoOrderedItems.execute({}, toolCtx),
  ]);

  const coverage = coverageResult.ok ? coverageResult.data : { campaignCoverage: 'none' as const, itemCoverage: 'none' as const };
  const orderStats = orderStatsResult.ok ? orderStatsResult.data : {};
  const orderCount = itemIds.reduce((sum, id) => sum + (orderStats[id]?.count ?? 0), 0);
  const hasRecentActivity = (recentEditResult.data?.length ?? 0) > 0;
  const dataQuality: 'good' | 'limited' = orderCount >= MIN_ORDERS_FOR_ANY_OPPORTUNITY ? 'good' : 'limited';

  const coOrderedPairs = coOrderedResult.ok ? coOrderedResult.data : [];
  const itemIdSet = new Set(itemIds);
  const coOrderedNames = Array.from(
    new Set(
      coOrderedPairs
        .filter((pair) => itemIdSet.has(pair.itemAId) !== itemIdSet.has(pair.itemBId))
        .map((pair) => (itemIdSet.has(pair.itemAId) ? pair.itemBName : pair.itemAName)),
    ),
  );

  const confidence = computeConfidence(preview.matchKind);
  const primaryCategoryName = categoryIds.length === 1 ? (preview.items[0]?.categoryName ?? null) : null;

  const adapter = makeMenuEditDecisionCopyAdapter(action);
  const decisionCard = composeDecisionCard(adapter, {
    matchKind: preview.matchKind,
    itemCount: preview.items.length,
    scheduleParseFailed: false,
    impact: { revenueImpact: preview.revenueImpact, margin: preview.margin, warnings: preview.warnings },
    confidence,
    campaignCoverage: coverage.campaignCoverage,
    itemCoverage: coverage.itemCoverage,
    hasRecentActivity,
    orderCount,
    dataQuality,
    itemNames: preview.items.map((i) => i.name),
    categoryName: primaryCategoryName,
    coOrderedNames,
    campaignOverlap: coverage.campaignCoverage === 'active',
  });

  return NextResponse.json({
    ...preview,
    // Same generalization as discount-action/preview/route.ts — the generic
    // view-model ProposalCard.tsx renders. `items` overrides the raw
    // ResolvedMenuEditItem[] spread above.
    items: preview.items.map(toItemView),
    copy: composeProposalCopy(action),
    revalidation,
    confidence,
    dataQuality,
    ...decisionCard,
  });
}

import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { isResolvableAction, type ResolvableAction, type ResolvedDiscountItem } from '@/lib/menu-discount-actions/resolve';
import {
  revalidateProposal,
  computeConfidence,
  composeExecutiveSummary,
  composeWhyNow,
  composeConfidenceEvidence,
  composeConsiderations,
  explainProposalBullets,
  computeDecisionScore,
  composeDecisionSummary,
  composeTradeoffs,
  composeAlternatives,
  composeWhyThisRecommendation,
  composeSuccessMetrics,
  composeMonitoringReminder,
} from '@/lib/restaurant-planner/capabilities/menu-pricing';
import { getProposalById } from '@/lib/restaurant-planner/proposals';
import { getRestaurant } from '@/lib/restaurant-planner/tools/restaurant';
import { previewPromotion } from '@/lib/restaurant-planner/tools/promotion';
import { getPromotionCoverage, getItemOrderStats, getFrequentlyCoOrderedItems } from '@/lib/restaurant-planner/tools/analytics';
import { MIN_ORDERS_FOR_ANY_OPPORTUNITY } from '@/lib/restaurant-planner/revenue-intelligence/facts';
import type { ToolContext } from '@/lib/restaurant-planner/tools/types';
import { makeServiceClient } from '@/lib/intelligence/generate-route-helpers';

const RECENT_DISCOUNT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

// POST /api/admin/menus/discount-action/preview
// Read-only: resolves a structured discount action (already parsed from
// natural language by the Restaurant Planner) against a restaurant's real
// menu data and returns a before/after preview plus a deterministic revenue
// impact estimate (lib/restaurant-planner/capabilities/menu-pricing.ts) —
// together these are the fields ProposalCard.tsx renders as the Proposal.
// Never writes. The session client is used throughout — RLS ("Owners read
// own menu items including deleted", 20260606040000_menu_items_enrichment.sql:83-91)
// is the real boundary, on top of the explicit ownership check below for a
// clean error message.
//
// V2: an optional proposalId diffs the freshly-resolved result against that
// proposal's persisted resolved_snapshot (Objective 3 — revalidation) and
// includes any drift as a `revalidation` field. Omitted entirely (a bare
// action with no proposal behind it), behavior is unchanged from Phase 1.

export async function POST(request: Request) {
  const authClient = createServerAuthClient();
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let restaurantId: string;
  let action: ResolvableAction;
  let proposalId: string | undefined;
  try {
    const body = await request.json();
    restaurantId = (body.restaurantId ?? '').trim();
    if (!isResolvableAction(body.action)) {
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

  const previewResult = await previewPromotion.execute({ action }, toolCtx);
  if (!previewResult.ok) {
    return NextResponse.json({ error: previewResult.reason }, { status: 500 });
  }
  const preview = previewResult.data;
  if (!preview.resolved) return NextResponse.json(preview);

  // V2 (Objective 4): a schedule the system couldn't parse silently falls
  // back to "starts immediately" — surfaced here as a visible warning
  // instead, since `action` (client-schedule-resolved) already carries the
  // flag by the time it reaches this route.
  if (action.type === 'set_discount' && action.discount.startTimeParseFailed) {
    preview.warnings.push("The requested start time couldn't be understood, so this will start immediately instead.");
  }

  let revalidation: { ok: boolean; reason?: string } | undefined;
  if (proposalId) {
    const proposal = await getProposalById(authClient, { proposalId, restaurantId });
    const snapshot = (proposal?.resolved_snapshot as unknown as ResolvedDiscountItem[] | null) ?? null;
    const check = revalidateProposal(snapshot, preview.items);
    revalidation = check.ok ? { ok: true } : { ok: false, reason: check.reason };
  }

  // V2 (Proposal Experience): everything below turns already-computed or
  // cheap, real, restaurant-scoped facts into the card's evidence sections
  // (Why Now, Confidence Evidence, Things To Consider, Executive Summary) —
  // no numbers are invented, and nothing here writes anything.
  const scheduleParseFailed = action.type === 'set_discount' && action.discount.startTimeParseFailed === true;
  const itemIds = preview.items.map((item) => item.id);
  const categoryIds = Array.from(new Set(preview.items.map((item) => item.categoryId)));
  const primaryCategoryId = categoryIds.length === 1 ? categoryIds[0] : undefined;

  const [coverageResult, orderStatsResult, recentDiscountResult, coOrderedResult] = await Promise.all([
    getPromotionCoverage.execute({ categoryId: primaryCategoryId }, toolCtx),
    getItemOrderStats.execute({ menuItemIds: itemIds }, toolCtx),
    authClient
      .from('menu_discount_change_log')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .in('menu_item_id', itemIds)
      .gte('created_at', new Date(Date.now() - RECENT_DISCOUNT_WINDOW_MS).toISOString())
      .limit(1),
    getFrequentlyCoOrderedItems.execute({}, toolCtx),
  ]);

  const coverage = coverageResult.ok ? coverageResult.data : { campaignCoverage: 'none' as const, itemCoverage: 'none' as const };
  const orderStats = orderStatsResult.ok ? orderStatsResult.data : {};
  const orderCount = itemIds.reduce((sum, id) => sum + (orderStats[id]?.count ?? 0), 0);
  const hasRecentDiscount = (recentDiscountResult.data?.length ?? 0) > 0;
  const allPricesKnown = preview.items.every((item) => item.price !== null);

  const considerations = composeConsiderations({ warnings: preview.warnings, campaignOverlap: coverage.campaignCoverage === 'active', orderCount });
  const confidence = computeConfidence(preview.matchKind, scheduleParseFailed);
  const confidenceEvidence = composeConfidenceEvidence({ matchKind: preview.matchKind, scheduleParseFailed, allPricesKnown, orderCount });
  const whyNow = composeWhyNow({ campaignCoverage: coverage.campaignCoverage, itemCoverage: coverage.itemCoverage, hasRecentDiscount });
  const reasoningBullets = explainProposalBullets({
    matchKind: preview.matchKind,
    itemCount: preview.items.length,
    scheduleParseFailed,
    impact: { revenueImpact: preview.revenueImpact, margin: preview.margin, warnings: preview.warnings },
  });
  const executiveSummary = composeExecutiveSummary({
    confidence,
    considerationCount: considerations.length,
    impact: { revenueImpact: preview.revenueImpact, margin: preview.margin, warnings: preview.warnings },
  });

  const dataQuality: 'good' | 'limited' = orderCount >= MIN_ORDERS_FOR_ANY_OPPORTUNITY ? 'good' : 'limited';

  // V1 (Decision Intelligence Layer): everything below is a second pass over
  // facts already computed above (plus one new query, coOrderedResult) — no
  // new resolution/confidence/apply logic.
  const coOrderedPairs = coOrderedResult.ok ? coOrderedResult.data : [];
  const itemIdSet = new Set(itemIds);
  const coOrderedNames = Array.from(
    new Set(
      coOrderedPairs
        .filter((pair) => itemIdSet.has(pair.itemAId) !== itemIdSet.has(pair.itemBId))
        .map((pair) => (itemIdSet.has(pair.itemAId) ? pair.itemBName : pair.itemAName)),
    ),
  );

  const evidenceMetCount = confidenceEvidence.filter((e) => e.met).length;
  const decisionTier = computeDecisionScore({ confidence, evidenceMetCount, dataQuality, considerationCount: considerations.length });
  const decisionSummary = composeDecisionSummary({
    tier: decisionTier,
    supportingFacts: confidenceEvidence.filter((e) => e.met).map((e) => e.label),
    riskFacts: considerations,
  });
  const tradeoffs = composeTradeoffs({
    benefitSignals: [...reasoningBullets, ...whyNow, ...(preview.revenueImpact ? [`Expected revenue impact: ${preview.revenueImpact}.`] : [])],
    riskSignals: considerations,
  });
  const primaryCategoryName = categoryIds.length === 1 ? (preview.items[0]?.categoryName ?? null) : null;
  // Alternatives are other promotional levers instead of applying a
  // discount — not meaningful for clear_discount (removing one).
  const alternatives = action.type === 'set_discount' ? composeAlternatives({ itemNames: preview.items.map((i) => i.name), coOrderedNames }) : [];
  const whyThisRecommendation = action.type === 'set_discount' ? composeWhyThisRecommendation(alternatives) : null;
  const successMetrics = composeSuccessMetrics({ itemNames: preview.items.map((i) => i.name), categoryName: primaryCategoryName });
  const monitoringReminder = composeMonitoringReminder(decisionTier);

  return NextResponse.json({
    ...preview,
    revalidation,
    confidence,
    considerations,
    confidenceEvidence,
    whyNow,
    reasoningBullets,
    executiveSummary,
    dataQuality,
    decisionSummary,
    tradeoffs,
    alternatives,
    whyThisRecommendation,
    successMetrics,
    monitoringReminder,
  });
}

import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { fetchAssignedMenus, fetchMenuContents } from '@/lib/menu/queries';
import { resolveMenuDiscountAction, isResolvableAction, type ResolvableAction, type ResolvedDiscountItem } from '@/lib/menu-discount-actions/resolve';
import { revalidateProposal } from '@/lib/restaurant-planner/capabilities/menu-pricing';
import { getProposalById, insertProposalVersion } from '@/lib/restaurant-planner/proposals';
import { isCapabilityAvailable, explainCapabilityUnavailable } from '@/lib/restaurant-planner/tool-registry';
import { getRestaurant } from '@/lib/restaurant-planner/tools/restaurant';
import { applyPromotion } from '@/lib/restaurant-planner/tools/promotion';
import type { ToolContext } from '@/lib/restaurant-planner/tools/types';
import { makeServiceClient } from '@/lib/intelligence/generate-route-helpers';

// POST /api/admin/menus/discount-action/apply
// The only route in this feature that writes. Deliberately does NOT trust a
// client-supplied "resolved items" diff (which could be stale or tampered
// with) — it re-runs the exact same resolve() the preview route used,
// against current live data, then hands the freshly-resolved items to the
// menu_pricing capability's applyDiscountProposal() (the actual writer,
// lib/restaurant-planner/capabilities/menu-pricing.ts) to write. Writes go
// through the session-authenticated client so RLS's "owners update own menu
// items" policy (20260609020000_phase_c1_h6_h5_h2_security_hardening.sql:101-119)
// is the real authorization boundary, same precedent as
// app/admin/menus/[menuId]/page.tsx. Each successful write gets its own
// menu_discount_change_log row (20260709040000_menu_discount_change_log.sql).
//
// V2: an optional proposalId is (a) revalidated against its persisted
// resolved_snapshot before writing anything — a mismatch aborts with 409
// and "generate a new proposal" rather than applying against unreviewed
// drift (Objective 3) — and (b) on success, gets a new 'executed' version
// row appended (Objective 8). Omitted entirely, behavior is unchanged from
// Phase 1.

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

  // Capability Management: re-checked here, not just at proposal-creation
  // time in messages/route.ts — the capability could have been disabled in
  // the gap between a proposal being drafted and Approve being clicked.
  // "Instead of attempting execution" per Capability Management's contract:
  // this aborts before any resolution/write happens.
  const capabilityAvailable = await isCapabilityAvailable(toolCtx.serviceClient, {
    capabilityKey: 'menu_pricing',
    restaurantId,
    ownerId: userData.user.id,
  });
  if (!capabilityAvailable) {
    return NextResponse.json({ error: explainCapabilityUnavailable('menu_pricing') }, { status: 403 });
  }

  const menus = await fetchAssignedMenus(authClient, restaurantId);
  const { categories, items } = await fetchMenuContents(
    authClient,
    menus.map((m) => m.id),
  );

  const resolved = resolveMenuDiscountAction(action, categories, items);
  if (!resolved.resolved) {
    return NextResponse.json({ error: resolved.reason }, { status: 409 });
  }

  const proposal = proposalId ? await getProposalById(authClient, { proposalId, restaurantId }) : null;

  if (proposal) {
    const snapshot = (proposal.resolved_snapshot as unknown as ResolvedDiscountItem[] | null) ?? null;
    const check = revalidateProposal(snapshot, resolved.items);
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 409 });
    }
  }

  const applyResult = await applyPromotion.execute({ items: resolved.items }, toolCtx);
  if (!applyResult.ok) {
    return NextResponse.json({ error: applyResult.reason }, { status: 500 });
  }
  const result = applyResult.data;

  if (proposal && result.applied > 0) {
    // Best-effort — the write already succeeded; a failure to record the
    // 'executed' version must not be reported as if the apply itself failed.
    try {
      await insertProposalVersion(authClient, {
        proposalGroupId: proposal.proposal_group_id,
        restaurantId,
        conversationId: proposal.conversation_id,
        capability: proposal.capability,
        action: proposal.action,
        resolvedSnapshot: proposal.resolved_snapshot,
        confidence: proposal.confidence,
        reasoning: proposal.reasoning,
        planTasks: proposal.plan_tasks,
        status: 'executed',
        createdBy: userData.user.id,
      });
    } catch (err) {
      console.error('[discount-action/apply] Failed to record executed proposal version:', err);
    }
  }

  return NextResponse.json(result);
}

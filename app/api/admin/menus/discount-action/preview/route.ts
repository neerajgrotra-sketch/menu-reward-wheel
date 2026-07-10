import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { isResolvableAction, type ResolvableAction, type ResolvedDiscountItem } from '@/lib/menu-discount-actions/resolve';
import { revalidateProposal } from '@/lib/restaurant-planner/capabilities/menu-pricing';
import { getProposalById } from '@/lib/restaurant-planner/proposals';
import { getRestaurant } from '@/lib/restaurant-planner/tools/restaurant';
import { previewPromotion } from '@/lib/restaurant-planner/tools/promotion';
import type { ToolContext } from '@/lib/restaurant-planner/tools/types';
import { makeServiceClient } from '@/lib/intelligence/generate-route-helpers';

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

  return NextResponse.json({ ...preview, revalidation });
}

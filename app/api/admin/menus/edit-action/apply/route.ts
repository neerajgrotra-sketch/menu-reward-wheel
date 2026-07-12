import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { fetchAssignedMenus, fetchMenuContents } from '@/lib/menu/queries';
import { resolveMenuEditAction, isResolvableMenuEditAction, type ResolvedMenuEditItem } from '@/lib/menu-edit-actions/resolve';
import type { MenuEditAction } from '@/lib/intelligence/actions/menu-edit-schema';
import { revalidateProposal } from '@/lib/restaurant-planner/capabilities/menu-edit';
import { getProposalById, insertProposalVersion } from '@/lib/restaurant-planner/proposals';
import { isCapabilityAvailable, explainCapabilityUnavailable } from '@/lib/restaurant-planner/tool-registry';
import { getRestaurant } from '@/lib/restaurant-planner/tools/restaurant';
import { applyMenuEdit } from '@/lib/restaurant-planner/tools/menu-edit';
import type { ToolContext } from '@/lib/restaurant-planner/tools/types';
import { makeServiceClient } from '@/lib/intelligence/generate-route-helpers';

// POST /api/admin/menus/edit-action/apply
// The only route in this feature that writes — the menu_edit sibling of
// discount-action/apply/route.ts, same structure: never trusts a
// client-supplied "resolved items" diff, re-runs resolveMenuEditAction
// against current live data, then hands the freshly-resolved items to
// applyMenuEdit (the actual writer, capabilities/menu-edit.ts). Writes go
// through the session-authenticated client so RLS is the real authorization
// boundary. Each successful write gets its own menu_edit_change_log row.

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

  // Capability Management: re-checked here, not just at proposal-creation
  // time in messages/route.ts — the capability could have been disabled in
  // the gap between a proposal being drafted and Approve being clicked.
  const capabilityAvailable = await isCapabilityAvailable(toolCtx.serviceClient, {
    capabilityKey: 'menu_agent',
    restaurantId,
    ownerId: userData.user.id,
  });
  if (!capabilityAvailable) {
    return NextResponse.json({ error: explainCapabilityUnavailable('menu_agent') }, { status: 403 });
  }

  const menus = await fetchAssignedMenus(authClient, restaurantId);
  const { categories, items } = await fetchMenuContents(
    authClient,
    menus.map((m) => m.id),
  );

  // Bulk Edit Safety (resolve.ts's NEEDS_EXPLICIT_BULK_TARGET gate):
  // bulkConfirmed:true here, always — by the time /apply is called, a
  // proposal was already successfully built and shown (the only way a
  // rename_item/update_description targeting >1 item ever reaches this
  // point is via the explicit TargetSelector confirmation round trip; any
  // unconfirmed multi-item attempt dead-ends at a clarification and never
  // becomes an approvable proposal at all). Re-applying the gate here would
  // incorrectly re-block an already-approved bulk rename/description.
  const resolved = resolveMenuEditAction(action, categories, items, { bulkConfirmed: true });
  if (!resolved.resolved) {
    return NextResponse.json({ error: resolved.reason }, { status: 409 });
  }

  const proposal = proposalId ? await getProposalById(authClient, { proposalId, restaurantId }) : null;

  if (proposal) {
    const snapshot = (proposal.resolved_snapshot as unknown as ResolvedMenuEditItem[] | null) ?? null;
    const check = revalidateProposal(snapshot, resolved.items);
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 409 });
    }
  }

  const applyResult = await applyMenuEdit.execute({ items: resolved.items }, toolCtx);
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
      console.error('[edit-action/apply] Failed to record executed proposal version:', err);
    }
  }

  return NextResponse.json(result);
}

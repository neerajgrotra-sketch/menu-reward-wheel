import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { getProposalGroupHistory } from '@/lib/restaurant-planner/proposals';
import { getRestaurant } from '@/lib/restaurant-planner/tools/restaurant';
import type { ToolContext } from '@/lib/restaurant-planner/tools/types';
import { makeServiceClient } from '@/lib/intelligence/generate-route-helpers';

// GET /api/admin/assistant/proposals/history?restaurantId=...&proposalGroupId=...
// Read-only — surfaces the version history a proposal group already has.
// restaurant_planner_proposals has been append-only and versioned since V2
// (getProposalGroupHistory existed from the start) but nothing ever called
// it until Proposal Experience V2's collapsible "Proposal History" section.
// RLS ("owners read own proposals") is the real restaurant-scoping
// boundary, same posture as discount-action/preview's ownership check; the
// restaurant_id filter below is a defensive belt-and-suspenders check on a
// newly exposed endpoint, not a substitute for it.
export async function GET(request: Request) {
  const authClient = createServerAuthClient();
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const restaurantId = (url.searchParams.get('restaurantId') ?? '').trim();
  const proposalGroupId = (url.searchParams.get('proposalGroupId') ?? '').trim();
  if (!restaurantId || !proposalGroupId) {
    return NextResponse.json({ error: 'restaurantId and proposalGroupId are required.' }, { status: 400 });
  }

  const toolCtx: ToolContext = { supabase: authClient, serviceClient: makeServiceClient(), restaurantId, ownerId: userData.user.id };
  const restaurantResult = await getRestaurant.execute({}, toolCtx);
  if (!restaurantResult.ok) {
    return NextResponse.json({ error: restaurantResult.reason }, { status: 403 });
  }

  const history = await getProposalGroupHistory(authClient, proposalGroupId);
  return NextResponse.json({ history: history.filter((row) => row.restaurant_id === restaurantId) });
}

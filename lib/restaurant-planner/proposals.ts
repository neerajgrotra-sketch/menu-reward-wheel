// Data-access helpers for restaurant_planner_proposals — append-only, same
// convention as every other table in this system (dashboard_assistant_messages,
// menu_discount_change_log, intelligence_audit_log): a "modify" or a status
// transition is always a new INSERT, never an UPDATE. "Current" version of a
// proposal is always max(version) for a given proposal_group_id, computed at
// read time — no row here is ever mutated after insert.

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import type { ProposalStatus } from './proposal';

export type ProposalRow = Database['public']['Tables']['restaurant_planner_proposals']['Row'];

export type NewProposalVersionParams = {
  // Omit to start a brand-new proposal group (version 1). Provide an
  // existing group id to insert the next version of it.
  proposalGroupId?: string;
  restaurantId: string;
  conversationId: string;
  capability: string;
  action: Json;
  resolvedSnapshot: Json | null;
  confidence: string | null;
  reasoning: string | null;
  planTasks: Json | null;
  status: ProposalStatus;
  relatedMessageId?: string | null;
  createdBy: string;
};

export async function insertProposalVersion(
  supabase: SupabaseClient<Database>,
  params: NewProposalVersionParams,
): Promise<ProposalRow> {
  let version = 1;
  let groupId = params.proposalGroupId;

  if (groupId) {
    const { data: latest } = await supabase
      .from('restaurant_planner_proposals')
      .select('version')
      .eq('proposal_group_id', groupId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    version = (latest?.version ?? 0) + 1;
  }

  // Version 1 of a new group: this row's own id doubles as the group id.
  // Generated here (not left to the DB default) because the self-referencing
  // proposal_group_id FK requires the referenced row to exist at insert
  // time — inserting id = proposal_group_id in the same statement satisfies
  // that in one round trip instead of insert-then-update.
  const id = groupId ?? randomUUID();
  if (!groupId) groupId = id;

  const { data, error } = await supabase
    .from('restaurant_planner_proposals')
    .insert({
      id,
      proposal_group_id: groupId,
      version,
      restaurant_id: params.restaurantId,
      conversation_id: params.conversationId,
      capability: params.capability,
      action: params.action,
      resolved_snapshot: params.resolvedSnapshot,
      confidence: params.confidence,
      reasoning: params.reasoning,
      plan_tasks: params.planTasks,
      status: params.status,
      related_message_id: params.relatedMessageId ?? null,
      created_by: params.createdBy,
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Could not save the proposal.');
  return data;
}

// The single most recently created proposal row in a conversation — since
// every version of a group is inserted the instant its predecessor is acted
// on, the newest row across the whole conversation is always "whichever
// proposal is currently live," whether that's a fresh group or a later
// version of an older one.
export async function getLatestProposalForConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
): Promise<ProposalRow | null> {
  const { data } = await supabase
    .from('restaurant_planner_proposals')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// Exported (Restaurant Tool Library) — previously duplicated as a private
// array in both this file and a second, separately-defined
// OPEN_PROPOSAL_STATUSES constant in app/api/admin/assistant/messages/route.ts.
// One definition now; the route imports this instead of redeclaring it.
export const OPEN_STATUSES: ProposalStatus[] = ['draft', 'modified'];

// The conversation's currently-open proposal (if any) — combines
// getLatestProposalForConversation with the open-status filter that used to
// be applied separately, inline, at each call site.
export async function getOpenProposalForConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
): Promise<ProposalRow | null> {
  const latest = await getLatestProposalForConversation(supabase, conversationId);
  return latest && OPEN_STATUSES.includes(latest.status as ProposalStatus) ? latest : null;
}

// Re-verifies a model-supplied refersToProposalId before trusting it as a
// "modify this proposal" target — never trusted outright, matching the
// existing conversationId re-verification pattern in messages/route.ts. A
// closed (approved/cancelled/executed) or foreign-conversation group id
// returns null, meaning the caller should start a fresh group instead of
// silently guessing.
export async function findOpenProposalGroup(
  supabase: SupabaseClient<Database>,
  params: { proposalGroupId: string; conversationId: string; restaurantId: string },
): Promise<ProposalRow | null> {
  const { data } = await supabase
    .from('restaurant_planner_proposals')
    .select('*')
    .eq('proposal_group_id', params.proposalGroupId)
    .eq('conversation_id', params.conversationId)
    .eq('restaurant_id', params.restaurantId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || !OPEN_STATUSES.includes(data.status as ProposalStatus)) return null;
  return data;
}

// A single specific version row, restaurant-scoped — used by the
// preview/apply routes (Objective 3: revalidation) to fetch the exact
// resolved_snapshot a proposal was shown with, to diff against live data.
export async function getProposalById(
  supabase: SupabaseClient<Database>,
  params: { proposalId: string; restaurantId: string },
): Promise<ProposalRow | null> {
  const { data } = await supabase
    .from('restaurant_planner_proposals')
    .select('*')
    .eq('id', params.proposalId)
    .eq('restaurant_id', params.restaurantId)
    .maybeSingle();
  return data ?? null;
}

// Full version history for a group, oldest first — free given the
// append-only design (Objective 8: proposal versioning).
export async function getProposalGroupHistory(
  supabase: SupabaseClient<Database>,
  proposalGroupId: string,
): Promise<ProposalRow[]> {
  const { data } = await supabase
    .from('restaurant_planner_proposals')
    .select('*')
    .eq('proposal_group_id', proposalGroupId)
    .order('version', { ascending: true });
  return data ?? [];
}

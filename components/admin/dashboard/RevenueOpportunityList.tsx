'use client';

import { useState } from 'react';
import type { RevenueGoalKey, RevenueOpportunity } from '@/lib/restaurant-planner/types';
import { REVENUE_GOAL_LABEL } from '@/lib/restaurant-planner/types';
import type { DashboardAssistantMessage } from '@/lib/dashboard-assistant/types';
import type { Database } from '@/lib/supabase/database.types';
import { DashboardIcon } from './icons';

// Revenue Intelligence Agent V1 — renders the ranked opportunity list a
// revenue_opportunities message carries. Reuses ProposalCard's visual
// language (rounded card, confidence badge palette, min-h-[44px] touch
// targets, focus rings, dash-fade-in entrance) rather than inventing a new
// one — this is a sibling surface to ProposalCard, not a competing design.
// "Create Proposal" hands off to the exact same downstream experience:
// clicking it turns this opportunity into an ordinary menu_pricing
// proposal, which then renders through the unchanged ProposalCard/Approve
// flow — nothing here ever applies anything itself.

type ProposalRow = Database['public']['Tables']['restaurant_planner_proposals']['Row'];

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-[#E7F3EC] text-[#1F8A5B]',
  medium: 'bg-[#FBF0DF] text-[#A9600B]',
  low: 'bg-[#FBEAE6] text-[#C1442D]',
};

type Props = {
  restaurantId: string;
  conversationId: string;
  goal: RevenueGoalKey;
  opportunities: RevenueOpportunity[];
  listMessageId: string;
  isConverted: (opportunityId: string) => boolean;
  isDismissed: (opportunityId: string) => boolean;
  onDismiss: (opportunityId: string) => void;
  onProposalCreated: (payload: { assistantMessage: DashboardAssistantMessage; proposal?: ProposalRow }) => void;
};

export function RevenueOpportunityList({ restaurantId, conversationId, goal, opportunities, listMessageId, isConverted, isDismissed, onDismiss, onProposalCreated }: Props) {
  return (
    <div className="mt-3 animate-[dash-fade-in_0.2s_ease-out] space-y-3">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFE9FB] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#6C4FD1]">
        <DashboardIcon name="radar" className="h-3 w-3" />
        {REVENUE_GOAL_LABEL[goal]}
      </span>
      {opportunities.map((opportunity, index) => (
        <OpportunityCard
          key={opportunity.id}
          restaurantId={restaurantId}
          conversationId={conversationId}
          listMessageId={listMessageId}
          opportunity={opportunity}
          index={index}
          converted={isConverted(opportunity.id)}
          dismissed={isDismissed(opportunity.id)}
          onDismiss={() => onDismiss(opportunity.id)}
          onProposalCreated={onProposalCreated}
        />
      ))}
    </div>
  );
}

type CardProps = {
  restaurantId: string;
  conversationId: string;
  listMessageId: string;
  opportunity: RevenueOpportunity;
  index: number;
  converted: boolean;
  dismissed: boolean;
  onDismiss: () => void;
  onProposalCreated: (payload: { assistantMessage: DashboardAssistantMessage; proposal?: ProposalRow }) => void;
};

function OpportunityCard({ restaurantId, conversationId, listMessageId, opportunity, index, converted, dismissed, onDismiss, onProposalCreated }: CardProps) {
  const [expanded, setExpanded] = useState(index === 0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  if (dismissed) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-4 opacity-60">
        <p className="text-sm font-semibold text-stone-500">{opportunity.title} — dismissed.</p>
      </div>
    );
  }

  async function handleCreateProposal() {
    setCreating(true);
    setError('');
    try {
      const response = await fetch('/api/admin/assistant/revenue-intelligence/create-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, conversationId, relatedMessageId: listMessageId, opportunityId: opportunity.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Couldn't create that proposal.");
      onProposalCreated(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create that proposal — send it again to retry.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C4FD1]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="flex-none text-stone-400">{expanded ? '▾' : '▸'}</span>
          <span className="min-w-0 truncate text-sm font-black text-[#1F1F1F]">{opportunity.title}</span>
        </span>
        <span className={`flex-none rounded-full px-2.5 py-1 text-xs font-black uppercase tracking-wide ${CONFIDENCE_STYLE[opportunity.confidence] ?? 'bg-stone-100 text-stone-500'}`}>
          {opportunity.confidence} confidence
        </span>
      </button>

      {expanded && (
        <div className="mt-3">
          {opportunity.expectedImpact && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="font-bold text-stone-500">Expected impact</dt>
              <dd className="text-right font-bold text-[#1F8A5B]">{opportunity.expectedImpact}</dd>
            </dl>
          )}

          <div className="mt-3 rounded-xl bg-[#FBFAF8] p-3">
            <p className="text-xs font-black uppercase tracking-wide text-stone-400">What I found</p>
            <p className="mt-1 text-sm text-stone-600">{opportunity.observation}</p>
          </div>

          <div className="mt-3 rounded-xl bg-[#FBFAF8] p-3">
            <p className="text-xs font-black uppercase tracking-wide text-stone-400">Why this recommendation</p>
            <p className="mt-1 text-sm text-stone-600">{opportunity.reasoning}</p>
          </div>

          {opportunity.assumptions.length > 0 && (
            <ul className="mt-3 space-y-1">
              {opportunity.assumptions.map((assumption) => (
                <li key={assumption} className="text-xs font-semibold text-stone-400">⚠ {assumption}</li>
              ))}
            </ul>
          )}

          {opportunity.affectedItems.length > 0 && (
            <p className="mt-3 text-sm">
              <span className="font-black text-[#1F1F1F]">Affected items: </span>
              <span className="text-stone-600">{opportunity.affectedItems.join(', ')}</span>
            </p>
          )}

          {error && (
            <div className="mt-3 rounded-xl bg-red-50 p-3">
              <p className="text-sm font-bold text-red-600">{error}</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {converted ? (
              <span className="inline-flex min-h-[44px] items-center rounded-full bg-[#E7F3EC] px-4 py-2 text-sm font-bold text-[#1F8A5B]">
                <DashboardIcon name="check" className="mr-1.5 h-3.5 w-3.5" />
                Proposal created — see below
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onDismiss}
                  disabled={creating}
                  className="min-h-[44px] rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-500 hover:text-[#1F1F1F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 disabled:opacity-50"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={handleCreateProposal}
                  disabled={creating}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-[#FF6B00] px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B00] disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Creating…
                    </>
                  ) : (
                    <>
                      <DashboardIcon name="dollar" className="h-3.5 w-3.5" />
                      Create Proposal
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { DashboardAssistantMessage } from '@/lib/dashboard-assistant/types';
import type { Database } from '@/lib/supabase/database.types';
import { DashboardIcon } from './icons';

type ProposalRow = Database['public']['Tables']['restaurant_planner_proposals']['Row'];

// Objective 2 — structured target selection: renders real, resolver-sourced
// candidates (lib/restaurant-planner/types.ts's PlannerCandidate) as
// checkboxes instead of asking the user to retype a name in chat. Submitting
// calls /api/admin/assistant/target-selection directly — no LLM round trip,
// since the candidates themselves already came from the deterministic
// resolver, never from the model.

type Candidate = { name: string; categoryName: string };

type Props = {
  restaurantId: string;
  conversationId: string;
  relatedMessageId: string;
  candidates: Candidate[];
  onResolved: (payload: { userMessage: DashboardAssistantMessage; assistantMessage: DashboardAssistantMessage; proposal?: ProposalRow }) => void;
  // Cancel needs its own outcome message (same shape ProposalCard's Cancel
  // reports via /messages/outcome) — otherwise nothing is persisted and,
  // per isClarificationLive's "still the most recent assistant turn" rule,
  // the exact same checkboxes reappear unresolved on the next page load.
  onCancelled: (outcomeMessage: DashboardAssistantMessage) => void;
  onDismiss: () => void;
};

export function TargetSelector({ restaurantId, conversationId, relatedMessageId, candidates, onResolved, onCancelled, onDismiss }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');

  async function handleCancel() {
    setCancelling(true);
    setError('');
    try {
      const response = await fetch('/api/admin/assistant/messages/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, conversationId, relatedMessageId, payload: { kind: 'cancelled' } }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Couldn't cancel that.");
      onCancelled(payload.outcomeMessage);
      onDismiss();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't cancel that.");
      setCancelling(false);
    }
  }

  function toggle(name: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function submit(selection: string[] | 'all') {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/admin/assistant/target-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, conversationId, relatedMessageId, selection }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Couldn't apply that selection.");
      if (payload.userMessage && payload.assistantMessage) onResolved(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't apply that selection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 animate-[dash-fade-in_0.2s_ease-out] rounded-2xl border border-stone-200 bg-white p-4">
      {error && (
        <div className="mb-3 rounded-xl bg-red-50 p-3">
          <p className="text-sm font-bold text-red-600">{error}</p>
        </div>
      )}
      <p className="text-sm font-black text-[#1F1F1F]">Select which items to include:</p>
      <ul className="mt-2 max-h-64 divide-y divide-stone-100 overflow-y-auto">
        {candidates.map((candidate) => (
          <li key={candidate.name}>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(candidate.name)}
                onChange={() => toggle(candidate.name)}
                className="h-4 w-4 flex-none accent-[#FF6B00]"
              />
              <span className="min-w-0 truncate font-semibold text-[#1F1F1F]">{candidate.name}</span>
              {candidate.categoryName && <span className="flex-none text-xs font-semibold text-stone-400">{candidate.categoryName}</span>}
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={handleCancel} disabled={submitting || cancelling} className="min-h-[44px] rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-500 hover:text-[#1F1F1F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 disabled:opacity-50">
          {cancelling ? 'Cancelling…' : 'Cancel'}
        </button>
        <button type="button" onClick={() => submit('all')} disabled={submitting || cancelling} className="min-h-[44px] rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-500 hover:text-[#1F1F1F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 disabled:opacity-50">
          Apply to all
        </button>
        <button
          type="button"
          onClick={() => submit(Array.from(selected))}
          disabled={submitting || cancelling || selected.size === 0}
          className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-[#FF6B00] px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B00] disabled:opacity-50"
        >
          {submitting ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Applying…
            </>
          ) : (
            <>
              <DashboardIcon name="check" className="h-3.5 w-3.5" />
              Apply to selected {selected.size > 0 ? `(${selected.size})` : ''}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

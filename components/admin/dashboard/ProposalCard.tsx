'use client';

import { useEffect, useState } from 'react';
import type { ResolvableAction, ResolvedDiscountItem } from '@/lib/menu-discount-actions/resolve';
import type { DashboardAssistantMessage } from '@/lib/dashboard-assistant/types';
import type { ActionOutcomePayload } from '@/lib/dashboard-assistant/outcome';
import type { Database } from '@/lib/supabase/database.types';
import { DashboardIcon } from './icons';

// Renders the generalized proposal envelope (Promotion / Discount /
// Schedule / Visibility / Estimated Revenue Impact / Estimated Margin /
// Warnings / Confidence / Why this recommendation / Approve / Modify /
// Cancel) for menu_pricing — the one capability with real endpoints
// (lib/restaurant-planner/tool-registry.ts). A future capability's proposal
// renders through this same card by supplying the same fields; only the
// `action` prop's resolution/apply endpoints would differ, looked up via
// CAPABILITY_REGISTRY rather than hardcoded here.
//
// V2: the `proposal` prop (a persisted restaurant_planner_proposals row) is
// what makes the initial render instant — the matched items, confidence,
// reasoning, and plan tasks are already known from when the message was
// created, no network round trip needed. A background /preview call (still
// made, now carrying proposalId) both refreshes the revenue-impact estimate
// and revalidates the snapshot against live data (Objective 3) — if
// something changed since the proposal was shown, Approve is disabled and a
// warning explains why, rather than silently applying against stale numbers.

type ProposalRow = Database['public']['Tables']['restaurant_planner_proposals']['Row'];
type PlanTask = { id: string; label: string; status: 'pending' | 'completed' | 'blocked' | 'failed' };

type PreviewResponse =
  | { resolved: true; items: ResolvedDiscountItem[]; revenueImpact: string | null; margin: string | null; warnings: string[]; revalidation?: { ok: boolean; reason?: string } }
  | { resolved: false; reason: string; candidates?: string[] };

type ApplyResponse = { applied: number; total: number; failed?: Array<{ name: string; error?: string }>; skippedNoOp?: string[] };

// Visibility is static in Phase 1 — every menu_pricing promotion surfaces
// in these two places; there's no per-proposal visibility control yet.
const VISIBILITY = ['QR Menu', 'Promotion Banner'];

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-[#E7F3EC] text-[#1F8A5B]',
  medium: 'bg-[#FBF0DF] text-[#A9600B]',
  low: 'bg-[#FBEAE6] text-[#C1442D]',
};

const PLAN_TASK_ICON: Record<PlanTask['status'], string> = {
  completed: '✓',
  pending: '…',
  blocked: '⚠',
  failed: '✕',
};

type Props = {
  restaurantId: string;
  action: ResolvableAction;
  proposal?: ProposalRow | null;
  onDismiss: () => void;
  // When present, resolving this proposal (ambiguous / applied / cancelled)
  // is also recorded as a chat message via
  // POST /api/admin/assistant/messages/outcome, so a clarifying reply can see
  // the real candidate names and so the proposal stops rendering as live on
  // reload (lib/dashboard-assistant/types.ts's isProposalLive). Omitted
  // entirely keeps this component's original standalone behavior.
  conversationId?: string;
  messageId?: string;
  onResolved?: (outcomeMessage: DashboardAssistantMessage) => void;
  // Prefills the chat input with an editable restatement of this proposal
  // and dismisses the card — the user's correction becomes an ordinary next
  // chat message, resolved by the planner using the existing
  // transcript-continuation mechanism. No dedicated "edit" endpoint.
  onModify?: (draftText: string) => void;
};

function describeState(state: { specialEnabled: boolean; specialType: string | null; specialPercent: number | null; specialPrice: number | null }): string {
  if (!state.specialEnabled) return 'No discount';
  if (state.specialType === 'percentage') return `${state.specialPercent}% off`;
  if (state.specialType === 'fixed_price') return `$${Number(state.specialPrice).toFixed(2)}`;
  return 'Discount';
}

function scheduleLabel(action: ResolvableAction): string {
  if (action.type === 'clear_discount') return 'Immediate';
  const { specialStartAt, specialNoExpiry } = action.discount;
  const start = specialStartAt ? `Starts ${new Date(specialStartAt).toLocaleString()}` : 'Immediate';
  const end = specialNoExpiry ? 'Until manually ended' : 'Ends automatically';
  return `${start} · ${end}`;
}

function promotionLabel(action: ResolvableAction): string {
  if (action.type === 'clear_discount') return 'Remove discount';
  return action.discount.discountType === 'percentage'
    ? `${action.discount.value}% discount`
    : `Fixed price $${action.discount.value}`;
}

export function ProposalCard({ restaurantId, action, proposal, onDismiss, conversationId, messageId, onResolved, onModify }: Props) {
  const initialSnapshot = (proposal?.resolved_snapshot as unknown as ResolvedDiscountItem[] | null) ?? null;
  const [preview, setPreview] = useState<PreviewResponse | null>(
    initialSnapshot ? { resolved: true, items: initialSnapshot, revenueImpact: null, margin: null, warnings: [] } : null,
  );
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const planTasks = (proposal?.plan_tasks as unknown as PlanTask[] | null) ?? null;
  const confidence = proposal?.confidence ?? null;
  const staleness = preview && preview.resolved ? preview.revalidation : undefined;

  async function reportOutcome(payload: ActionOutcomePayload) {
    if (!conversationId || !messageId) return;
    try {
      const response = await fetch('/api/admin/assistant/messages/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, conversationId, relatedMessageId: messageId, payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.outcomeMessage) onResolved?.(result.outcomeMessage);
    } catch {
      // Best-effort: the underlying menu change already applied/was declined
      // successfully — a failure to log the chat outcome must not be
      // reported as if the action itself failed.
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError('');
      try {
        const response = await fetch('/api/admin/menus/discount-action/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurantId, action, proposalId: proposal?.id }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "Couldn't check your menu right now.");
        if (!cancelled) setPreview(payload);
        if (!cancelled && payload && payload.resolved === false) {
          await reportOutcome({ kind: 'ambiguous', reason: payload.reason, candidates: payload.candidates });
        }
      } catch (err) {
        // A background refresh failing is not fatal if we already have an
        // instant render from the persisted proposal — only surface an
        // error state if there was nothing to show in the first place.
        if (!cancelled && !initialSnapshot) setError(err instanceof Error ? err.message : "Couldn't check your menu right now.");
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryToken]);

  async function handleApply() {
    setApplying(true);
    setError('');
    try {
      const response = await fetch('/api/admin/menus/discount-action/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, action, proposalId: proposal?.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Couldn't apply that change.");
      setApplyResult(payload);
      await reportOutcome({ kind: 'applied', applied: payload.applied, total: payload.total, failed: payload.failed });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't apply that change.");
    } finally {
      setApplying(false);
    }
  }

  async function handleCancel() {
    await reportOutcome({ kind: 'cancelled' });
    onDismiss();
  }

  function handleModify() {
    onModify?.(`Change this proposal: ${promotionLabel(action)} — `);
    onDismiss();
  }

  return (
    <div className="mt-3 animate-[dash-fade-in_0.2s_ease-out] rounded-2xl border border-stone-200 bg-white p-4">
      {error && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-red-50 p-3">
          <p className="text-sm font-bold text-red-600">{error}</p>
          {!preview && (
            <button
              type="button"
              onClick={() => setRetryToken((n) => n + 1)}
              className="rounded-full border border-red-300 px-3 py-1 text-xs font-black text-red-600 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {!preview && !error && <p className="text-sm font-semibold text-stone-400">Checking your menu…</p>}

      {preview && !preview.resolved && (
        <div>
          <p className="text-sm font-bold text-[#1F1F1F]">{preview.reason}</p>
          {preview.candidates && preview.candidates.length > 0 && (
            <p className="mt-1 text-sm text-stone-500">Did you mean: {preview.candidates.join(', ')}?</p>
          )}
          <button type="button" onClick={onDismiss} className="mt-3 min-h-[44px] rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-500 hover:text-[#1F1F1F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400">
            Dismiss
          </button>
        </div>
      )}

      {preview && preview.resolved && !applyResult && (
        <div>
          {confidence && (
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black uppercase tracking-wide ${CONFIDENCE_STYLE[confidence] ?? 'bg-stone-100 text-stone-500'}`}>
              {confidence} confidence
            </span>
          )}

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="font-bold text-stone-500">Promotion</dt>
            <dd className="text-right font-bold text-[#1F1F1F]">{promotionLabel(action)}</dd>
            <dt className="font-bold text-stone-500">Schedule</dt>
            <dd className="text-right text-[#1F1F1F]">{scheduleLabel(action)}</dd>
            <dt className="font-bold text-stone-500">Visibility</dt>
            <dd className="text-right text-[#1F1F1F]">{VISIBILITY.join(', ')}</dd>
            {preview.revenueImpact && (
              <>
                <dt className="font-bold text-stone-500">Est. revenue impact</dt>
                <dd className="text-right font-bold text-[#1F8A5B]">{preview.revenueImpact}</dd>
              </>
            )}
            <dt className="font-bold text-stone-500">Est. gross margin</dt>
            <dd className="text-right text-[#1F1F1F]">{refreshing ? '…' : preview.margin ?? 'Not available'}</dd>
          </dl>

          {proposal?.reasoning && (
            <div className="mt-3 rounded-xl bg-[#FBFAF8] p-3">
              <p className="text-xs font-black uppercase tracking-wide text-stone-400">Why this recommendation</p>
              <p className="mt-1 text-sm text-stone-600">{proposal.reasoning}</p>
            </div>
          )}

          {planTasks && planTasks.length > 0 && (
            <ul className="mt-3 space-y-1">
              {planTasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2 text-xs font-semibold text-stone-500">
                  <span aria-hidden="true">{PLAN_TASK_ICON[task.status]}</span>
                  {task.label}
                </li>
              ))}
            </ul>
          )}

          {preview.warnings.length > 0 && (
            <ul className="mt-3 space-y-1">
              {preview.warnings.map((warning) => (
                <li key={warning} className="text-xs font-semibold text-stone-400">⚠ {warning}</li>
              ))}
            </ul>
          )}

          {staleness && !staleness.ok && (
            <p className="mt-3 rounded-xl bg-[#FBEAE6] p-3 text-sm font-bold text-[#C1442D]">{staleness.reason}</p>
          )}

          <p className="mt-4 text-sm font-black text-[#1F1F1F]">
            This will change {preview.items.length} {preview.items.length === 1 ? 'item' : 'items'}:
          </p>
          <ul className="mt-2 max-h-64 divide-y divide-stone-100 overflow-y-auto">
            {preview.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate font-semibold text-[#1F1F1F]">{item.name}</span>
                <span className="flex-none text-stone-500">
                  {describeState(item.before)} <span className="mx-1">→</span>{' '}
                  <span className="font-bold text-[#1F1F1F]">{describeState(item.after)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={handleCancel} disabled={applying} className="min-h-[44px] rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-500 hover:text-[#1F1F1F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 disabled:opacity-50">
              Cancel
            </button>
            {onModify && (
              <button type="button" onClick={handleModify} disabled={applying} className="min-h-[44px] rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-500 hover:text-[#1F1F1F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 disabled:opacity-50">
                Modify
              </button>
            )}
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || Boolean(staleness && !staleness.ok)}
              className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-[#FF6B00] px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B00] disabled:opacity-50"
            >
              {applying ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Applying…
                </>
              ) : (
                <>
                  <DashboardIcon name="check" className="h-3.5 w-3.5" />
                  Approve
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {applyResult && (
        <div>
          <p className="text-sm font-bold text-[#1F8A5B]">
            Applied to {applyResult.applied} of {applyResult.total} items.
          </p>
          {applyResult.failed && applyResult.failed.length > 0 && (
            <p className="mt-1 text-sm font-semibold text-[#C1442D]">
              Couldn&apos;t update: {applyResult.failed.map((f) => f.name).join(', ')}
            </p>
          )}
          {applyResult.skippedNoOp && applyResult.skippedNoOp.length > 0 && (
            <p className="mt-1 text-xs font-semibold text-stone-400">
              Already had this exact discount, skipped: {applyResult.skippedNoOp.join(', ')}
            </p>
          )}
          <button type="button" onClick={onDismiss} className="mt-3 min-h-[44px] rounded-full bg-[#1F1F1F] px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F1F1F]">
            Done
          </button>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import type { ResolvableAction, ResolvedDiscountItem } from '@/lib/menu-discount-actions/resolve';
import type { DashboardAssistantMessage } from '@/lib/dashboard-assistant/types';
import type { ActionOutcomePayload } from '@/lib/dashboard-assistant/outcome';
import type { Database } from '@/lib/supabase/database.types';
import { DashboardIcon } from './icons';
import { CONFIDENCE_STYLE, DECISION_TIER_STYLE } from './confidence-style';

// Proposal Experience V2 — the proposal card is the primary decision surface
// for a restaurant owner: it should answer "what, why, why now, what
// happens, how confident, can I safely act" without the owner reading the
// surrounding chat. Every fact rendered here (confidence, impact, why-now
// signals, considerations) is composed server-side from real data — see
// discount-action/preview/route.ts and
// lib/restaurant-planner/capabilities/menu-pricing.ts's compose* functions —
// never fabricated client-side. Nothing about resolution, confidence
// scoring, apply, or versioning changes here; this is presentation only.
//
// V2 (proposal persistence): the `proposal` prop (a persisted
// restaurant_planner_proposals row) is what makes the initial render instant
// — matched items, confidence, and reasoning are already known from when the
// message was created. A background /preview call (still made, now carrying
// proposalId) refreshes impact/evidence and revalidates the snapshot against
// live data — if something changed since the proposal was shown, Approve is
// disabled and a warning explains why, rather than silently applying against
// stale numbers.

type ProposalRow = Database['public']['Tables']['restaurant_planner_proposals']['Row'];
type PlanTask = { id: string; label: string; status: 'pending' | 'completed' | 'blocked' | 'failed' };
type ConfidenceEvidenceItem = { met: boolean; label: string };
type Confidence = 'high' | 'medium' | 'low';

type DecisionTier = 'strong' | 'good' | 'moderate' | 'weak';
type DecisionSummary = { tier: DecisionTier; emoji: string; label: string; bullets: string[] };
type Tradeoffs = { benefits: string[]; tradeoffs: string[] };
type Alternative = { text: string; evidenceBacked: boolean };
type MonitoringReminder = { days: 1 | 3 | 7; label: string };

type PreviewResponse =
  | {
      resolved: true;
      items: ResolvedDiscountItem[];
      revenueImpact: string | null;
      margin: string | null;
      warnings: string[];
      revalidation?: { ok: boolean; reason?: string };
      confidence: Confidence;
      considerations: string[];
      confidenceEvidence: ConfidenceEvidenceItem[];
      whyNow: string[];
      reasoningBullets: string[];
      executiveSummary: string;
      dataQuality: 'good' | 'limited';
      decisionSummary: DecisionSummary;
      tradeoffs: Tradeoffs;
      alternatives: Alternative[];
      whyThisRecommendation: string | null;
      successMetrics: string[];
      monitoringReminder: MonitoringReminder;
    }
  | { resolved: false; reason: string; candidates?: string[] };

type ApplyResponse = { applied: number; total: number; failed?: Array<{ name: string; error?: string }>; skippedNoOp?: string[] };

// Visibility is static in Phase 1 — every menu_pricing promotion surfaces in
// these two real places; there's no distinct "public menu" surface (the
// public route customers reach via QR *is* the public menu) and no
// per-proposal channel control yet.
const VISIBILITY_CHANNELS = ['Public Menu', 'Promotion Banner'];

const PLAN_TASK_ICON: Record<PlanTask['status'], string> = {
  completed: '✓',
  pending: '…',
  blocked: '⚠',
  failed: '✕',
};

type Lifecycle = 'draft' | 'approved' | 'executing' | 'completed';

const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  draft: 'Draft',
  approved: 'Approved',
  executing: 'Applying changes…',
  completed: 'Completed',
};

const LIFECYCLE_STYLE: Record<Lifecycle, string> = {
  draft: 'bg-stone-100 text-stone-500',
  approved: 'bg-[#E7F3EC] text-[#1F8A5B]',
  executing: 'bg-[#FBF0DF] text-[#A9600B]',
  completed: 'bg-[#E7F3EC] text-[#1F8A5B]',
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeState(state: { specialEnabled: boolean; specialType: string | null; specialPercent: number | null; specialPrice: number | null }): string {
  if (!state.specialEnabled) return 'No discount';
  if (state.specialType === 'percentage') return `${state.specialPercent}% off`;
  if (state.specialType === 'fixed_price') return `$${Number(state.specialPrice).toFixed(2)}`;
  return 'Discount';
}

function scheduleLabel(action: ResolvableAction): string {
  if (action.type === 'clear_discount') return 'Immediately';
  const { specialStartAt, specialNoExpiry } = action.discount;
  const start = specialStartAt ? `Starts ${new Date(specialStartAt).toLocaleString()}` : 'Immediately';
  const end = specialNoExpiry ? 'No end date' : 'Ends automatically';
  return `${start} · ${end}`;
}

function targetLabel(action: ResolvableAction): string {
  const target = action.target;
  switch (target.scope) {
    case 'all':
      return 'all menu items';
    case 'category':
      return `the "${target.name}" category`;
    case 'item':
      return `"${target.name}"`;
    case 'items':
      return target.names.map((n) => `"${n}"`).join(', ');
    case 'name_contains':
      return `items matching "${target.query}"`;
  }
}

function recommendationLabel(action: ResolvableAction): string {
  if (action.type === 'clear_discount') return `Remove the discount from ${targetLabel(action)}`;
  const valueLabel =
    action.discount.discountType === 'percentage' ? `a ${action.discount.value}% discount` : `a fixed price of $${action.discount.value}`;
  return `Apply ${valueLabel} to ${targetLabel(action)}`;
}

// The card's header title — always ends in "Recommendation" per the
// executive-proposal framing.
function promotionLabel(action: ResolvableAction): string {
  if (action.type === 'clear_discount') return 'Discount Removal Recommendation';
  return action.discount.discountType === 'percentage'
    ? `${action.discount.value}% Discount Recommendation`
    : 'Fixed Price Recommendation';
}

// A short, lowercase restatement used only to prefill the "Modify" chat
// draft — distinct from promotionLabel so that text doesn't have to be
// scraped back out of the headline-style title.
function shortPromotionLabel(action: ResolvableAction): string {
  if (action.type === 'clear_discount') return 'remove the discount';
  return action.discount.discountType === 'percentage'
    ? `${action.discount.value}% discount`
    : `fixed price of $${action.discount.value}`;
}

// Not a stored goal field (menu_pricing has none, unlike Revenue
// Intelligence opportunities) — a templated, honest business framing of
// "why discount this," not a measured claim.
function objectiveLabel(action: ResolvableAction, items: ResolvedDiscountItem[]): string {
  if (action.type === 'clear_discount') return 'Restore standard pricing';
  const categoryNames = Array.from(new Set(items.map((i) => i.categoryName).filter(Boolean)));
  if (categoryNames.length === 1) return `Increase ${categoryNames[0]} sales`;
  return 'Increase overall menu sales';
}

function effectiveAfterPrice(item: ResolvedDiscountItem): number | null {
  if (!item.after.specialEnabled) return item.price;
  if (item.after.specialType === 'fixed_price') return item.after.specialPrice;
  if (item.after.specialType === 'percentage' && item.price !== null && item.after.specialPercent !== null) {
    return item.price * (1 - item.after.specialPercent / 100);
  }
  return null;
}

function ItemComparisonCard({ item }: { item: ResolvedDiscountItem }) {
  const afterPrice = effectiveAfterPrice(item);
  const badge = item.after.specialEnabled && item.after.specialType === 'percentage' ? `${item.after.specialPercent}% OFF` : null;
  return (
    <div className="rounded-xl border border-stone-100 bg-[#FBFAF8] p-3">
      <p className="truncate text-sm font-black text-[#1F1F1F]">{item.name}</p>
      <div className="mt-2 flex items-center gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-stone-400">Current</p>
          <p className="text-base font-bold text-stone-400 line-through">{item.price !== null ? `$${item.price.toFixed(2)}` : '—'}</p>
        </div>
        <span aria-hidden="true" className="text-stone-300">→</span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-stone-400">Recommended</p>
          <p className="text-lg font-black text-[#1F8A5B]">{afterPrice !== null ? `$${afterPrice.toFixed(2)}` : describeState(item.after)}</p>
        </div>
        {badge && (
          <span className="ml-auto flex-none rounded-full bg-[#FFF0E0] px-2.5 py-1 text-xs font-black text-[#FF6B00]">{badge}</span>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="text-xs font-black uppercase tracking-wide text-stone-400">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function OutcomeCard({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'neutral' }) {
  return (
    <div className="rounded-xl border border-stone-100 bg-[#FBFAF8] p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-stone-400">{label}</p>
      <p className={`mt-1 text-sm font-black ${tone === 'positive' ? 'text-[#1F8A5B]' : 'text-[#1F1F1F]'}`}>{value}</p>
    </div>
  );
}

function VersionHistory({ restaurantId, proposal }: { restaurantId: string; proposal: ProposalRow }) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<ProposalRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !history) {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/admin/assistant/proposals/history?restaurantId=${encodeURIComponent(restaurantId)}&proposalGroupId=${encodeURIComponent(proposal.proposal_group_id)}`,
        );
        const payload = await response.json().catch(() => ({}));
        if (response.ok) setHistory(payload.history ?? []);
      } finally {
        setLoading(false);
      }
    }
  }

  if (proposal.version <= 1) return null;

  return (
    <div className="mt-5 border-t border-stone-100 pt-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex min-h-[44px] w-full items-center justify-between text-left text-xs font-black uppercase tracking-wide text-stone-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
      >
        <span>Proposal History · Version {proposal.version}</span>
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {loading && <p className="text-sm font-semibold text-stone-400">Loading…</p>}
          {history?.map((row) => {
            const action = row.action as unknown as { discount?: { value?: number; discountType?: string } };
            const changeLabel =
              action?.discount?.discountType === 'percentage' && typeof action.discount.value === 'number'
                ? `${action.discount.value}% discount`
                : 'Discount change';
            return (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#FBFAF8] p-3 text-sm">
                <span className="font-bold text-[#1F1F1F]">Version {row.version} · {changeLabel}</span>
                <span className="flex-none text-xs font-semibold capitalize text-stone-400">{row.status}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProposalCard({ restaurantId, action, proposal, onDismiss, conversationId, messageId, onResolved, onModify }: Props) {
  const initialSnapshot = (proposal?.resolved_snapshot as unknown as ResolvedDiscountItem[] | null) ?? null;
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [lifecycle, setLifecycle] = useState<Lifecycle>('draft');
  const [approvedAt, setApprovedAt] = useState<number | null>(null);
  const [completedAt, setCompletedAt] = useState<number | null>(null);

  const planTasks = (proposal?.plan_tasks as unknown as PlanTask[] | null) ?? null;
  const staleness = preview && preview.resolved ? preview.revalidation : undefined;
  const items = preview && preview.resolved ? preview.items : initialSnapshot;
  const confidence: Confidence | null = (preview && preview.resolved ? preview.confidence : (proposal?.confidence as Confidence | null)) ?? null;

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
    setError('');
    setLifecycle('approved');
    setApprovedAt(Date.now());
    await wait(450);
    setLifecycle('executing');
    setApplying(true);
    try {
      const response = await fetch('/api/admin/menus/discount-action/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, action, proposalId: proposal?.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Couldn't apply that change.");
      setApplyResult(payload);
      setLifecycle('completed');
      setCompletedAt(Date.now());
      await reportOutcome({ kind: 'applied', applied: payload.applied, total: payload.total, failed: payload.failed });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't apply that change.");
      setLifecycle('draft');
    } finally {
      setApplying(false);
    }
  }

  async function handleCancel() {
    await reportOutcome({ kind: 'cancelled' });
    onDismiss();
  }

  function handleModify() {
    onModify?.(`Change this proposal: ${shortPromotionLabel(action)} — `);
    onDismiss();
  }

  if (!items && !error) {
    return (
      <div className="mt-3 animate-[dash-fade-in_0.2s_ease-out] rounded-2xl border border-stone-200 bg-white p-4">
        <p className="text-sm font-semibold text-stone-400">Preparing a recommendation…</p>
      </div>
    );
  }

  if (preview && !preview.resolved) {
    return (
      <div className="mt-3 animate-[dash-fade-in_0.2s_ease-out] rounded-2xl border border-stone-200 bg-white p-4">
        <p className="text-sm font-bold text-[#1F1F1F]">{preview.reason}</p>
        {preview.candidates && preview.candidates.length > 0 && (
          <p className="mt-1 text-sm text-stone-500">Did you mean: {preview.candidates.join(', ')}?</p>
        )}
        <button type="button" onClick={onDismiss} className="mt-3 min-h-[44px] rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-500 hover:text-[#1F1F1F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400">
          Dismiss
        </button>
      </div>
    );
  }

  if (error && !items) {
    return (
      <div className="mt-3 animate-[dash-fade-in_0.2s_ease-out] rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-red-50 p-3">
          <p className="text-sm font-bold text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => setRetryToken((n) => n + 1)}
            className="rounded-full border border-red-300 px-3 py-1 text-xs font-black text-red-600 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const resolvedPreview = preview && preview.resolved ? preview : null;
  const durationLabel = approvedAt && completedAt ? `${((completedAt - approvedAt) / 1000).toFixed(1)}s` : null;
  const afterApprovalSteps =
    action.type === 'clear_discount'
      ? ['Menu pricing updates', 'Customers immediately see the new price']
      : ['Menu pricing updates', 'Customers immediately see the new price', 'Promotion becomes active'];

  return (
    <div className="mt-3 animate-[dash-fade-in_0.2s_ease-out] rounded-2xl border border-stone-200 bg-white p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xl font-black leading-tight text-[#1F1F1F] md:text-2xl">{promotionLabel(action)}</h3>
          <p className="mt-1 text-xs font-semibold text-stone-400">
            Prepared by Ask SpinBite{proposal?.created_at ? ` · ${new Date(proposal.created_at).toLocaleString()}` : ''}
          </p>
        </div>
        <span className={`flex-none rounded-full px-2.5 py-1 text-xs font-black uppercase tracking-wide ${LIFECYCLE_STYLE[lifecycle]}`}>
          {LIFECYCLE_LABEL[lifecycle]}
        </span>
      </div>

      {lifecycle === 'completed' && (
        <p className="mt-2 text-xs font-semibold text-stone-400">
          Approved by you{durationLabel ? ` · applied in ${durationLabel}` : ''}
        </p>
      )}

      {/* Executive summary */}
      <div className="mt-4 rounded-xl bg-[#EFE9FB] p-3">
        <p className="text-sm font-bold leading-6 text-[#1F1F1F]">
          {resolvedPreview ? resolvedPreview.executiveSummary : refreshing ? 'Weighing this recommendation…' : proposal?.reasoning ?? ''}
        </p>
      </div>

      {/* Should I Do This? — the owner-facing decision verdict, distinct
          from (and shown separately above) the underlying Confidence badge. */}
      {resolvedPreview && (
        <div className="mt-4 rounded-xl border border-stone-100 bg-white p-3">
          <p className="text-xs font-black uppercase tracking-wide text-stone-400">Should I Do This?</p>
          <span
            className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-base font-black ${DECISION_TIER_STYLE[resolvedPreview.decisionSummary.tier]}`}
          >
            <span aria-hidden="true">{resolvedPreview.decisionSummary.emoji}</span>
            {resolvedPreview.decisionSummary.label}
          </span>
          <ul className="mt-2 space-y-1">
            {resolvedPreview.decisionSummary.bullets.map((bullet, i) => (
              <li key={i} className="flex gap-2 text-sm text-stone-600">
                <span aria-hidden="true" className="text-stone-300">•</span>
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendation + Objective */}
      <Section title="Recommendation">
        <p className="text-base font-bold text-[#1F1F1F]">{recommendationLabel(action)}</p>
        {items && <p className="mt-1 text-sm font-semibold text-stone-500">Objective: {objectiveLabel(action, items)}</p>}
      </Section>

      {/* Before / After */}
      {items && items.length > 0 && (
        <Section title={`Before / After${items.length > 1 ? ` (${items.length} items)` : ''}`}>
          <div className="space-y-2">
            {items.slice(0, 8).map((item) => (
              <ItemComparisonCard key={item.id} item={item} />
            ))}
            {items.length > 8 && <p className="text-xs font-semibold text-stone-400">+ {items.length - 8} more items</p>}
          </div>
        </Section>
      )}

      {/* Why I recommend this */}
      <Section title="Why I Recommend This">
        <ul className="space-y-1.5">
          {(resolvedPreview?.reasoningBullets ?? (proposal?.reasoning ? proposal.reasoning.split(/(?<=\.)\s+/) : [])).map((bullet, i) => (
            <li key={i} className="flex gap-2 text-sm text-stone-600">
              <span aria-hidden="true" className="text-stone-300">•</span>
              {bullet}
            </li>
          ))}
        </ul>
      </Section>

      {/* Why now */}
      {resolvedPreview && (
        <Section title="Why Now?">
          <ul className="space-y-1.5">
            {resolvedPreview.whyNow.map((bullet, i) => (
              <li key={i} className="flex gap-2 text-sm text-stone-600">
                <span aria-hidden="true" className="text-stone-300">•</span>
                {bullet}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Alternatives + Why This Recommendation */}
      {resolvedPreview && resolvedPreview.alternatives.length > 0 && (
        <Section title="Alternative Approaches">
          <ul className="space-y-1.5">
            {resolvedPreview.alternatives.map((alt, i) => (
              <li key={i} className="flex gap-2 text-sm text-stone-600">
                <span aria-hidden="true" className="text-stone-300">•</span>
                {alt.text}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {resolvedPreview?.whyThisRecommendation && (
        <Section title="Why This Recommendation?">
          <p className="text-sm text-stone-600">{resolvedPreview.whyThisRecommendation}</p>
        </Section>
      )}

      {/* Schedule + Visibility */}
      <Section title="Schedule">
        <p className="text-sm font-semibold text-[#1F1F1F]">{scheduleLabel(action)}</p>
      </Section>
      <Section title="Visibility">
        <div className="flex flex-wrap gap-2">
          {VISIBILITY_CHANNELS.map((channel) => (
            <span key={channel} className="inline-flex items-center gap-1 rounded-full bg-[#E7F3EC] px-2.5 py-1 text-xs font-bold text-[#1F8A5B]">
              <DashboardIcon name="check" className="h-3 w-3" /> {channel}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-stone-400">Every active promotion appears in both places — there&apos;s no per-promotion channel control yet.</p>
      </Section>

      {/* Expected Outcome */}
      <Section title="Expected Outcome">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <OutcomeCard label="Revenue" value={resolvedPreview?.revenueImpact ?? 'Not available'} tone={resolvedPreview?.revenueImpact ? 'positive' : undefined} />
          <OutcomeCard label="Margin" value={refreshing ? '…' : resolvedPreview?.margin ?? 'Not available'} />
          <OutcomeCard label="Affected Items" value={items ? String(items.length) : '…'} />
          <OutcomeCard label="Confidence" value={confidence ? `${confidence.charAt(0).toUpperCase()}${confidence.slice(1)}` : '…'} />
          <OutcomeCard label="Data Quality" value={resolvedPreview ? (resolvedPreview.dataQuality === 'good' ? 'Good' : 'Limited') : '…'} />
        </div>
      </Section>

      {/* Confidence, explained */}
      {confidence && (
        <Section title="Confidence">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black uppercase tracking-wide ${CONFIDENCE_STYLE[confidence] ?? 'bg-stone-100 text-stone-500'}`}>
            {confidence} confidence
          </span>
          {resolvedPreview && (
            <ul className="mt-2 space-y-1">
              {resolvedPreview.confidenceEvidence.map((evidence, i) => (
                <li key={i} className={`flex items-center gap-2 text-xs font-semibold ${evidence.met ? 'text-stone-500' : 'text-[#A9600B]'}`}>
                  <span aria-hidden="true">{evidence.met ? '✓' : '⚠'}</span>
                  {evidence.label}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* Things to consider */}
      <Section title="Things To Consider">
        {resolvedPreview && resolvedPreview.considerations.length > 0 ? (
          <ul className="space-y-1">
            {resolvedPreview.considerations.map((consideration, i) => (
              <li key={i} className="text-sm font-semibold text-stone-500">⚠ {consideration}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm font-semibold text-stone-400">{resolvedPreview ? 'No significant considerations detected.' : '…'}</p>
        )}
      </Section>

      {/* Tradeoffs — a second, benefits-vs-tradeoffs lens on the same
          Why-Now/reasoning/considerations facts above, not new data. */}
      {resolvedPreview && (
        <Section title="Tradeoffs">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-stone-400">Benefits</p>
              <ul className="mt-1 space-y-1">
                {resolvedPreview.tradeoffs.benefits.length > 0 ? (
                  resolvedPreview.tradeoffs.benefits.map((benefit, i) => (
                    <li key={i} className="text-sm font-semibold text-[#1F8A5B]">✓ {benefit}</li>
                  ))
                ) : (
                  <li className="text-sm font-semibold text-stone-400">No specific benefits identified.</li>
                )}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-stone-400">Tradeoffs</p>
              <ul className="mt-1 space-y-1">
                {resolvedPreview.tradeoffs.tradeoffs.length > 0 ? (
                  resolvedPreview.tradeoffs.tradeoffs.map((tradeoff, i) => (
                    <li key={i} className="text-sm font-semibold text-stone-500">• {tradeoff}</li>
                  ))
                ) : (
                  <li className="text-sm font-semibold text-stone-400">No significant tradeoffs detected.</li>
                )}
              </ul>
            </div>
          </div>
        </Section>
      )}

      {/* Success Metrics */}
      {resolvedPreview && (
        <Section title="Success Metrics">
          <p className="text-xs font-semibold text-stone-400">Monitor:</p>
          <ul className="mt-1 space-y-1">
            {resolvedPreview.successMetrics.map((metric, i) => (
              <li key={i} className="text-sm font-semibold text-stone-600">• {metric}</li>
            ))}
          </ul>
        </Section>
      )}

      {staleness && !staleness.ok && (
        <div className="mt-4 rounded-xl bg-[#FBEAE6] p-3 text-sm font-bold text-[#C1442D]">{staleness.reason}</div>
      )}

      {planTasks && planTasks.length > 0 && (
        <ul className="mt-3 space-y-1">
          {planTasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 text-xs font-semibold text-stone-400">
              <span aria-hidden="true">{PLAN_TASK_ICON[task.status]}</span>
              {task.label}
            </li>
          ))}
        </ul>
      )}

      {/* What happens after approval */}
      {lifecycle === 'draft' && (
        <Section title="What Happens After Approval?">
          <ul className="space-y-1">
            {afterApprovalSteps.map((step) => (
              <li key={step} className="flex items-center gap-2 text-sm font-semibold text-stone-500">
                <DashboardIcon name="check" className="h-3.5 w-3.5 flex-none text-[#1F8A5B]" />
                {step}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {lifecycle === 'draft' && resolvedPreview && (
        <Section title="Suggested Review">
          <p className="text-sm font-semibold text-[#1F1F1F]">{resolvedPreview.monitoringReminder.label}</p>
        </Section>
      )}

      {applyResult && (
        <Section title="Result">
          <p className="text-sm font-bold text-[#1F8A5B]">Applied to {applyResult.applied} of {applyResult.total} items.</p>
          {applyResult.failed && applyResult.failed.length > 0 && (
            <p className="mt-1 text-sm font-semibold text-[#C1442D]">Couldn&apos;t update: {applyResult.failed.map((f) => f.name).join(', ')}</p>
          )}
          {applyResult.skippedNoOp && applyResult.skippedNoOp.length > 0 && (
            <p className="mt-1 text-xs font-semibold text-stone-400">Already had this exact discount, skipped: {applyResult.skippedNoOp.join(', ')}</p>
          )}
        </Section>
      )}

      {proposal && <VersionHistory restaurantId={restaurantId} proposal={proposal} />}

      {/* Approval area */}
      <div className="mt-6 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
        {lifecycle === 'draft' && !applyResult && (
          <>
            <button type="button" onClick={handleCancel} disabled={applying} className="min-h-[44px] rounded-full border border-stone-200 px-5 py-2.5 text-sm font-bold text-stone-500 hover:text-[#1F1F1F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 disabled:opacity-50">
              Cancel
            </button>
            {onModify && (
              <button type="button" onClick={handleModify} disabled={applying} className="min-h-[44px] rounded-full border border-stone-200 px-5 py-2.5 text-sm font-bold text-stone-500 hover:text-[#1F1F1F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 disabled:opacity-50">
                Modify
              </button>
            )}
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || Boolean(staleness && !staleness.ok) || !items}
              className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-[#FF6B00] px-5 py-2.5 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B00] disabled:opacity-50"
            >
              <DashboardIcon name="check" className="h-3.5 w-3.5" />
              Approve
            </button>
          </>
        )}
        {(lifecycle === 'approved' || lifecycle === 'executing') && (
          <span className="inline-flex min-h-[44px] items-center gap-2 text-sm font-bold text-stone-500">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-300 border-t-[#FF6B00]" />
            {LIFECYCLE_LABEL[lifecycle]}
          </span>
        )}
        {lifecycle === 'completed' && (
          <button type="button" onClick={onDismiss} className="min-h-[44px] rounded-full bg-[#1F1F1F] px-5 py-2.5 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F1F1F]">
            Done
          </button>
        )}
      </div>

      {error && lifecycle !== 'draft' && (
        <p className="mt-3 text-sm font-bold text-red-600">{error}</p>
      )}
    </div>
  );
}

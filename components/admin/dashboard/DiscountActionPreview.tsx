'use client';

import { useEffect, useState } from 'react';
import type { ResolvableAction, ResolvedDiscountItem } from '@/lib/menu-discount-actions/resolve';
import type { DashboardAssistantMessage } from '@/lib/dashboard-assistant/types';
import type { ActionOutcomePayload } from '@/lib/dashboard-assistant/outcome';
import { DashboardIcon } from './icons';

type PreviewResponse =
  | { resolved: true; items: ResolvedDiscountItem[] }
  | { resolved: false; reason: string; candidates?: string[] };

type ApplyResponse = { applied: number; total: number; failed?: Array<{ name: string; error?: string }> };

type Props = {
  restaurantId: string;
  action: ResolvableAction;
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
};

function describeState(state: { specialEnabled: boolean; specialType: string | null; specialPercent: number | null; specialPrice: number | null }): string {
  if (!state.specialEnabled) return 'No discount';
  if (state.specialType === 'percentage') return `${state.specialPercent}% off`;
  if (state.specialType === 'fixed_price') return `$${Number(state.specialPrice).toFixed(2)}`;
  return 'Discount';
}

export function DiscountActionPreview({ restaurantId, action, onDismiss, conversationId, messageId, onResolved }: Props) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);

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
      try {
        const response = await fetch('/api/admin/menus/discount-action/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurantId, action }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "Couldn't check your menu right now.");
        if (!cancelled) setPreview(payload);
        if (!cancelled && payload && payload.resolved === false) {
          await reportOutcome({ kind: 'ambiguous', reason: payload.reason, candidates: payload.candidates });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't check your menu right now.");
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleApply() {
    setApplying(true);
    setError('');
    try {
      const response = await fetch('/api/admin/menus/discount-action/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, action }),
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

  return (
    <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
      {error && <p className="text-sm font-bold text-red-600">{error}</p>}

      {!error && !preview && <p className="text-sm font-semibold text-stone-400">Checking your menu…</p>}

      {!error && preview && !preview.resolved && (
        <div>
          <p className="text-sm font-bold text-[#1F1F1F]">{preview.reason}</p>
          {preview.candidates && preview.candidates.length > 0 && (
            <p className="mt-1 text-sm text-stone-500">Did you mean: {preview.candidates.join(', ')}?</p>
          )}
          <button type="button" onClick={onDismiss} className="mt-3 rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-500 hover:text-[#1F1F1F]">
            Dismiss
          </button>
        </div>
      )}

      {!error && preview && preview.resolved && !applyResult && (
        <div>
          <p className="text-sm font-black text-[#1F1F1F]">
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
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={handleCancel} disabled={applying} className="rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-500 hover:text-[#1F1F1F] disabled:opacity-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applying}
              className="flex items-center gap-1.5 rounded-full bg-[#FF6B00] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {applying ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Applying…
                </>
              ) : (
                <>
                  <DashboardIcon name="check" className="h-3.5 w-3.5" />
                  Apply
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {!error && applyResult && (
        <div>
          <p className="text-sm font-bold text-[#1F8A5B]">
            Applied to {applyResult.applied} of {applyResult.total} items.
          </p>
          {applyResult.failed && applyResult.failed.length > 0 && (
            <p className="mt-1 text-sm font-semibold text-[#C1442D]">
              Couldn&apos;t update: {applyResult.failed.map((f) => f.name).join(', ')}
            </p>
          )}
          <button type="button" onClick={onDismiss} className="mt-3 rounded-full bg-[#1F1F1F] px-4 py-2 text-sm font-bold text-white">
            Done
          </button>
        </div>
      )}
    </div>
  );
}

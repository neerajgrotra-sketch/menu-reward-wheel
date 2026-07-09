'use client';

import { useState } from 'react';
import { DashboardIcon } from './icons';

type Props = {
  restaurantId: string;
  dashboardContext: Record<string, string>;
  promotionsHref: string;
};

export function RecommendationsSection({ restaurantId, dashboardContext, promotionsHref }: Props) {
  const [recommendation, setRecommendation] = useState('');
  const [notice, setNotice] = useState('');
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    setNotice('');
    try {
      const response = await fetch('/api/admin/intelligence/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          featureKey: 'sales_optimization',
          restaurantId,
          context: dashboardContext,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setNotice(
          response.status === 503
            ? 'SpinBite is still learning this restaurant — this is coming soon.'
            : payload?.error || "Couldn't find anything right now.",
        );
        return;
      }

      setRecommendation(payload.output || '');
    } catch {
      setNotice("Couldn't reach SpinBite. Try again in a moment.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-3xl bg-white p-5 shadow">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EFE9FB] text-[#6C4FD1]">
          <DashboardIcon name="sparkle" className="h-3.5 w-3.5" />
        </span>
        <p className="text-sm font-black text-[#1F1F1F]">Opportunities SpinBite found</p>
      </div>

      {!recommendation && (
        <>
          <p className="mt-3 text-sm font-semibold text-stone-500">
            Ask SpinBite to scan today&apos;s revenue, orders, and promotions for a suggestion.
          </p>
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="mt-4 flex items-center gap-2 rounded-full bg-[#6C4FD1] px-5 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 disabled:opacity-50"
          >
            {generating ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Scanning…
              </>
            ) : (
              <>
                <DashboardIcon name="sparkle" className="h-3.5 w-3.5" />
                Find opportunities
              </>
            )}
          </button>
          {notice && <p className="mt-3 text-sm font-bold text-[#6C4FD1]">{notice}</p>}
        </>
      )}

      {recommendation && (
        <>
          <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-6 text-[#1F1F1F]">{recommendation}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRecommendation('')}
              className="rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-500 hover:text-[#1F1F1F]"
            >
              Dismiss
            </button>
            <a
              href={promotionsHref}
              className="rounded-full bg-[#1F1F1F] px-4 py-2 text-sm font-bold text-white"
            >
              Open in Promotions
            </a>
          </div>
        </>
      )}
    </div>
  );
}

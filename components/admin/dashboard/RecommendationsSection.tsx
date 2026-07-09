'use client';

import { useState } from 'react';
import { AIActionButton } from '@/components/ui/AIActionButton';
import { DashboardIcon } from './icons';

type Props = {
  restaurantId: string;
  dashboardContext: Record<string, string>;
  promotionsHref: string;
};

export function RecommendationsSection({ restaurantId, dashboardContext, promotionsHref }: Props) {
  const [recommendation, setRecommendation] = useState('');

  return (
    <div className="rounded-3xl bg-white p-5 shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EFE9FB] text-[#6C4FD1]">
            <DashboardIcon name="sparkle" className="h-3.5 w-3.5" />
          </span>
          <p className="text-sm font-black text-[#1F1F1F]">Opportunities SpinBite found</p>
        </div>
        <AIActionButton
          featureKey="sales_optimization"
          restaurantId={restaurantId}
          context={dashboardContext}
          onGenerated={setRecommendation}
        />
      </div>

      {!recommendation && (
        <p className="mt-3 text-sm font-semibold text-stone-500">
          Ask SpinBite to scan today&apos;s revenue, orders, and promotions for a suggestion.
        </p>
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

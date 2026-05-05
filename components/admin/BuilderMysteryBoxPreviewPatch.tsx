'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = { promotionId: string };

function findWheelPreviewCard() {
  const nodes = Array.from(document.querySelectorAll('p, div'));
  const label = nodes.find((node) => {
    const text = node.textContent?.toLowerCase().trim() || '';
    return text === 'wheel preview' || text.includes('wheel preview');
  });
  return label?.closest('[class*="rounded-"]') as HTMLElement | null;
}

function buildMysteryPreview() {
  const wrapper = document.createElement('div');
  wrapper.id = 'spinbite-mystery-box-builder-preview';
  wrapper.className = 'min-w-0 rounded-[2rem] bg-white/95 p-4 text-[#1F1F1F] shadow-2xl ring-1 ring-white/50 sm:p-5';
  wrapper.innerHTML = `
    <style>
      @keyframes spinbiteBoxFloat { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-8px) scale(1.04); } }
      @keyframes spinbiteSparkle { 0% { transform: translateY(8px) scale(.7); opacity: 0; } 45% { opacity: 1; } 100% { transform: translateY(-34px) scale(1.1); opacity: 0; } }
    </style>
    <div class="mb-4 rounded-3xl bg-green-50 p-4 text-green-800">
      <p class="text-xs font-black uppercase tracking-[0.14em]">Selected Game</p>
      <p class="mt-1 text-2xl font-black">🎁 Mystery Box Reveal</p>
      <p class="mt-1 text-sm font-bold">Customers will tap one of 3 mystery boxes to reveal a reward.</p>
    </div>
    <div class="rounded-[2rem] bg-gradient-to-br from-orange-50 to-amber-100 p-5 text-center shadow-inner">
      <p class="text-xs font-black uppercase tracking-[0.18em] text-[#FF6B00]">Mystery Box Preview</p>
      <h3 class="mt-2 text-3xl font-black leading-tight">Pick a box to reveal your prize</h3>
      <div class="mt-6 grid grid-cols-3 gap-3">
        ${[1, 2, 3].map((box) => `
          <div class="relative flex h-28 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] shadow-xl" style="animation: spinbiteBoxFloat 2.4s ease-in-out infinite ${box * 0.15}s;">
            <span class="absolute -top-2 text-xl" style="animation: spinbiteSparkle 1.6s ease-in-out infinite ${box * 0.2}s;">✨</span>
            <span class="text-5xl">🎁</span>
            <span class="absolute bottom-2 text-xs font-black uppercase text-white">Box ${box}</span>
          </div>
        `).join('')}
      </div>
      <p class="mt-5 rounded-2xl bg-white/80 p-3 text-sm font-black text-stone-700">The reward builder below is reused. Customer coupon issuance and reporting stay the same.</p>
    </div>
  `;
  return wrapper;
}

export default function BuilderMysteryBoxPreviewPatch({ promotionId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [isMysteryBox, setIsMysteryBox] = useState(false);

  useEffect(() => {
    async function load() {
      const result = await supabase.from('promotions').select('game_type').eq('id', promotionId).single();
      setIsMysteryBox(result.data?.game_type === 'mystery_box');
    }
    load();
  }, [promotionId, supabase]);

  useEffect(() => {
    if (!isMysteryBox) return;

    function apply() {
      const existing = document.getElementById('spinbite-mystery-box-builder-preview');
      const wheelCard = findWheelPreviewCard();
      if (!wheelCard) return false;

      wheelCard.style.display = 'none';
      if (!existing) {
        wheelCard.insertAdjacentElement('afterend', buildMysteryPreview());
      }
      return true;
    }

    apply();
    const observer = new MutationObserver(() => apply());
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(() => apply(), 400);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [isMysteryBox]);

  return null;
}

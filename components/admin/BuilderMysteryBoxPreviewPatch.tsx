'use client';

import { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { createClient } from '@/lib/supabase/client';

type Props = { promotionId: string };

type PreviewReward = {
  id: string;
  label: string;
  reward_type: string;
  reward_value: number | null;
  weight: number;
  weight_label: 'Common' | 'Normal' | 'Rare';
};

function findWheelPreviewCard() {
  const nodes = Array.from(document.querySelectorAll('p, div'));
  const label = nodes.find((node) => {
    const text = node.textContent?.toLowerCase().trim() || '';
    return text === 'wheel preview' || text.includes('wheel preview');
  });
  return label?.closest('[class*="rounded-"]') as HTMLElement | null;
}

function weightLabel(weight?: number | null): 'Common' | 'Normal' | 'Rare' {
  if (weight === 60) return 'Common';
  if (weight === 10) return 'Rare';
  return 'Normal';
}

function rewardText(reward: PreviewReward) {
  const label = reward.label || 'Reward';
  if (reward.reward_type === 'free') return label.toLowerCase().startsWith('free') ? label : `FREE ${label}`;
  if (reward.reward_type === 'discount') return `${reward.reward_value || 0}% ${label}`;
  return label;
}

function pickWeightedReward(rewards: PreviewReward[]) {
  const pool = rewards.length ? rewards : [
    { id: 'demo-1', label: 'Lucky Bite', reward_type: 'custom', reward_value: null, weight: 30, weight_label: 'Normal' as const },
    { id: 'demo-2', label: 'Free Drink', reward_type: 'free', reward_value: null, weight: 30, weight_label: 'Normal' as const },
    { id: 'demo-3', label: '20% Off', reward_type: 'custom', reward_value: null, weight: 10, weight_label: 'Rare' as const },
  ];
  let random = Math.random() * pool.reduce((sum, reward) => sum + Math.max(1, reward.weight || 30), 0);
  for (const reward of pool) {
    random -= Math.max(1, reward.weight || 30);
    if (random <= 0) return reward;
  }
  return pool[pool.length - 1];
}

function weightBadgeClass(label: string) {
  if (label === 'Common') return 'bg-green-50 text-green-700';
  if (label === 'Rare') return 'bg-orange-50 text-[#FF6B00]';
  return 'bg-stone-100 text-stone-600';
}

function rewardsHtml(rewards: PreviewReward[]) {
  if (!rewards.length) {
    return `<div class="mt-5 rounded-2xl bg-white/80 p-4 text-left text-sm font-black text-stone-600">Add rewards below, then click Save Changes. The preview will refresh and use the real saved menu items.</div>`;
  }

  return `
    <div class="mt-5 space-y-2 text-left">
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs font-black uppercase tracking-[0.14em] text-stone-500">Mystery Box Rewards</p>
        <p class="text-[10px] font-black uppercase tracking-wide text-green-700">Using saved rewards</p>
      </div>
      ${rewards.map((reward) => `
        <div class="flex items-center justify-between gap-3 rounded-2xl bg-white/90 px-4 py-3 shadow-sm">
          <p class="min-w-0 truncate text-sm font-black text-stone-900">${rewardText(reward)}</p>
          <span class="shrink-0 rounded-full px-3 py-1 text-xs font-black uppercase ${weightBadgeClass(reward.weight_label)}">${reward.weight_label}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function buildMysteryPreview(rewards: PreviewReward[]) {
  const wrapper = document.createElement('div');
  wrapper.id = 'spinbite-mystery-box-builder-preview';
  wrapper.className = 'min-w-0 rounded-[2rem] bg-white/95 p-4 text-[#1F1F1F] shadow-2xl ring-1 ring-white/50 sm:p-5';
  wrapper.innerHTML = `
    <style>
      @keyframes spinbiteBoxFloat { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-8px) scale(1.04); } }
      @keyframes spinbiteSparkle { 0% { transform: translateY(8px) scale(.7); opacity: 0; } 45% { opacity: 1; } 100% { transform: translateY(-34px) scale(1.1); opacity: 0; } }
      @keyframes spinbitePrizePop { 0% { transform: translateY(20px) scale(.62); opacity: 0; } 55% { transform: translateY(-10px) scale(1.06); opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
      @keyframes spinbiteTremble { 0%,100% { transform: translate(-50%, -50%) rotate(0deg) scale(1.25); } 15% { transform: translate(-50%, -50%) rotate(-7deg) scale(1.32); } 30% { transform: translate(-50%, -50%) rotate(7deg) scale(1.35); } 45% { transform: translate(-50%, -50%) rotate(-5deg) scale(1.36); } 60% { transform: translate(-50%, -50%) rotate(5deg) scale(1.38); } 80% { transform: translate(-50%, -50%) rotate(-3deg) scale(1.32); } }
      @keyframes spinbiteOpenBox { 0% { transform: translate(-50%, -50%) scale(1.38); } 100% { transform: translate(-50%, -50%) scale(1.18); } }
      @keyframes spinbiteFadeOut { to { opacity: 0; transform: scale(.78); pointer-events: none; } }
    </style>
    <div class="mb-4 rounded-3xl bg-green-50 p-4 text-green-800">
      <p class="text-xs font-black uppercase tracking-[0.14em]">Selected Game</p>
      <p class="mt-1 text-2xl font-black">🎁 Mystery Box Reveal</p>
      <p class="mt-1 text-sm font-bold">Customers will tap one of 3 mystery boxes to reveal a reward.</p>
    </div>
    <div class="rounded-[2rem] bg-gradient-to-br from-orange-50 to-amber-100 p-5 text-center shadow-inner">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div class="text-left">
          <p class="text-xs font-black uppercase tracking-[0.18em] text-[#FF6B00]">Mystery Box Preview</p>
          <p id="spinbite-mystery-result" class="mt-1 text-sm font-black text-green-700"></p>
        </div>
        <button id="spinbite-mystery-test-button" type="button" class="rounded-full bg-[#1F1F1F] px-5 py-2 text-sm font-black text-white shadow-lg">Test</button>
      </div>
      <h3 id="spinbite-mystery-heading" class="mt-2 text-3xl font-black leading-tight">Pick a box to reveal your prize</h3>
      <div id="spinbite-mystery-stage" class="relative mt-6 grid min-h-[8rem] grid-cols-3 gap-3 overflow-visible">
        ${[1, 2, 3].map((box) => `
          <button type="button" data-spinbite-box="${box}" class="relative flex h-28 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] shadow-xl transition active:scale-95" style="animation: spinbiteBoxFloat 2.4s ease-in-out infinite ${box * 0.15}s;">
            <span class="absolute -top-2 text-xl" style="animation: spinbiteSparkle 1.6s ease-in-out infinite ${box * 0.2}s;">✨</span>
            <span class="text-5xl">🎁</span>
            <span class="absolute bottom-2 text-xs font-black uppercase text-white">Box ${box}</span>
          </button>
        `).join('')}
        <div id="spinbite-prize-output" class="pointer-events-none absolute inset-0 z-40 hidden items-center justify-center px-2"></div>
      </div>
      ${rewardsHtml(rewards)}
    </div>
  `;

  function runTest(selectedButton?: HTMLElement | null) {
    const buttons = Array.from(wrapper.querySelectorAll('[data-spinbite-box]')) as HTMLElement[];
    const result = wrapper.querySelector('#spinbite-mystery-result') as HTMLElement | null;
    const heading = wrapper.querySelector('#spinbite-mystery-heading') as HTMLElement | null;
    const stage = wrapper.querySelector('#spinbite-mystery-stage') as HTMLElement | null;
    const output = wrapper.querySelector('#spinbite-prize-output') as HTMLElement | null;
    const testButton = wrapper.querySelector('#spinbite-mystery-test-button') as HTMLButtonElement | null;
    const chosen = selectedButton || buttons[Math.floor(Math.random() * buttons.length)];
    const reward = pickWeightedReward(rewards);

    if (testButton) testButton.disabled = true;
    if (heading) heading.textContent = 'Opening your mystery box...';
    if (result) result.textContent = 'Box selected — reveal in progress...';
    if (stage) stage.className = 'relative mt-6 min-h-[15rem] overflow-visible';

    buttons.forEach((button) => {
      button.style.animation = '';
      if (button !== chosen) button.style.animation = 'spinbiteFadeOut .35s ease-out forwards';
    });

    if (chosen) {
      chosen.style.position = 'absolute';
      chosen.style.left = '50%';
      chosen.style.top = '40%';
      chosen.style.zIndex = '30';
      chosen.style.width = '8.5rem';
      chosen.style.height = '8.5rem';
      chosen.style.animation = 'spinbiteTremble 1.05s ease-in-out infinite';
      chosen.innerHTML = `<span class="absolute -top-5 text-3xl">✨</span><span class="text-6xl">🎁</span><span class="absolute bottom-3 text-xs font-black uppercase text-white">Opening</span>`;
    }

    window.setTimeout(() => {
      if (chosen) {
        chosen.style.animation = 'spinbiteOpenBox .45s ease-out forwards';
        chosen.innerHTML = `<span class="absolute -top-6 text-4xl">✨</span><span class="text-6xl">🎉</span><span class="absolute bottom-3 text-xs font-black uppercase text-white">Opened</span>`;
      }
      confetti({ particleCount: 260, spread: 130, origin: { y: 0.52 }, shapes: ['square', 'circle', 'star'] });
    }, 1100);

    window.setTimeout(() => {
      if (heading) heading.textContent = 'Prize revealed!';
      if (result) result.textContent = '';
      if (output) {
        output.className = 'pointer-events-none absolute inset-0 z-40 flex items-end justify-center px-2 pb-2';
        output.innerHTML = `
          <div class="w-full rounded-[2rem] bg-white p-4 text-center shadow-xl" style="animation: spinbitePrizePop .7s ease-out forwards;">
            <p class="text-xs font-black uppercase tracking-[0.14em] text-[#FF6B00]">🎉 You won</p>
            <p class="mt-1 text-2xl font-black leading-tight text-green-700">${rewardText(reward)}</p>
            <p class="mt-2 text-[10px] font-bold uppercase text-stone-500">Preview only. Coupon issuing happens on the live play page.</p>
          </div>
        `;
      }
    }, 1500);

    window.setTimeout(() => {
      const fresh = document.getElementById('spinbite-mystery-box-builder-preview');
      if (fresh) fresh.replaceWith(buildMysteryPreview(rewards));
    }, 5200);
  }

  wrapper.querySelector('#spinbite-mystery-test-button')?.addEventListener('click', () => runTest());
  wrapper.querySelectorAll('[data-spinbite-box]').forEach((button) => button.addEventListener('click', () => runTest(button as HTMLElement)));

  return wrapper;
}

export default function BuilderMysteryBoxPreviewPatch({ promotionId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [isMysteryBox, setIsMysteryBox] = useState(false);
  const [rewards, setRewards] = useState<PreviewReward[]>([]);

  useEffect(() => {
    async function loadRewards() {
      const result = await supabase.from('promotions').select('game_type').eq('id', promotionId).single();
      setIsMysteryBox(result.data?.game_type === 'mystery_box');

      const rewardResult = await supabase
        .from('promotion_rewards')
        .select('id,menu_item_id,custom_name,reward_type,reward_value,weight')
        .eq('promotion_id', promotionId)
        .order('created_at', { ascending: false });

      const rawRewards = rewardResult.data || [];
      const menuItemIds = Array.from(new Set(rawRewards.map((reward: any) => reward.menu_item_id).filter(Boolean)));
      let namesById: Record<string, string> = {};

      if (menuItemIds.length) {
        const itemResult = await supabase.from('menu_items').select('id,name').in('id', menuItemIds);
        namesById = Object.fromEntries((itemResult.data || []).map((item: any) => [item.id, item.name]));
      }

      setRewards(rawRewards.map((reward: any) => ({
        id: reward.id,
        label: reward.custom_name || namesById[reward.menu_item_id] || 'Reward',
        reward_type: reward.reward_type || 'discount',
        reward_value: reward.reward_value,
        weight: reward.weight || 30,
        weight_label: weightLabel(reward.weight || 30),
      })));
    }

    loadRewards();
    const timer = window.setInterval(loadRewards, 2500);
    return () => window.clearInterval(timer);
  }, [promotionId, supabase]);

  useEffect(() => {
    if (!isMysteryBox) return;

    function apply() {
      const wheelCard = findWheelPreviewCard();
      if (!wheelCard) return false;

      wheelCard.style.display = 'none';
      const existing = document.getElementById('spinbite-mystery-box-builder-preview');
      const next = buildMysteryPreview(rewards);
      if (existing) existing.replaceWith(next);
      else wheelCard.insertAdjacentElement('afterend', next);
      return true;
    }

    apply();
    const observer = new MutationObserver(() => {
      if (!document.getElementById('spinbite-mystery-box-builder-preview')) apply();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(() => {
      if (!document.getElementById('spinbite-mystery-box-builder-preview')) apply();
    }, 1200);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [isMysteryBox, rewards]);

  return null;
}

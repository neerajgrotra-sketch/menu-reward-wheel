'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import confetti from 'canvas-confetti';
import { createClient } from '@/lib/supabase/client';

type Props = { promotionId: string };
type WeightLabel = 'Common' | 'Normal' | 'Rare';
type RewardType = 'free' | 'discount' | 'custom';
type PreviewReward = { id: string; label: string; reward_type: RewardType; reward_value: number | null; weight: number; weight_label: WeightLabel };

function findWheelPreviewCard() {
  const label = Array.from(document.querySelectorAll('p, div')).find((node) => {
    const text = node.textContent?.toLowerCase().trim() || '';
    return text === 'wheel preview' || text.includes('wheel preview');
  });
  return label?.closest('[class*="rounded-"]') as HTMLElement | null;
}

function weightFromLabel(label: WeightLabel) { return label === 'Common' ? 60 : label === 'Rare' ? 10 : 30; }
function rewardText(reward: PreviewReward) {
  const label = reward.label || 'Reward';
  if (reward.reward_type === 'free') return label.toLowerCase().startsWith('free') ? label : `FREE ${label}`;
  if (reward.reward_type === 'discount') return `${reward.reward_value || 0}% ${label}`;
  return label;
}
function badgeClass(label: WeightLabel) { return label === 'Common' ? 'bg-green-50 text-green-700' : label === 'Rare' ? 'bg-orange-50 text-[#FF6B00]' : 'bg-stone-100 text-stone-600'; }
function sig(list: PreviewReward[]) { return list.map((r) => `${r.label}|${r.reward_type}|${r.reward_value}|${r.weight_label}`).join(';;'); }

function parseBuilderRewards(): PreviewReward[] {
  const segmentLabels = Array.from(document.querySelectorAll('p')).filter((node) => /^segment\s+\d+/i.test((node.textContent || '').trim()));
  return segmentLabels.map((segmentLabel, index) => {
    const card = segmentLabel.closest('[class*="rounded-3xl"]') as HTMLElement | null;
    if (!card) return null;
    const paragraphs = Array.from(card.querySelectorAll('p')) as HTMLElement[];
    const title = paragraphs.find((p) => {
      const text = (p.textContent || '').trim();
      return text && !/^segment\s+\d+/i.test(text) && text.toLowerCase() !== 'remove';
    })?.textContent?.trim() || `Reward ${index + 1}`;
    const selects = Array.from(card.querySelectorAll('select')) as HTMLSelectElement[];
    const rewardType = (selects.find((s) => ['free', 'discount', 'custom'].includes(s.value))?.value || 'discount') as RewardType;
    const weightLabel = (selects.find((s) => ['Common', 'Normal', 'Rare'].includes(s.value))?.value || 'Normal') as WeightLabel;
    const numbers = Array.from(card.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    return { id: `live-${index}-${title}`, label: title, reward_type: rewardType, reward_value: rewardType === 'discount' && numbers[0]?.value ? Number(numbers[0].value) : null, weight: weightFromLabel(weightLabel), weight_label: weightLabel };
  }).filter(Boolean) as PreviewReward[];
}

function pickWeighted(rewards: PreviewReward[]) {
  const fallback: PreviewReward[] = [{ id: 'demo', label: 'Lucky Bite', reward_type: 'custom', reward_value: null, weight: 30, weight_label: 'Normal' }];
  const pool = rewards.length ? rewards : fallback;
  let random = Math.random() * pool.reduce((sum, item) => sum + item.weight, 0);
  for (const reward of pool) { random -= reward.weight; if (random <= 0) return reward; }
  return pool[pool.length - 1];
}

function MysteryBoxPreview({ rewards }: { rewards: PreviewReward[] }) {
  const [phase, setPhase] = useState<'idle' | 'opening' | 'revealed'>('idle');
  const [chosen, setChosen] = useState<number | null>(null);
  const [won, setWon] = useState<PreviewReward | null>(null);

  function test(box?: number) {
    if (phase !== 'idle') return;
    const reward = pickWeighted(parseBuilderRewards().length ? parseBuilderRewards() : rewards);
    setChosen(box ?? Math.floor(Math.random() * 3));
    setWon(reward);
    setPhase('opening');
    setTimeout(() => { confetti({ particleCount: 220, spread: 120, origin: { y: 0.55 }, shapes: ['square', 'circle', 'star'] }); setPhase('revealed'); }, 1000);
    setTimeout(() => { setPhase('idle'); setChosen(null); setWon(null); }, 5200);
  }

  return <div className="min-w-0 rounded-[2rem] bg-white/95 p-4 text-[#1F1F1F] shadow-2xl ring-1 ring-white/50 sm:p-5">
    <style jsx>{`@keyframes float{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-8px) scale(1.04)}}@keyframes tremble{0%,100%{transform:translate(-50%,-50%) rotate(0deg) scale(1.2)}25%{transform:translate(-50%,-50%) rotate(-7deg) scale(1.3)}50%{transform:translate(-50%,-50%) rotate(7deg) scale(1.35)}75%{transform:translate(-50%,-50%) rotate(-4deg) scale(1.28)}}@keyframes pop{0%{transform:translateY(20px) scale(.7);opacity:0}60%{transform:translateY(-8px) scale(1.05);opacity:1}100%{transform:translateY(0) scale(1);opacity:1}}`}</style>
    <div className="mb-4 rounded-3xl bg-green-50 p-4 text-green-800"><p className="text-xs font-black uppercase tracking-[0.14em]">Selected Game</p><p className="mt-1 text-2xl font-black">🎁 Mystery Box Reveal</p><p className="mt-1 text-sm font-bold">Customers will tap one of 3 mystery boxes to reveal a reward.</p></div>
    <div className="rounded-[2rem] bg-gradient-to-br from-orange-50 to-amber-100 p-5 text-center shadow-inner">
      <div className="mb-4 flex items-center justify-between gap-3"><div className="text-left"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#FF6B00]">Mystery Box Preview</p>{phase === 'revealed' && won && <p className="mt-1 text-sm font-black text-green-700">🎉 {rewardText(won)}</p>}</div><button onClick={() => test()} disabled={phase !== 'idle'} className="rounded-full bg-[#1F1F1F] px-5 py-2 text-sm font-black text-white shadow-lg disabled:bg-stone-300">Test</button></div>
      <h3 className="mt-2 text-3xl font-black leading-tight">{phase === 'idle' ? 'Pick a box to reveal your prize' : phase === 'opening' ? 'Opening your mystery box...' : 'Prize revealed!'}</h3>
      <div className={`relative mt-6 ${phase === 'idle' ? 'grid min-h-[8rem] grid-cols-3 gap-3' : 'min-h-[15rem]'}`}>{[0,1,2].map((box) => { const isChosen = chosen === box; const hidden = phase !== 'idle' && !isChosen; return <button key={box} onClick={() => test(box)} disabled={phase !== 'idle'} className={`relative flex h-28 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-[#FF6B00] to-[#E63939] shadow-xl transition ${hidden ? 'scale-75 opacity-0' : ''}`} style={phase === 'idle' ? { animation: `float 2.4s ease-in-out infinite ${box * .15}s` } : isChosen ? { position: 'absolute', left: '50%', top: '42%', width: '8.5rem', height: '8.5rem', zIndex: 30, animation: phase === 'opening' ? 'tremble 1s ease-in-out infinite' : undefined, transform: 'translate(-50%, -50%) scale(1.15)' } : undefined}><span className="absolute -top-2 text-xl">✨</span><span className="text-5xl">{phase === 'revealed' && isChosen ? '🎉' : '🎁'}</span><span className="absolute bottom-2 text-xs font-black uppercase text-white">{phase === 'revealed' && isChosen ? 'Opened' : `Box ${box + 1}`}</span></button>; })}{phase === 'revealed' && won && <div className="pointer-events-none absolute inset-0 z-40 flex items-end justify-center px-2 pb-2"><div className="w-full rounded-[2rem] bg-white p-4 text-center shadow-xl" style={{ animation: 'pop .7s ease-out forwards' }}><p className="text-xs font-black uppercase tracking-[0.14em] text-[#FF6B00]">🎉 You won</p><p className="mt-1 text-2xl font-black leading-tight text-green-700">{rewardText(won)}</p><p className="mt-2 text-[10px] font-bold uppercase text-stone-500">Preview only. Coupon issuing happens on the live play page.</p></div></div>}</div>
      <div className="mt-5 space-y-2 text-left"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[0.14em] text-stone-500">Mystery Box Rewards</p><p className="text-[10px] font-black uppercase tracking-wide text-green-700">Using builder rewards</p></div>{rewards.length ? rewards.map((reward) => <div key={reward.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/90 px-4 py-3 shadow-sm"><p className="min-w-0 truncate text-sm font-black text-stone-900">{rewardText(reward)}</p><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black uppercase ${badgeClass(reward.weight_label)}`}>{reward.weight_label}</span></div>) : <div className="rounded-2xl bg-white/80 p-4 text-left text-sm font-black text-stone-600">Add rewards below. The Mystery Box preview uses the same visible rewards as the Spin Wheel builder.</div>}</div>
    </div>
  </div>;
}

export default function BuilderMysteryBoxPreviewPatch({ promotionId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [isMysteryBox, setIsMysteryBox] = useState(false);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [rewards, setRewards] = useState<PreviewReward[]>([]);
  const last = useRef('');

  useEffect(() => { supabase.from('promotions').select('game_type').eq('id', promotionId).single().then((r) => setIsMysteryBox(r.data?.game_type === 'mystery_box')); }, [promotionId, supabase]);
  useEffect(() => { if (!isMysteryBox) return; function mount(){ const wheel = findWheelPreviewCard(); if(!wheel) return; wheel.style.display='none'; let host=document.getElementById('spinbite-mystery-react-preview') as HTMLElement | null; if(!host){host=document.createElement('div'); host.id='spinbite-mystery-react-preview'; wheel.insertAdjacentElement('afterend', host);} setMountNode(host);} mount(); const observer=new MutationObserver(mount); observer.observe(document.body,{childList:true,subtree:true}); const timer=setInterval(mount,1000); return()=>{observer.disconnect(); clearInterval(timer);}; }, [isMysteryBox]);
  useEffect(() => { if (!isMysteryBox) return; function sync(){ const live=parseBuilderRewards(); const next=sig(live); if(next!==last.current){last.current=next; setRewards(live);} } sync(); const observer=new MutationObserver(sync); observer.observe(document.body,{childList:true,subtree:true,characterData:true}); const timer=setInterval(sync,800); return()=>{observer.disconnect(); clearInterval(timer);}; }, [isMysteryBox]);

  if (!isMysteryBox || !mountNode) return null;
  return createPortal(<MysteryBoxPreview rewards={rewards} />, mountNode);
}

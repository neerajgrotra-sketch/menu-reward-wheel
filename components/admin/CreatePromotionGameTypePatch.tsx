'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'spinbite_pending_promotion_game_type';

type GameType = 'wheel' | 'mystery_box';

function findStep3Card() {
  const labels = Array.from(document.querySelectorAll('p'));
  const stepLabel = labels.find((node) => node.textContent?.toLowerCase().includes('step 3') && node.textContent?.toLowerCase().includes('game'));
  return stepLabel?.closest('.rounded-3xl, .rounded-\[2rem\]') as HTMLElement | null;
}

function findSpinWheelButton(card: HTMLElement) {
  return Array.from(card.querySelectorAll('button')).find((button) => button.textContent?.toLowerCase().includes('spin wheel')) as HTMLButtonElement | undefined;
}

export default function CreatePromotionGameTypePatch() {
  const [selected, setSelected] = useState<GameType>('wheel');

  useEffect(() => {
    const current = window.localStorage.getItem(STORAGE_KEY);
    if (current === 'mystery_box') setSelected('mystery_box');
  }, []);

  useEffect(() => {
    let attempts = 0;
    let spinButton: HTMLButtonElement | undefined;
    let mysteryButton: HTMLButtonElement | null = null;

    function apply(next: GameType) {
      setSelected(next);
      window.localStorage.setItem(STORAGE_KEY, next);

      if (spinButton) {
        spinButton.className = next === 'wheel'
          ? 'mt-3 w-full rounded-3xl border-2 border-green-600 bg-green-50 p-5 text-left'
          : 'mt-3 w-full rounded-3xl border-2 border-stone-100 bg-stone-50 p-5 text-left';
      }
      if (mysteryButton) {
        mysteryButton.className = next === 'mystery_box'
          ? 'mt-3 w-full rounded-3xl border-2 border-green-600 bg-green-50 p-5 text-left'
          : 'mt-3 w-full rounded-3xl border-2 border-stone-100 bg-stone-50 p-5 text-left';
      }
    }

    const timer = window.setInterval(() => {
      attempts += 1;
      const card = findStep3Card();
      if (!card) {
        if (attempts > 40) window.clearInterval(timer);
        return;
      }

      spinButton = findSpinWheelButton(card);
      if (!spinButton) {
        if (attempts > 40) window.clearInterval(timer);
        return;
      }

      if (document.getElementById('spinbite-create-mystery-box-option')) {
        window.clearInterval(timer);
        return;
      }

      spinButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        apply('wheel');
      }, true);

      mysteryButton = document.createElement('button');
      mysteryButton.id = 'spinbite-create-mystery-box-option';
      mysteryButton.type = 'button';
      mysteryButton.innerHTML = `
        <div class="flex items-start gap-4">
          <div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white text-4xl shadow-inner">🎁</div>
          <div>
            <p class="text-2xl font-black">Mystery Box Reveal</p>
            <p class="mt-1 text-sm font-bold text-stone-600">Customers tap one of 3 mystery boxes and reveal a surprise coupon with stars and confetti.</p>
            <p class="mt-2 text-xs font-black uppercase text-green-700">Available now</p>
          </div>
        </div>
      `;
      mysteryButton.addEventListener('click', () => apply('mystery_box'));
      spinButton.insertAdjacentElement('afterend', mysteryButton);
      apply(selected);
      window.clearInterval(timer);
    }, 200);

    return () => window.clearInterval(timer);
  }, [selected]);

  return null;
}

export { STORAGE_KEY };

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const STORAGE_KEY = 'spinbite_pending_promotion_game_type';

type GameType = 'wheel' | 'mystery_box';

function toSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function findStep3Card() {
  const nodes = Array.from(document.querySelectorAll('p, h2, h3, div'));
  const stepLabel = nodes.find((node) => {
    const text = node.textContent?.toLowerCase() || '';
    return text.includes('step 3') && text.includes('game type');
  });
  return stepLabel?.closest('[class*="rounded"]') as HTMLElement | null;
}

function findSpinWheelButton(card: HTMLElement) {
  return Array.from(card.querySelectorAll('button')).find((button) => {
    const text = button.textContent?.toLowerCase() || '';
    return text.includes('spin wheel');
  }) as HTMLButtonElement | undefined;
}

function findPromotionName() {
  const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
  const named = inputs.find((input) => input.placeholder?.toLowerCase().includes('halloween'));
  return named?.value.trim() || '';
}

function findRestaurantId() {
  const select = document.querySelector('select') as HTMLSelectElement | null;
  return select?.value || '';
}

function findCreateButton() {
  return Array.from(document.querySelectorAll('button')).find((button) => {
    const text = button.textContent?.toLowerCase() || '';
    return text.includes('create promotion');
  }) as HTMLButtonElement | undefined;
}

function selectedClass(isSelected: boolean) {
  return isSelected
    ? 'mt-3 w-full rounded-3xl border-2 border-green-600 bg-green-50 p-5 text-left'
    : 'mt-3 w-full rounded-3xl border-2 border-stone-100 bg-stone-50 p-5 text-left';
}

export default function CreatePromotionGameTypePatch() {
  const supabase = useMemo(() => createClient(), []);
  const [selected, setSelected] = useState<GameType>('wheel');
  const selectedRef = useRef<GameType>('wheel');
  const creatingRef = useRef(false);

  useEffect(() => {
    const current = window.localStorage.getItem(STORAGE_KEY);
    if (current === 'mystery_box') {
      selectedRef.current = 'mystery_box';
      setSelected('mystery_box');
    } else {
      window.localStorage.setItem(STORAGE_KEY, 'wheel');
    }
  }, []);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    let spinButton: HTMLButtonElement | undefined;
    let mysteryButton: HTMLButtonElement | null = null;
    let createButton: HTMLButtonElement | undefined;

    function apply(next: GameType) {
      selectedRef.current = next;
      setSelected(next);
      window.localStorage.setItem(STORAGE_KEY, next);

      if (spinButton) spinButton.className = selectedClass(next === 'wheel');
      if (mysteryButton) mysteryButton.className = selectedClass(next === 'mystery_box');
    }

    async function createMysteryBoxDraft(event: Event) {
      if (selectedRef.current !== 'mystery_box') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (creatingRef.current) return;
      creatingRef.current = true;

      const name = findPromotionName();
      const restaurantId = findRestaurantId();
      if (!name || !restaurantId) {
        creatingRef.current = false;
        alert('Please select a restaurant and enter a promotion name.');
        return;
      }

      const slug = `${toSlug(name)}-${Date.now().toString().slice(-4)}`;
      const response = await supabase
        .from('promotions')
        .insert({ restaurant_id: restaurantId, name, slug, status: 'draft', game_type: 'mystery_box' })
        .select('id')
        .single();

      if (response.error || !response.data) {
        creatingRef.current = false;
        alert(response.error?.message || 'Could not create Mystery Box promotion.');
        return;
      }

      window.localStorage.setItem(STORAGE_KEY, 'mystery_box');
      window.location.href = `/admin/promotions/${response.data.id}/builder`;
    }

    function mount() {
      const card = findStep3Card();
      if (card) {
        spinButton = findSpinWheelButton(card);
        mysteryButton = document.getElementById('spinbite-create-mystery-box-option') as HTMLButtonElement | null;

        if (spinButton && !mysteryButton) {
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
          apply(selectedRef.current);
        }
      }

      const nextCreateButton = findCreateButton();
      if (nextCreateButton && nextCreateButton !== createButton) {
        createButton = nextCreateButton;
        createButton.addEventListener('click', createMysteryBoxDraft, true);
      }
    }

    mount();
    const observer = new MutationObserver(() => mount());
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(() => mount(), 500);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      if (createButton) createButton.removeEventListener('click', createMysteryBoxDraft, true);
    };
  }, [supabase]);

  return null;
}

export { STORAGE_KEY };

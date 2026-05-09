'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import GameTypeRegistrySelector from '@/components/admin/GameTypeRegistrySelector';
import type { GameType } from '@/lib/games/types';

type SlotState = {
  slot: HTMLElement;
  host: HTMLElement;
};

const STORAGE_KEY = 'spinbite_pending_promotion_game_type';

function gameTypeFromText(text: string): GameType | null {
  const normalized = text.toLowerCase();
  if (normalized.includes('spin wheel')) return 'wheel';
  if (normalized.includes('mystery box')) return 'mystery_box';
  if (normalized.includes('scratch card')) return 'scratch_card';
  return null;
}

function persistPendingGameType(gameType: GameType) {
  window.localStorage.setItem(STORAGE_KEY, gameType);
}

function findStep3Slot() {
  if (typeof window === 'undefined') return null;
  if (window.location.pathname !== '/admin/promotions') return null;

  const labels = Array.from(document.querySelectorAll('p'));
  const label = labels.find((node) => node.textContent?.trim().toLowerCase() === 'step 3: select game type');
  return label?.closest('.rounded-3xl') as HTMLElement | null;
}

function getOriginalButtons(slot: HTMLElement) {
  return Array.from(slot.querySelectorAll('button')).filter((button) => {
    const gameType = gameTypeFromText(button.textContent || '');
    return Boolean(gameType);
  }) as HTMLButtonElement[];
}

function getSelectedGameType(slot: HTMLElement): GameType {
  const originalButtons = getOriginalButtons(slot);
  const selectedButton = originalButtons.find((button) => button.className.includes('border-green-600'));
  const selected = selectedButton ? gameTypeFromText(selectedButton.textContent || '') : null;
  return selected || 'wheel';
}

function selectOriginalGameType(slot: HTMLElement, gameType: GameType) {
  persistPendingGameType(gameType);
  const button = getOriginalButtons(slot).find((item) => gameTypeFromText(item.textContent || '') === gameType);
  button?.click();
}

function applyReplacement(slot: HTMLElement) {
  const originalButtons = getOriginalButtons(slot);
  originalButtons.forEach((button) => {
    button.style.display = 'none';
    button.setAttribute('aria-hidden', 'true');
  });

  let host = slot.querySelector('[data-spinbite-create-game-selector-host="true"]') as HTMLElement | null;
  if (!host) {
    host = document.createElement('div');
    host.dataset.spinbiteCreateGameSelectorHost = 'true';
    slot.appendChild(host);
  }

  return host;
}

export default function CreatePromotionGameSelectorBridge() {
  const [slotState, setSlotState] = useState<SlotState | null>(null);
  const [selectedGameType, setSelectedGameType] = useState<GameType>('wheel');

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    function locate() {
      if (cancelled) return;
      const slot = findStep3Slot();
      if (slot) {
        const host = applyReplacement(slot);
        const current = getSelectedGameType(slot);
        persistPendingGameType(current);
        setSelectedGameType(current);
        setSlotState({ slot, host });
        return;
      }

      attempts += 1;
      if (attempts < 30) window.setTimeout(locate, 150);
    }

    locate();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!slotState) return null;

  return createPortal(
    <GameTypeRegistrySelector
      selectedGameType={selectedGameType}
      onSelect={(nextGameType) => {
        selectOriginalGameType(slotState.slot, nextGameType);
        setSelectedGameType(nextGameType);
      }}
    />,
    slotState.host
  );
}

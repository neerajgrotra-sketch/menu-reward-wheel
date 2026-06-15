// CANONICAL GAME REGISTRY — Single source of truth for game display metadata.
// Rule 13: Core entities must never have duplicate implementations.
// Owns: id, label, status, description, visual key.
// Does NOT own: runtime components, animations, config panels, icons (those live in each game contract).
// Import label/status/description from here; import icon via getGameBadge(); import visuals from GameVisual.tsx.

import { getGameDefinition } from '@/lib/games/registry';

export type GameStatus = 'live' | 'beta' | 'coming_soon';

export type GameMeta = {
  id: string;
  label: string;
  status: GameStatus;
  description: string;
  visual: string;
};

export const GAME_REGISTRY: Record<string, GameMeta> = {
  spin_wheel: {
    id: 'spin_wheel',
    label: 'Spin Wheel',
    status: 'live',
    description:
      'Customers scan a QR code, spin a branded prize wheel, and win configured rewards.',
    visual: 'spin_wheel',
  },

  mystery_box: {
    id: 'mystery_box',
    label: 'Mystery Box Reveal',
    status: 'live',
    description:
      'Customers tap one of three mystery boxes and reveal a surprise reward.',
    visual: 'mystery_box',
  },

  scratch_card: {
    id: 'scratch_card',
    label: 'Scratch Card',
    status: 'live',
    description:
      'Customers scratch through a digital card to reveal a surprise reward.',
    visual: 'scratch_card',
  },

  reward_reels: {
    id: 'reward_reels',
    label: 'Lucky Reels',
    status: 'live',
    description:
      'Customers pull the reels and unlock a surprise reward.',
    visual: 'reward_reels',
  },

  open_the_door: {
    id: 'open_the_door',
    label: 'Open The Door',
    status: 'live',
    description:
      'Customers choose one door and reveal a hidden reward.',
    visual: 'open_the_door',
  },
};

/**
 * Returns the canonical display metadata for a game type.
 * Handles the 'wheel' DB alias for 'spin_wheel'.
 * Falls back to spin_wheel for unknown or missing types.
 */
export function getGameMeta(gameType?: string | null): GameMeta {
  if (!gameType) return GAME_REGISTRY.spin_wheel;
  const key = gameType === 'wheel' ? 'spin_wheel' : gameType;
  return GAME_REGISTRY[key] ?? GAME_REGISTRY.spin_wheel;
}

// Single-import helper for surfaces that need both icon and label.
// Icon is authoritative in each game contract; label is authoritative here.
export function getGameBadge(gameType?: string | null): { icon: string; label: string } {
  const meta = getGameMeta(gameType);
  const def = getGameDefinition(gameType);
  return { icon: def.icon, label: meta.label };
}

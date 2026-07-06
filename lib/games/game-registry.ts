// CANONICAL GAME REGISTRY — Single source of truth for game DISPLAY METADATA only.
// Rule 13: Core entities must never have duplicate implementations.
// Owns: id, label, description, visual key.
// Does NOT own: availability (source of truth = public.games DB table), runtime components,
//   animations, config panels, icons (those live in each game contract).
// DEPRECATED for availability decisions: do not use GAME_REGISTRY to decide which games
//   can be selected. Query public.games WHERE status='active' instead.

import { getGameDefinition } from '@/lib/games/registry';

export type GameMeta = {
  id: string;
  label: string;
  description: string;
  visual: string;
};

export const GAME_REGISTRY: Record<string, GameMeta> = {
  spin_wheel: {
    id: 'spin_wheel',
    label: 'Spin Wheel',
    description:
      'Customers scan a QR code, spin a branded prize wheel, and win configured rewards.',
    visual: 'spin_wheel',
  },

  mystery_box: {
    id: 'mystery_box',
    label: 'Mystery Box Reveal',
    description:
      'Customers tap one of three mystery boxes and reveal a surprise reward.',
    visual: 'mystery_box',
  },

  scratch_card: {
    id: 'scratch_card',
    label: 'Scratch Card',
    description:
      'Customers scratch through a digital card to reveal a surprise reward.',
    visual: 'scratch_card',
  },

  reward_reels: {
    id: 'reward_reels',
    label: 'Lucky Reels',
    description:
      'Customers pull the reels and unlock a surprise reward.',
    visual: 'reward_reels',
  },

  open_the_door: {
    id: 'open_the_door',
    label: 'Open The Door',
    description:
      'Customers choose one door and reveal a hidden reward.',
    visual: 'open_the_door',
  },
};

/**
 * Returns the canonical display metadata for a game type.
 * Handles the 'wheel' DB alias for 'spin_wheel'.
 * Returns spin_wheel metadata as a safe fallback but logs an error for truly unknown types.
 */
export function getGameMeta(gameType?: string | null): GameMeta {
  if (!gameType) return GAME_REGISTRY.spin_wheel;
  const key = gameType === 'wheel' ? 'spin_wheel' : gameType;
  if (!GAME_REGISTRY[key]) {
    console.error(`[getGameMeta] Unknown game type: "${gameType}". Falling back to spin_wheel display metadata.`);
    return GAME_REGISTRY.spin_wheel;
  }
  return GAME_REGISTRY[key];
}

// Single-import helper for surfaces that need both icon and label.
// Icon is authoritative in each game contract; label is authoritative here.
export function getGameBadge(gameType?: string | null): { icon: string; label: string } {
  const meta = getGameMeta(gameType);
  const def = getGameDefinition(gameType);
  return { icon: def.icon, label: meta.label };
}

// games.slug is the original, NOT NULL, UNIQUE identifier present on every row
// since the table's first migration. games.game_type is a later convenience
// column (20260601000000_normalize_game_identifiers.sql) that is only
// guaranteed to be backfilled for rows that existed at that migration's
// runtime — resolve it from slug instead of trusting the column, so UI that
// lists active games doesn't silently drop rows whose game_type is null.
// Mirrors the game_slug case statement in validate_active_game_assignment()
// (20260616020000_validate_active_game_assignments.sql) — keep both in sync.
const SLUG_TO_GAME_TYPE: Record<string, string> = {
  'spin-wheel': 'spin_wheel',
  'mystery-box': 'mystery_box',
  'scratch-win': 'scratch_card',
  'lucky-slot': 'reward_reels',
  'open-the-door': 'open_the_door',
  'pick-a-card': 'pick_a_card',
};

export function resolveGameTypeFromSlug(slug: string): string | null {
  return SLUG_TO_GAME_TYPE[slug] ?? null;
}

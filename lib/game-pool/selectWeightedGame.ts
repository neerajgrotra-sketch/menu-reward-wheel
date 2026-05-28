import { GamePoolEntry, SelectedGameResult } from './types';

export function selectWeightedGame(
  entries: GamePoolEntry[],
): SelectedGameResult {
  const enabledEntries = entries.filter(
    (entry) => entry.enabled && entry.weight > 0,
  );

  if (enabledEntries.length === 0) {
    throw new Error('No enabled games available in pool');
  }

  const totalWeight = enabledEntries.reduce(
    (sum, entry) => sum + entry.weight,
    0,
  );

  const random = Math.random() * totalWeight;

  let cumulativeWeight = 0;

  for (const entry of enabledEntries) {
    cumulativeWeight += entry.weight;

    if (random <= cumulativeWeight) {
      return {
        gameType: entry.gameType,
        selectedAt: new Date().toISOString(),
      };
    }
  }

  const fallback = enabledEntries[enabledEntries.length - 1];

  return {
    gameType: fallback.gameType,
    selectedAt: new Date().toISOString(),
  };
}

export type MysteryBoxPhase =
  | 'idle'
  | 'selected'
  | 'opening'
  | 'completed';

export type MysteryBoxEvent =
  | { type: 'SELECT_BOX'; index: number }
  | { type: 'START_OPENING' }
  | { type: 'COMPLETE' }
  | { type: 'RESET' };

export type MysteryBoxState = {
  phase: MysteryBoxPhase;
  selectedBox: number | null;
};

export const defaultMysteryBoxState: MysteryBoxState = {
  phase: 'idle',
  selectedBox: null,
};

export function reduceMysteryBoxState(
  state: MysteryBoxState,
  event: MysteryBoxEvent,
): MysteryBoxState {
  switch (event.type) {
    case 'SELECT_BOX':
      if (state.phase !== 'idle') return state;
      return {
        phase: 'selected',
        selectedBox: event.index,
      };

    case 'START_OPENING':
      if (state.phase !== 'selected') return state;
      return {
        ...state,
        phase: 'opening',
      };

    case 'COMPLETE':
      if (state.phase !== 'opening') return state;
      return {
        ...state,
        phase: 'completed',
      };

    case 'RESET':
      return defaultMysteryBoxState;

    default:
      return state;
  }
}

export function getMysteryBoxStatusText(state: MysteryBoxState) {
  if (state.phase === 'opening') return 'Opening...';
  if (state.phase === 'completed') return 'Reward revealed!';
  if (state.phase === 'selected' && state.selectedBox !== null) return `Opening Box ${state.selectedBox + 1}...`;
  return 'Pick a box';
}

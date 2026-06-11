# Open The Door Runtime Design

> **Status (June 2026):** This game is live. Contract at `lib/games/open-the-door/contract.ts`, runtime at `lib/games/open-the-door/runtime.tsx`, builder preview at `lib/games/open-the-door/builderPreview.tsx`. Design spec below is the reference for the implemented animation system.

## Overview

The Open The Door runtime is a dedicated experience for the `open_the_door` game type.
It replaces any previous shared or Mystery Box visuals with a door-focused interaction pattern.

### Goal

Create an immersive three-door reveal flow with distinct idle, hover/tap, and selection animations.

## Animation states

### Idle

- Doors float subtly with a slow vertical motion.
- Each door has a soft glow around its edges.
- A warm light leaks from beneath each door to suggest mystery behind it.
- The header and description emphasize the theme:
  - `Choose a mysterious door`
  - `Tap a door to reveal your prize behind it.`

### Hover / Tap

- The door scales up slightly on hover.
- The door glow intensifies.
- The door body lifts subtly.

### Selection

- The selected door swings open with a 3D rotation effect.
- A bright burst animation appears at the revealed door.
- The label transitions from `Door X` to `Opening...` and then `Revealed!`.
- Once the selection completes, the door returns to idle state after a short delay.

## States

- `idle`
  - All three doors are available.
  - The user can tap any door.
- `selected`
  - The chosen door is marked active.
  - The experience transitions into reveal animation.
- `revealing`
  - The door swings open.
  - A status line updates to show progress.
- `completed`
  - The reveal is complete.
  - A reward burst is displayed.
  - The runtime resets to idle after a short delay, preserving the surprise.

## Reusable components

The runtime is organized around these reusable visual pieces:

- `door-shell`
  - The main door panel container.
  - Applies rounded corners and base door gradient.
- `door-frame`
  - A subtle border around each door.
  - Provides structure and depth.
- `door-panel`
  - The door face itself.
  - Holds the door knob and surface styling.
- `door-knob`
  - The interactive handle detail.
- `door-glow`
  - A soft animated glow layer.
  - Increases opacity on hover and when active.
- `door-light`
  - Simulates light leaking from beneath the door.
- `reward-reveal`
  - The burst effect shown after the reveal completes.

## Implementation notes

- The runtime uses inline styled-jsx animations for the door float, glow pulse, swing open, and reward burst.
- The selection behavior is driven by the same `DoorState` phases used by other game runtimes.
- This file is intentionally isolated from Mystery Box styling and state management.

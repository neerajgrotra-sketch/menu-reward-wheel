# Open The Door Selection Bug

## Root cause

The button click handler in `components/promotion-builder/GameSelectionSection.tsx` only invoked `onChange` for `wheel`, `mystery_box`, and `scratch_card` games.

`open_the_door` was marked as selectable and displayed correctly, but its click event was ignored because the explicit handler condition did not include it.

## Files changed

- `components/promotion-builder/GameSelectionSection.tsx`

## Why other games worked

Other games worked because the handler explicitly allowed `wheel`, `mystery_box`, and `scratch_card`.

When those games were clicked, `onChange(game.type)` executed and the builder state updated normally.

## Why Open The Door failed

`open_the_door` failed because the handler used a narrower condition than the `isSelectable` check.

Even though the card was enabled and visible, the click handler did not pass `open_the_door` through to the promotion builder.

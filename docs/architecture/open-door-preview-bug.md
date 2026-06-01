# Open The Door Preview Bug

## Root Cause

The admin builder preview path in `components/admin/SpinWheelPreview.tsx` used a hard-coded fallback to `MysteryBoxBuilderPreview` for any non-wheel game type.

That meant `open_the_door` promotions rendered the Mystery Box preview UI instead of their own door-based preview.

## Fix

- Added a dedicated builder preview component for Open The Door at `lib/games/open-the-door/builderPreview.tsx`.
- Registered it in the Open The Door game contract at `lib/games/open-the-door/contract.ts` via `components.BuilderPreview`.
- Updated `components/admin/SpinWheelPreview.tsx` so non-wheel previews use `game.components.BuilderPreview` when available.

## Result

Open The Door now shows a door-based builder preview instead of inherited Mystery Box visuals in the admin/promotion builder preview.

-- MS-3: Menu Stabilization — Orphan Menu Items Recovery
-- Pre-execution count (2026-06-09): null_menu_id = 0, total = 13
-- All items already have valid menu_id. Runs as a documented safeguard.
-- Assigns any orphaned items (menu_id IS NULL) to the oldest menu for
-- their restaurant. Items with no restaurant or no menus are left as-is.

UPDATE public.menu_items
SET menu_id = (
  SELECT id
  FROM public.menus
  WHERE restaurant_id = menu_items.restaurant_id
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE menu_id IS NULL
  AND restaurant_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.menus WHERE restaurant_id = menu_items.restaurant_id
  );

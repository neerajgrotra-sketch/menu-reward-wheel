-- MS-4: Menu Stabilization — Enforce NOT NULL on menu_items.menu_id
-- Safe to apply: MS-3 ran first; verified 0 null values and 0 broken FKs.
-- Prevents future orphaned items from being created at the database level.

ALTER TABLE public.menu_items
  ALTER COLUMN menu_id SET NOT NULL;

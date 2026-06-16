-- UX-1: Restaurant Vocabulary Standardization — Section → Category
-- Replaces all restaurant-facing "Section/Sections" labels in the admin_menu
-- site_content rows with "Category/Categories" language.
--
-- RULE: DB rows override the code fallbackCopy object, so both layers must agree.
-- The fallbackCopy in app/admin/menu/page.tsx already uses "Category" language;
-- this migration aligns the live DB to match.
--
-- DOWN (rollback): re-run the commented UPDATE block below, swapping values back.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── UP ────────────────────────────────────────────────────────────────────────

UPDATE public.site_content
SET value = 'Categories'
WHERE page_key = 'admin_menu' AND field_key = 'eyebrow';

UPDATE public.site_content
SET value = 'Build Your Menu Categories'
WHERE page_key = 'admin_menu' AND field_key = 'headline';

UPDATE public.site_content
SET value = 'Organize your dishes into categories like Appetizers, Main Course, Desserts, and Drinks. Choose your restaurant location before managing categories.'
WHERE page_key = 'admin_menu' AND field_key = 'subheadline';

UPDATE public.site_content
SET value = 'Step 2: Create Category'
WHERE page_key = 'admin_menu' AND field_key = 'create_menu_label';

UPDATE public.site_content
SET value = 'No categories for this location yet'
WHERE page_key = 'admin_menu' AND field_key = 'no_menus_title';

UPDATE public.site_content
SET value = 'Create the first category for this restaurant location.'
WHERE page_key = 'admin_menu' AND field_key = 'no_menus_copy';

-- ── DOWN (rollback) ────────────────────────────────────────────────────────────
-- To revert, execute the following block manually:
--
-- UPDATE public.site_content SET value = 'Sections'
--   WHERE page_key = 'admin_menu' AND field_key = 'eyebrow';
--
-- UPDATE public.site_content SET value = 'Build your menu sections.'
--   WHERE page_key = 'admin_menu' AND field_key = 'headline';
--
-- UPDATE public.site_content
--   SET value = 'Sections are tied to one restaurant location. Select the exact location before creating or editing items.'
--   WHERE page_key = 'admin_menu' AND field_key = 'subheadline';
--
-- UPDATE public.site_content SET value = 'Step 2: Create Section'
--   WHERE page_key = 'admin_menu' AND field_key = 'create_menu_label';
--
-- UPDATE public.site_content SET value = 'No sections for this location yet'
--   WHERE page_key = 'admin_menu' AND field_key = 'no_menus_title';
--
-- UPDATE public.site_content SET value = 'Create the first section for this restaurant location.'
--   WHERE page_key = 'admin_menu' AND field_key = 'no_menus_copy';

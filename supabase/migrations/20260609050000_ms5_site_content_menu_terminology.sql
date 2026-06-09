-- MS-5: Menu Stabilization — Update admin_menu site_content terminology
-- Renames user-visible "Menu/Menus" labels to "Section/Sections" in the CMS.
-- These DB rows override the code fallback, so both must be updated.

UPDATE public.site_content
SET value = 'Sections'
WHERE page_key = 'admin_menu' AND field_key = 'eyebrow';

UPDATE public.site_content
SET value = 'Build your menu sections.'
WHERE page_key = 'admin_menu' AND field_key = 'headline';

UPDATE public.site_content
SET value = 'Sections are tied to one restaurant location. Select the exact location before creating or editing items.'
WHERE page_key = 'admin_menu' AND field_key = 'subheadline';

UPDATE public.site_content
SET value = 'Step 2: Create Section'
WHERE page_key = 'admin_menu' AND field_key = 'create_menu_label';

UPDATE public.site_content
SET value = 'No sections for this location yet'
WHERE page_key = 'admin_menu' AND field_key = 'no_menus_title';

UPDATE public.site_content
SET value = 'Create the first section for this restaurant location.'
WHERE page_key = 'admin_menu' AND field_key = 'no_menus_copy';

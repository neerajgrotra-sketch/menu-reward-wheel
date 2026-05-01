insert into public.site_content (page_key, section_key, field_key, label, value, field_type, sort_order, is_active)
values
  ('admin', 'dashboard', 'eyebrow', 'Admin Dashboard Eyebrow', 'Today’s workspace', 'text', 10, true),
  ('admin', 'dashboard', 'headline_fallback', 'Admin Dashboard Fallback Headline', 'Ready to make today’s orders more exciting?', 'text', 20, true),
  ('admin', 'dashboard', 'subheadline', 'Admin Dashboard Subheadline', 'Build promotions, publish QR-ready games, validate coupons, and start turning attention into orders.', 'textarea', 30, true),
  ('admin', 'dashboard', 'create_promotion_title', 'Create Promotion Tile Title', 'Create Promotion', 'text', 40, true),
  ('admin', 'dashboard', 'create_promotion_copy', 'Create Promotion Tile Copy', 'Start a brand-new campaign draft and build a reward wheel.', 'textarea', 50, true),
  ('admin', 'dashboard', 'manage_promotions_title', 'Manage Promotions Tile Title', 'Manage Promotions', 'text', 60, true),
  ('admin', 'dashboard', 'manage_promotions_copy', 'Manage Promotions Tile Copy', 'Edit drafts, monitor active campaigns, end promotions, and copy QR links.', 'textarea', 70, true),
  ('admin', 'dashboard', 'validate_coupons_title', 'Validate Coupons Tile Title', 'Validate Coupons', 'text', 80, true),
  ('admin', 'dashboard', 'validate_coupons_copy', 'Validate Coupons Tile Copy', 'Scan or enter customer coupon codes at the counter.', 'textarea', 90, true),
  ('admin', 'dashboard', 'menus_title', 'Menus Tile Title', 'Menus', 'text', 100, true),
  ('admin', 'dashboard', 'menus_copy', 'Menus Tile Copy', 'Build breakfast, lunch, dinner, and special menus for promotions.', 'textarea', 110, true),
  ('admin', 'dashboard', 'restaurants_title', 'Manage Restaurants Tile Title', 'Manage Restaurants', 'text', 120, true),
  ('admin', 'dashboard', 'restaurants_copy', 'Manage Restaurants Tile Copy', 'Add locations and update restaurant profiles.', 'textarea', 130, true),

  ('admin_menu', 'hero', 'eyebrow', 'Menu Builder Eyebrow', 'Menus', 'text', 10, true),
  ('admin_menu', 'hero', 'headline', 'Menu Builder Headline', 'Build menus for rewards and promotions.', 'text', 20, true),
  ('admin_menu', 'hero', 'subheadline', 'Menu Builder Subheadline', 'Menus are tied to one restaurant location. Select the exact location before creating or editing items.', 'textarea', 30, true),
  ('admin_menu', 'steps', 'select_location_label', 'Select Location Label', 'Step 1: Select Restaurant Location', 'text', 40, true),
  ('admin_menu', 'steps', 'create_menu_label', 'Create Menu Label', 'Step 2: Create Menu', 'text', 50, true),
  ('admin_menu', 'empty_state', 'no_menus_title', 'No Menus Empty State Title', 'No menus for this location yet', 'text', 60, true),
  ('admin_menu', 'empty_state', 'no_menus_copy', 'No Menus Empty State Copy', 'Create the first menu for this restaurant location.', 'textarea', 70, true),

  ('admin_promotions', 'hero', 'eyebrow', 'Promotions Eyebrow', 'Promotions', 'text', 10, true),
  ('admin_promotions', 'hero', 'create_headline', 'Create Mode Headline', 'Start a new campaign draft.', 'text', 20, true),
  ('admin_promotions', 'hero', 'create_subheadline', 'Create Mode Subheadline', 'Choose a restaurant location, name the campaign, select the game, then build rewards and publish.', 'textarea', 30, true),
  ('admin_promotions', 'hero', 'manage_headline', 'Manage Mode Headline', 'Operate active and ended campaigns.', 'text', 40, true),
  ('admin_promotions', 'hero', 'manage_subheadline', 'Manage Mode Subheadline', 'Edit, end, copy links, print posters, and track redemption performance.', 'textarea', 50, true),
  ('admin_promotions', 'tabs', 'create_tab_label', 'Create Tab Label', 'Create Promotion', 'text', 60, true),
  ('admin_promotions', 'tabs', 'manage_tab_label', 'Manage Tab Label', 'Manage Promotions', 'text', 70, true),
  ('admin_promotions', 'steps', 'select_location_label', 'Promotion Select Location Label', 'Step 1: Select Restaurant Location', 'text', 80, true),
  ('admin_promotions', 'steps', 'name_promotion_label', 'Name Promotion Label', 'Step 2: Name Promotion', 'text', 90, true),
  ('admin_promotions', 'steps', 'select_game_label', 'Select Game Label', 'Step 3: Select Game Type', 'text', 100, true),
  ('admin_promotions', 'steps', 'create_button_label', 'Create Promotion Button Label', 'Create Promotion', 'text', 110, true),
  ('admin_promotions', 'empty_state', 'no_drafts_title', 'No Drafts Title', 'No drafts in progress', 'text', 120, true),
  ('admin_promotions', 'empty_state', 'no_drafts_copy', 'No Drafts Copy', 'Create a new draft above.', 'textarea', 130, true)
on conflict (page_key, section_key, field_key)
do update set
  label = excluded.label,
  value = excluded.value,
  field_type = excluded.field_type,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

-- Adds CMS-editable fields for the homepage explainer video and per-game demo URLs.
-- These replace the hardcoded YouTube URLs in app/page.tsx and app/LandingPageClient.tsx.

insert into public.site_content (page_key, section_key, field_key, label, value, field_type, sort_order, is_active)
values
  -- Explainer video (How SpinBite Works section)
  ('home', 'explainer_video', 'title',       'Explainer Video Title',       'See SpinBite in Action',                                   'text',     10, true),
  ('home', 'explainer_video', 'description', 'Explainer Video Description', 'Watch how restaurants turn menus into interactive games.',   'textarea', 20, true),
  ('home', 'explainer_video', 'youtube_url', 'Explainer Video YouTube URL', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',              'url',      30, true),

  -- Per-game demo video URLs (Available Games section)
  ('home', 'game_demos', 'spin_wheel_demo_url',      'Spin Wheel Demo YouTube URL',       'https://www.youtube.com/embed/dQw4w9WgXcQ', 'url', 10, true),
  ('home', 'game_demos', 'mystery_box_demo_url',     'Mystery Box Demo YouTube URL',      'https://www.youtube.com/embed/dQw4w9WgXcQ', 'url', 20, true),
  ('home', 'game_demos', 'scratch_card_demo_url',    'Scratch Card Demo YouTube URL',     'https://www.youtube.com/embed/dQw4w9WgXcQ', 'url', 30, true),
  ('home', 'game_demos', 'slot_machine_demo_url',    'Slot Machine Demo YouTube URL',     'https://www.youtube.com/embed/dQw4w9WgXcQ', 'url', 40, true),
  ('home', 'game_demos', 'pick_a_door_demo_url',     'Pick a Door Demo YouTube URL',      'https://www.youtube.com/embed/dQw4w9WgXcQ', 'url', 50, true),
  ('home', 'game_demos', 'fortune_cookie_demo_url',  'Fortune Cookie Demo YouTube URL',   'https://www.youtube.com/embed/dQw4w9WgXcQ', 'url', 60, true)
on conflict (page_key, section_key, field_key)
do update set
  label      = excluded.label,
  value      = excluded.value,
  field_type = excluded.field_type,
  sort_order = excluded.sort_order,
  is_active  = excluded.is_active;

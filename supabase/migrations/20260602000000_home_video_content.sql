-- Adds CMS-editable fields for the homepage explainer video and per-game demo URLs.
-- field_key matches the canonical game_type from lib/games/types.ts and the game registry,
-- so CMS rows can be looked up directly by game_type without any translation layer.

insert into public.site_content (page_key, section_key, field_key, label, value, field_type, sort_order, is_active)
values
  -- Explainer video (How SpinBite Works section)
  ('home', 'explainer_video', 'title',       'Explainer Video Title',       'See SpinBite in Action',                                   'text',     10, true),
  ('home', 'explainer_video', 'description', 'Explainer Video Description', 'Watch how restaurants turn menus into interactive games.',   'textarea', 20, true),
  ('home', 'explainer_video', 'youtube_url', 'Explainer Video YouTube URL', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',              'url',      30, true),

  -- Per-game demo video URLs (Available Games section).
  -- field_key = canonical game_type (see lib/games/registry.ts).
  ('home', 'game_demos', 'spin_wheel',    'Spin Wheel Demo YouTube URL',    'https://www.youtube.com/embed/dQw4w9WgXcQ', 'url', 10, true),
  ('home', 'game_demos', 'mystery_box',   'Mystery Box Demo YouTube URL',   'https://www.youtube.com/embed/dQw4w9WgXcQ', 'url', 20, true),
  ('home', 'game_demos', 'scratch_card',  'Scratch Card Demo YouTube URL',  'https://www.youtube.com/embed/dQw4w9WgXcQ', 'url', 30, true),
  ('home', 'game_demos', 'reward_reels',  'Reward Reels Demo YouTube URL',  'https://www.youtube.com/embed/dQw4w9WgXcQ', 'url', 40, true),
  ('home', 'game_demos', 'open_the_door', 'Open The Door Demo YouTube URL', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'url', 50, true)
on conflict (page_key, section_key, field_key)
do update set
  label      = excluded.label,
  value      = excluded.value,
  field_type = excluded.field_type,
  sort_order = excluded.sort_order,
  is_active  = excluded.is_active;

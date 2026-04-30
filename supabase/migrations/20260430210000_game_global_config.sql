alter table public.games
add column if not exists min_products int not null default 6,
add column if not exists max_products int not null default 10,
add column if not exists game_config jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'games_product_range_check'
  ) then
    alter table public.games
    add constraint games_product_range_check check (min_products > 0 and max_products >= min_products);
  end if;
end $$;

update public.games
set
  min_products = 6,
  max_products = 10,
  game_config = jsonb_build_object(
    'wheel', jsonb_build_object(
      'speed', 1.2,
      'spinRotations', 6,
      'slowdownSeconds', 3.5,
      'winEffect', 'confetti',
      'tryAgain', jsonb_build_object(
        'enabled', supports_try_again,
        'label', 'Try Again',
        'backgroundColor', '#111111',
        'textColor', '#ffffff'
      )
    )
  )
where slug = 'spin-wheel'
  and (game_config = '{}'::jsonb or game_config is null);

update public.games
set game_config = '{}'::jsonb
where slug <> 'spin-wheel'
  and (game_config is null);

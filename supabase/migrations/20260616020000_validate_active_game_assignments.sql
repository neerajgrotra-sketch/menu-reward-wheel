-- Server-side validation: enabled game assignments must reference an active game.
-- This ensures UI filtering cannot be bypassed by a direct API or Supabase client call.
-- Super Admin disabling a game in public.games immediately blocks new enabled assignments
-- for that game — existing disabled rows are preserved for audit history.

-- ─── Trigger function ─────────────────────────────────────────────────────────

create or replace function public.validate_active_game_assignment()
returns trigger
language plpgsql
as $$
declare
  normalized_type text;
  game_slug       text;
begin
  -- Disabled assignments bypass validation (preserved as audit history).
  if new.enabled = false then
    return new;
  end if;

  -- Normalize legacy 'wheel' alias.
  normalized_type := case when new.game_type = 'wheel' then 'spin_wheel' else new.game_type end;

  -- Map canonical game_type → games.slug for status lookup.
  -- games.id is UUID; no game_type column exists on games; slug is the stable text key.
  game_slug := case normalized_type
    when 'spin_wheel'    then 'spin-wheel'
    when 'mystery_box'   then 'mystery-box'
    when 'scratch_card'  then 'scratch-win'
    when 'reward_reels'  then 'lucky-slot'
    when 'open_the_door' then 'open-the-door'
    when 'pick_a_card'   then 'pick-a-card'
    else null
  end;

  -- Reject unknown game types or games not active in Super Admin.
  if game_slug is null or not exists (
    select 1
    from public.games
    where slug   = game_slug
      and status = 'active'
  ) then
    raise exception
      'Game "%" is not active. Only active games can be assigned to promotions. '
      'Check Super Admin → Game Configuration.',
      new.game_type;
  end if;

  return new;
end;
$$;

-- ─── Trigger ──────────────────────────────────────────────────────────────────

drop trigger if exists validate_game_assignment_on_write on public.promotion_game_assignments;

create trigger validate_game_assignment_on_write
  before insert or update
  on public.promotion_game_assignments
  for each row
  execute function public.validate_active_game_assignment();

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
begin
  -- Disabled assignments are allowed with any game_type (audit history).
  if new.enabled = false then
    return new;
  end if;

  -- Normalize legacy 'wheel' alias before checking the games table.
  normalized_type := case when new.game_type = 'wheel' then 'spin_wheel' else new.game_type end;

  -- Reject if the game is not found or is not active in Super Admin.
  if not exists (
    select 1
    from public.games
    where id = normalized_type
      and status = 'active'
  ) then
    raise exception
      'Game "%" is not active. Only active games can be assigned to promotions. '
      'Check Super Admin → Intelligence Lab → Game Configuration.',
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

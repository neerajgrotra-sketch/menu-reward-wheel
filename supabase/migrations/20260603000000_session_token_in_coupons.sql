-- Link coupon_redemptions to play_sessions via a proper foreign key.
--
-- Cardinality: play_sessions 1:N coupon_redemptions.
-- A promotion with max_spins > 1 issues one coupon per spin within the same
-- session, so play_session_id must NOT be unique on this table.
--
-- The column is nullable so existing rows (issued before this migration) are
-- unaffected and will simply have play_session_id = NULL.

alter table public.coupon_redemptions
add column if not exists play_session_id uuid
  references public.play_sessions(id)
  on delete set null;

-- Plain (non-unique) index for fast session-recovery lookups.
create index if not exists coupon_redemptions_play_session_id_idx
on public.coupon_redemptions(play_session_id)
where play_session_id is not null;

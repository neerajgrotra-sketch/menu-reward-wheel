-- Enable Realtime for visit_sessions + session_guests
--
-- The admin Dining Intelligence dashboard (SessionsDashboard.tsx) already
-- subscribes to postgres_changes on both tables, but the supabase_realtime
-- publication had zero tables registered — so live inserts/updates never
-- reached the client and the admin had to manually refresh to see new or
-- ended sessions.

ALTER PUBLICATION supabase_realtime ADD TABLE public.visit_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_guests;

-- ── Rollback reference ────────────────────────────────────────────────────────
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.session_guests;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.visit_sessions;

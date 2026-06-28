-- Session Guests V1
-- Creates: session_guests
-- Creates: update_stale_guest_presence(uuid) RPC
-- Creates: disconnect_session_guests(uuid) RPC
-- Creates: increment_guest_count(uuid) RPC
--
-- Replaces the integer guest_count heuristic on visit_sessions with
-- true per-device presence tracking. Each device that joins a dining
-- session gets one row. Heartbeats keep last_seen_at fresh; absence
-- drives automatic status transitions.
--
-- Design invariants:
--   1. One row per device per session join (re-join creates a new row)
--   2. guest_token is server-issued, globally unique, URL-safe
--   3. Only service role may INSERT — tokens are never client-generated
--   4. Restaurant owners can SELECT their own session guests
--   5. Transitions are one-way: active → inactive → disconnected, blocked terminal
--   6. disconnect_session_guests is called atomically on session end

-- ── session_guests ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_guests (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent session
  session_id          uuid          NOT NULL REFERENCES public.visit_sessions(id) ON DELETE CASCADE,
  restaurant_id       uuid          NOT NULL REFERENCES public.restaurants(id)    ON DELETE CASCADE,

  -- Server-issued device identity token (used for heartbeat auth)
  guest_token         text          NOT NULL,

  -- Future: captured via identity screen
  guest_name          text,

  -- Client-generated fingerprint from browser signals (screen, timezone, fonts)
  device_fingerprint  text          NOT NULL,

  -- Raw user agent for debugging and device analytics
  user_agent          text,

  -- Timestamps
  joined_at           timestamptz   NOT NULL DEFAULT now(),
  last_seen_at        timestamptz   NOT NULL DEFAULT now(),

  -- Presence lifecycle: active → inactive → disconnected | blocked (terminal)
  status              text          NOT NULL DEFAULT 'active',

  CONSTRAINT sg_status_check CHECK (
    status IN ('active', 'inactive', 'disconnected', 'blocked')
  ),

  -- guest_token must be non-trivially long (two UUID4s concatenated = 64 hex chars)
  CONSTRAINT sg_token_length CHECK (length(guest_token) >= 32)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Heartbeat lookup — must be O(1), unique enforced
CREATE UNIQUE INDEX session_guests_token_idx
  ON public.session_guests (guest_token);

-- Active guest count per session (primary read path for admin UI + counter)
CREATE INDEX session_guests_session_status_idx
  ON public.session_guests (session_id, status);

-- Stale sweep — ordered by last_seen_at DESC so newest are cheapest to skip
CREATE INDEX session_guests_session_last_seen_idx
  ON public.session_guests (session_id, last_seen_at DESC);

-- Restaurant-level analytics
CREATE INDEX session_guests_restaurant_joined_idx
  ON public.session_guests (restaurant_id, joined_at DESC);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.session_guests ENABLE ROW LEVEL SECURITY;

-- Restaurant owners can read guest records for their sessions
CREATE POLICY "session_guests_owner_read"
  ON public.session_guests
  FOR SELECT
  USING (
    restaurant_id IN (
      SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
    )
  );

-- No direct INSERT/UPDATE/DELETE from client — service role only.
-- (Policies intentionally omitted; service key bypasses RLS.)

-- ── RPC: increment_guest_count ────────────────────────────────────────────────
-- Atomically increments visit_sessions.guest_count for a single session.
-- Called by the join resolver when a genuinely new device joins an existing session.
-- SECURITY DEFINER so service-role API routes can always write.

CREATE OR REPLACE FUNCTION public.increment_guest_count(p_session_id uuid)
RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.visit_sessions
  SET
    guest_count      = guest_count + 1,
    last_activity_at = now(),
    updated_at       = now()
  WHERE id = p_session_id
    AND status = 'active';
END;
$$;

-- ── RPC: update_stale_guest_presence ─────────────────────────────────────────
-- Sweeps all guests for a session and advances stale statuses:
--   active   → inactive     if last_seen_at < 3 minutes ago
--   inactive → disconnected if last_seen_at < 10 minutes ago
-- Call this at the top of any route that reads live presence (e.g. guest counter).

CREATE OR REPLACE FUNCTION public.update_stale_guest_presence(p_session_id uuid)
RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  -- Promote inactive → disconnected first (10 min threshold)
  UPDATE public.session_guests
  SET status = 'disconnected'
  WHERE session_id = p_session_id
    AND status     = 'inactive'
    AND last_seen_at < now() - interval '10 minutes';

  -- Then demote active → inactive (3 min threshold)
  UPDATE public.session_guests
  SET status = 'inactive'
  WHERE session_id = p_session_id
    AND status     = 'active'
    AND last_seen_at < now() - interval '3 minutes';
END;
$$;

-- ── RPC: disconnect_session_guests ────────────────────────────────────────────
-- Immediately transitions all non-terminal guests to disconnected.
-- Called atomically when admin ends a session, ensuring no guest can
-- re-authenticate via an old token after the session is closed.

CREATE OR REPLACE FUNCTION public.disconnect_session_guests(p_session_id uuid)
RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.session_guests
  SET status = 'disconnected'
  WHERE session_id = p_session_id
    AND status NOT IN ('disconnected', 'blocked');
END;
$$;

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.session_guests IS
  'One row per device per session join. Tracks live presence via heartbeat. '
  'Replaces the heuristic guest_count counter with true per-device accounting.';

COMMENT ON COLUMN public.session_guests.guest_token IS
  'Server-issued opaque token (two UUID4s concatenated). Used as the sole '
  'heartbeat credential. Never client-generated. Invalidated on session end.';

COMMENT ON COLUMN public.session_guests.device_fingerprint IS
  'Client-side browser fingerprint. Used to detect same-device reconnects '
  'vs. genuinely new devices joining the session.';

COMMENT ON COLUMN public.session_guests.status IS
  'Presence lifecycle: active (heartbeating) → inactive (3 min silence) '
  '→ disconnected (10 min silence or session ended). blocked is terminal.';

-- ── Rollback reference ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.disconnect_session_guests(uuid);
-- DROP FUNCTION IF EXISTS public.update_stale_guest_presence(uuid);
-- DROP FUNCTION IF EXISTS public.increment_guest_count(uuid);
-- DROP INDEX IF EXISTS public.session_guests_restaurant_joined_idx;
-- DROP INDEX IF EXISTS public.session_guests_session_last_seen_idx;
-- DROP INDEX IF EXISTS public.session_guests_session_status_idx;
-- DROP INDEX IF EXISTS public.session_guests_token_idx;
-- DROP TABLE IF EXISTS public.session_guests;

-- Session Intelligence Foundation V1
-- Creates: visit_sessions
-- Modifies: orders (adds visit_session_id)
-- Creates: increment_session_counters() RPC
-- Creates: mark_stale_sessions_abandoned() RPC
--
-- This is the first layer of SpinBite restaurant visit intelligence.
-- Sessions begin automatically on QR scan. Orders attach to sessions.
-- Analytics are denormalized counters on the session row (no visit_events table).
-- Forward compatible: assigned_ai_agent, last_promotion_played reserved for AI layer.

-- ── visit_sessions ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.visit_sessions (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id           uuid          NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  touchpoint_id           uuid          NOT NULL REFERENCES public.restaurant_touchpoints(id) ON DELETE RESTRICT,

  -- Status lifecycle: active → completed (manual) | abandoned (stale cleanup)
  status                  text          NOT NULL DEFAULT 'active',

  started_at              timestamptz   NOT NULL DEFAULT now(),
  ended_at                timestamptz,
  ended_by                uuid,                    -- auth.uid() of owner who ended session

  -- Last interaction timestamp used for stale-session detection
  last_activity_at        timestamptz   NOT NULL DEFAULT now(),

  -- ── Lightweight analytics (denormalized — no visit_events table) ────────────
  guest_count             integer       NOT NULL DEFAULT 1,
  menu_items_viewed       integer       NOT NULL DEFAULT 0,
  orders_count            integer       NOT NULL DEFAULT 0,
  promotion_interactions  integer       NOT NULL DEFAULT 0,
  coupons_issued          integer       NOT NULL DEFAULT 0,
  total_spend             numeric(10,2) NOT NULL DEFAULT 0,

  -- ── AI / Promotion forward compat ────────────────────────────────────────────
  assigned_ai_agent       text,                    -- reserved; null in v1
  last_promotion_played   uuid          REFERENCES public.promotions(id) ON DELETE SET NULL,

  -- ── Session access + interaction timeline ─────────────────────────────────
  -- 6-digit numeric code generated on session creation; surfaced for staff reference
  session_access_code     text          NOT NULL,

  -- Lightweight JSONB event log for investor demo timeline
  -- Appended client-side and via API; no separate visit_events table
  session_interaction_log jsonb         NOT NULL DEFAULT '[]'::jsonb,

  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),

  -- Status must be a known value
  CONSTRAINT vs_status_check CHECK (status IN ('active', 'completed', 'abandoned')),

  -- ended_at must be set when session is no longer active
  CONSTRAINT vs_ended_consistency CHECK (
    (status = 'active'                     AND ended_at IS NULL) OR
    (status IN ('completed', 'abandoned')  AND ended_at IS NOT NULL)
  ),

  -- Analytics counters cannot go negative
  CONSTRAINT vs_guest_count_pos      CHECK (guest_count >= 1),
  CONSTRAINT vs_items_viewed_nn      CHECK (menu_items_viewed >= 0),
  CONSTRAINT vs_orders_count_nn      CHECK (orders_count >= 0),
  CONSTRAINT vs_promo_interactions_nn CHECK (promotion_interactions >= 0),
  CONSTRAINT vs_coupons_issued_nn    CHECK (coupons_issued >= 0),
  CONSTRAINT vs_total_spend_nn       CHECK (total_spend >= 0),

  -- access code format: 6 numeric digits
  CONSTRAINT vs_access_code_format   CHECK (session_access_code ~ '^\d{6}$')
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Core invariant: exactly one active session per touchpoint
-- Partial unique index — allows multiple completed/abandoned rows per touchpoint
CREATE UNIQUE INDEX visit_sessions_one_active_per_touchpoint_idx
  ON public.visit_sessions (touchpoint_id)
  WHERE status = 'active';

-- Admin dashboard primary query: sessions for a restaurant by status + recency
CREATE INDEX visit_sessions_restaurant_status_started_idx
  ON public.visit_sessions (restaurant_id, status, started_at DESC);

-- Stale session detection: find old active sessions by last activity
CREATE INDEX visit_sessions_stale_detection_idx
  ON public.visit_sessions (restaurant_id, last_activity_at)
  WHERE status = 'active';

-- Order linkage lookup (called on every order status query)
CREATE INDEX visit_sessions_id_status_idx
  ON public.visit_sessions (id, status);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.visit_sessions ENABLE ROW LEVEL SECURITY;

-- Owners can read their own restaurant sessions (admin dashboard)
CREATE POLICY "visit_sessions_owner_select"
  ON public.visit_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

-- Owners can update sessions (end session, update guest_count) via admin API
CREATE POLICY "visit_sessions_owner_update"
  ON public.visit_sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

-- No public INSERT or DELETE — all writes go through service-role API routes

-- ── RPC: increment_session_counters ─────────────────────────────────────────
-- Atomic counter update — same architecture as next_order_number().
-- SECURITY DEFINER bypasses RLS so service-role callers (API routes) can
-- always write even when the anon client would be blocked.
-- Only updates sessions with status = 'active' to prevent stale writes.

CREATE OR REPLACE FUNCTION public.increment_session_counters(
  p_session_id              uuid,
  p_menu_items_viewed_delta integer  DEFAULT 0,
  p_orders_delta            integer  DEFAULT 0,
  p_promotion_delta         integer  DEFAULT 0,
  p_coupons_delta           integer  DEFAULT 0,
  p_spend_delta             numeric  DEFAULT 0
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.visit_sessions
  SET
    menu_items_viewed      = menu_items_viewed      + p_menu_items_viewed_delta,
    orders_count           = orders_count           + p_orders_delta,
    promotion_interactions = promotion_interactions  + p_promotion_delta,
    coupons_issued         = coupons_issued         + p_coupons_delta,
    total_spend            = total_spend            + p_spend_delta,
    last_activity_at       = now(),
    updated_at             = now()
  WHERE id = p_session_id
    AND status = 'active';
END;
$$;

-- ── RPC: append_session_interaction ─────────────────────────────────────────
-- Appends one event object to session_interaction_log without replacing the array.
-- Keeps the log bounded to 200 entries by trimming oldest events when over limit.

CREATE OR REPLACE FUNCTION public.append_session_interaction(
  p_session_id uuid,
  p_event      jsonb
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_log jsonb;
BEGIN
  SELECT session_interaction_log INTO v_log
  FROM public.visit_sessions
  WHERE id = p_session_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Append the new event
  v_log := v_log || jsonb_build_array(p_event);

  -- Trim to last 200 entries if over limit
  IF jsonb_array_length(v_log) > 200 THEN
    v_log := (
      SELECT jsonb_agg(elem)
      FROM (
        SELECT elem
        FROM jsonb_array_elements(v_log) WITH ORDINALITY AS t(elem, ordinality)
        ORDER BY ordinality DESC
        LIMIT 200
      ) sub
    );
  END IF;

  UPDATE public.visit_sessions
  SET
    session_interaction_log = v_log,
    last_activity_at        = now(),
    updated_at              = now()
  WHERE id = p_session_id
    AND status = 'active';
END;
$$;

-- ── RPC: mark_stale_sessions_abandoned ──────────────────────────────────────
-- Called at the top of the admin sessions GET handler (lazy evaluation).
-- Marks active sessions with no activity for p_timeout_hours as abandoned.
-- Returns the count of sessions marked.

CREATE OR REPLACE FUNCTION public.mark_stale_sessions_abandoned(
  p_restaurant_id uuid,
  p_timeout_hours integer DEFAULT 2
) RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_affected integer;
BEGIN
  WITH updated AS (
    UPDATE public.visit_sessions
    SET
      status   = 'abandoned',
      ended_at = now(),
      ended_by = NULL,
      updated_at = now()
    WHERE restaurant_id = p_restaurant_id
      AND status = 'active'
      AND last_activity_at < now() - make_interval(hours => p_timeout_hours)
    RETURNING id
  )
  SELECT count(*) INTO v_affected FROM updated;

  RETURN v_affected;
END;
$$;

-- ── orders: add visit_session_id ─────────────────────────────────────────────
-- Nullable FK — existing direct-link orders remain unaffected (null = no session)
-- Backward compatible: existing orders.session_id (text) left untouched

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS visit_session_id uuid REFERENCES public.visit_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_visit_session_idx
  ON public.orders (visit_session_id)
  WHERE visit_session_id IS NOT NULL;

-- ── Capability seed: session_management ──────────────────────────────────────
-- Follows identical pattern as 'ordering' and 'table_management' capabilities.
-- Disabled by default; enabled per restaurant via admin settings.

INSERT INTO public.restaurant_capabilities (restaurant_id, capability_name, enabled)
SELECT id, 'session_management', false
FROM public.restaurants
ON CONFLICT (restaurant_id, capability_name) DO NOTHING;

-- ── Rollback reference ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.mark_stale_sessions_abandoned(uuid, integer);
-- DROP FUNCTION IF EXISTS public.append_session_interaction(uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.increment_session_counters(uuid, integer, integer, integer, integer, numeric);
-- DROP INDEX IF EXISTS public.orders_visit_session_idx;
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS visit_session_id;
-- DROP INDEX IF EXISTS public.visit_sessions_id_status_idx;
-- DROP INDEX IF EXISTS public.visit_sessions_stale_detection_idx;
-- DROP INDEX IF EXISTS public.visit_sessions_restaurant_status_started_idx;
-- DROP INDEX IF EXISTS public.visit_sessions_one_active_per_touchpoint_idx;
-- DROP TABLE IF EXISTS public.visit_sessions;
-- DELETE FROM public.restaurant_capabilities WHERE capability_name = 'session_management';

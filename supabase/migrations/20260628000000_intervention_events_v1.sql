-- Intervention Events V1
-- Creates: intervention_events
--
-- Records every action the Decision Engine considers taking or takes.
-- Append-only — no UPDATE policy.
-- Tracks the full intervention lifecycle: triggered → shown → accepted/dismissed → converted.
--
-- Design invariants:
--   1. One row per intervention decision (not per outcome update)
--   2. accepted/dismissed/converted are nullable — null means not yet determined
--   3. confidence_score is the detector's confidence at fire time (0.000–1.000)
--   4. Only service role may insert — no direct client writes
--   5. Restaurant owners can SELECT rows belonging to their sessions

-- ── intervention_events ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.intervention_events (
  id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core session link
  session_id          uuid            NOT NULL REFERENCES public.visit_sessions(id) ON DELETE CASCADE,
  restaurant_id       uuid            NOT NULL REFERENCES public.restaurants(id)    ON DELETE CASCADE,

  -- What triggered this intervention
  trigger_type        text            NOT NULL,

  -- Confidence the opportunity was real (0.000–1.000)
  confidence_score    numeric(4,3)    NOT NULL DEFAULT 0,

  -- What action was dispatched
  action_taken        text            NOT NULL,

  -- Lifecycle timestamps / flags
  shown_at            timestamptz     NOT NULL DEFAULT now(),

  -- Nullable: null = outcome not yet known
  accepted            boolean,
  dismissed           boolean,
  converted           boolean,
  conversion_value    numeric(10,2),

  created_at          timestamptz     NOT NULL DEFAULT now(),

  -- Hard enum on trigger_type — must match OpportunityType in the engine
  CONSTRAINT ie_trigger_type_check CHECK (
    trigger_type IN (
      'cart_abandonment',
      'high_interest_no_purchase',
      'long_decision_without_cart',
      'post_order_rebrowse',
      'dessert_interest_after_main_order',
      'multi_guest_partial_order'
    )
  ),

  -- Hard enum on action_taken — must match ActionType in the engine
  CONSTRAINT ie_action_taken_check CHECK (
    action_taken IN (
      'coupon_offer',
      'promotion_popup',
      'ai_recommendation',
      'spin_wheel_trigger',
      'waiter_notification',
      'combo_offer'
    )
  ),

  -- Confidence must be a valid probability
  CONSTRAINT ie_confidence_range CHECK (confidence_score BETWEEN 0 AND 1),

  -- Conversion value only meaningful if converted
  CONSTRAINT ie_conversion_value_guard CHECK (
    conversion_value IS NULL OR converted = true
  ),

  -- accepted and dismissed are mutually exclusive — can't be both
  CONSTRAINT ie_outcome_exclusive CHECK (
    NOT (accepted = true AND dismissed = true)
  )
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Per-session intervention history (primary access pattern)
CREATE INDEX intervention_events_session_idx
  ON public.intervention_events (session_id, shown_at DESC);

-- Restaurant-level analytics — query all interventions for a restaurant
CREATE INDEX intervention_events_restaurant_idx
  ON public.intervention_events (restaurant_id, shown_at DESC);

-- Conversion analytics — find all converted interventions by action type
CREATE INDEX intervention_events_action_outcome_idx
  ON public.intervention_events (action_taken, converted, shown_at DESC)
  WHERE converted = true;

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.intervention_events ENABLE ROW LEVEL SECURITY;

-- Restaurant owners can read their own intervention records
CREATE POLICY "intervention_events_owner_read"
  ON public.intervention_events
  FOR SELECT
  USING (
    restaurant_id IN (
      SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
    )
  );

-- No direct INSERT from client — service role only
-- (policy intentionally omitted; service key bypasses RLS)

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.intervention_events IS
  'Append-only log of every action the Decision Engine fires. Tracks full intervention lifecycle: trigger → shown → accepted/dismissed → converted.';

COMMENT ON COLUMN public.intervention_events.trigger_type IS
  'The OpportunityType that caused this intervention (enum-validated).';

COMMENT ON COLUMN public.intervention_events.confidence_score IS
  'Detector confidence at fire time (0.000–1.000). Higher = stronger behavioral signal.';

COMMENT ON COLUMN public.intervention_events.action_taken IS
  'The ActionType dispatched (enum-validated). Matches ActionType in the engine.';

COMMENT ON COLUMN public.intervention_events.accepted IS
  'NULL = not yet interacted. TRUE = customer accepted. FALSE = customer ignored.';

COMMENT ON COLUMN public.intervention_events.converted IS
  'TRUE only if an order/action was completed that can be attributed to this intervention.';

COMMENT ON COLUMN public.intervention_events.conversion_value IS
  'Revenue attributable to this intervention. NULL if not converted.';

-- Live Interventions V1
-- Creates: live_interventions
--
-- The Decision Runtime's primary output table.
-- Stores every intervention dispatched to the waiter dashboard.
-- Updated by restaurant staff when they acknowledge or dismiss a recommendation.
--
-- Design invariants:
--   1. One row per dispatched intervention decision
--   2. Only service role may INSERT (runtime writes via service key)
--   3. Restaurant owners may SELECT and UPDATE their own rows (acknowledge / dismiss)
--   4. intervention_events is the immutable audit log; live_interventions is the actionable feed
--   5. Status lifecycle: pending → acknowledged | dismissed | converted | expired

CREATE TABLE IF NOT EXISTS public.live_interventions (
  id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session + restaurant linkage
  session_id          uuid            NOT NULL REFERENCES public.visit_sessions(id) ON DELETE CASCADE,
  guest_id            uuid            REFERENCES public.session_guests(id) ON DELETE SET NULL,
  restaurant_id       uuid            NOT NULL REFERENCES public.restaurants(id)    ON DELETE CASCADE,

  -- What triggered this intervention
  opportunity_type    text            NOT NULL,
  action_type         text            NOT NULL DEFAULT 'waiter_notification',

  -- Confidence at time of dispatch (0.000–1.000)
  confidence_score    numeric(4,3)    NOT NULL,

  -- Human-readable explanation shown to staff
  reasoning_summary   text            NOT NULL,

  -- Lifecycle
  status              text            NOT NULL DEFAULT 'pending',
  created_at          timestamptz     NOT NULL DEFAULT now(),
  acknowledged_at     timestamptz,
  converted           boolean         NOT NULL DEFAULT false,

  -- Hard enum: mirrors OpportunityType in engine/decision-engine/types.ts
  CONSTRAINT li_opportunity_check CHECK (
    opportunity_type IN (
      'cart_abandonment',
      'high_interest_no_purchase',
      'long_decision_without_cart',
      'post_order_rebrowse',
      'dessert_interest_after_main_order',
      'multi_guest_partial_order'
    )
  ),

  -- Hard enum: mirrors ActionType in engine/decision-engine/types.ts
  CONSTRAINT li_action_check CHECK (
    action_type IN (
      'coupon_offer',
      'promotion_popup',
      'ai_recommendation',
      'spin_wheel_trigger',
      'waiter_notification',
      'combo_offer'
    )
  ),

  CONSTRAINT li_status_check CHECK (
    status IN ('pending', 'acknowledged', 'dismissed', 'expired', 'converted')
  ),

  CONSTRAINT li_confidence_range CHECK (confidence_score BETWEEN 0 AND 1),

  -- acknowledged_at must align with a non-pending status
  CONSTRAINT li_ack_consistency CHECK (
    acknowledged_at IS NULL OR status IN ('acknowledged', 'dismissed', 'converted')
  )
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary access: all interventions for a session (admin card expand)
CREATE INDEX IF NOT EXISTS li_session_idx
  ON public.live_interventions (session_id, created_at DESC);

-- Pending feed: interventions awaiting acknowledgement for a restaurant
CREATE INDEX IF NOT EXISTS li_restaurant_pending_idx
  ON public.live_interventions (restaurant_id, created_at DESC)
  WHERE status = 'pending';

-- Deduplication: prevent duplicate pending interventions per opportunity type
CREATE UNIQUE INDEX IF NOT EXISTS li_session_opportunity_pending_uniq
  ON public.live_interventions (session_id, opportunity_type)
  WHERE status = 'pending';

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.live_interventions ENABLE ROW LEVEL SECURITY;

-- Restaurant owners can read their own intervention records
CREATE POLICY "live_interventions_owner_read"
  ON public.live_interventions
  FOR SELECT
  USING (
    restaurant_id IN (
      SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
    )
  );

-- Restaurant owners can acknowledge or dismiss their own interventions
CREATE POLICY "live_interventions_owner_update"
  ON public.live_interventions
  FOR UPDATE
  USING (
    restaurant_id IN (
      SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
    )
  );

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.live_interventions IS
  'Actionable intervention feed for restaurant staff. Decision Runtime writes here when it detects a dining opportunity. Staff acknowledge or dismiss recommendations.';

COMMENT ON COLUMN public.live_interventions.reasoning_summary IS
  'Human-readable explanation of why this intervention was triggered. Shown to staff on the admin dashboard.';

COMMENT ON COLUMN public.live_interventions.status IS
  'Lifecycle: pending (awaiting staff) → acknowledged | dismissed | converted | expired.';

COMMENT ON COLUMN public.live_interventions.opportunity_type IS
  'The behavioral signal that triggered this intervention. Enum-validated against OpportunityType.';

-- ── Rollback reference ────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.live_interventions;

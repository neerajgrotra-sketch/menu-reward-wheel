-- Session Events V1 — Relational Behavioral Intelligence Log
-- Creates: session_events
--
-- Replaces the bounded JSONB session_interaction_log for all behavioral tracking.
-- The JSONB log (session_interaction_log) is retained for backward compatibility
-- but all new instrumentation writes here.
--
-- Design goals:
--   1. Every customer interaction is a queryable, typed, FK-linked row
--   2. AI can answer: "which items had high view time but no purchase?"
--   3. Append-only — no UPDATE policy ever
--   4. restaurant_id denormalized for O(1) RLS and analytics query performance
--   5. guest_id identifies a device within a multi-guest session (ephemeral, not identity)

-- ── session_events ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_events (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core references
  session_id      uuid          NOT NULL REFERENCES public.visit_sessions(id) ON DELETE CASCADE,
  restaurant_id   uuid          NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,

  -- guest_id: client-generated ephemeral UUID per browser tab, scoped to session.
  -- Null for server-side events (ORDER_PLACED, SESSION_ENDED).
  -- Enables per-device behavioral analysis within a shared-table session.
  guest_id        uuid,

  -- Typed event classifier. Hard enum enforced by CHECK constraint.
  event_type      text          NOT NULL,

  -- Optional FK references for item and promotion events.
  -- SET NULL on delete preserves behavioral history even if item/promotion is removed.
  menu_item_id    uuid          REFERENCES public.menu_items(id) ON DELETE SET NULL,
  promotion_id    uuid          REFERENCES public.promotions(id) ON DELETE SET NULL,

  -- Flexible payload. Schema per event_type documented below.
  -- MENU_OPENED:          {}
  -- CATEGORY_OPENED:      { category_id, category_name }
  -- ITEM_VIEWED:          { item_name }
  -- ITEM_VIEW_DURATION:   { item_name, duration_ms }
  -- ITEM_ADDED_TO_CART:   { item_name, quantity, price }
  -- ITEM_REMOVED_FROM_CART: { item_name, reason? }
  -- ORDER_PLACED:         { order_id, order_number, item_count, subtotal }
  -- PROMOTION_VIEWED:     { promotion_name }
  -- PROMOTION_PLAYED:     { promotion_name, result, reward_type? }
  -- SESSION_ENDED:        { reason: 'manual'|'stale'|'admin', duration_seconds }
  metadata        jsonb         NOT NULL DEFAULT '{}',

  created_at      timestamptz   NOT NULL DEFAULT now(),

  -- Hard constraint: only known event types are accepted.
  -- Adding a new type requires a migration — prevents silent schema drift.
  CONSTRAINT se_event_type_check CHECK (
    event_type IN (
      'MENU_OPENED',
      'CATEGORY_OPENED',
      'ITEM_VIEWED',
      'ITEM_VIEW_DURATION',
      'ITEM_ADDED_TO_CART',
      'ITEM_REMOVED_FROM_CART',
      'ORDER_PLACED',
      'PROMOTION_VIEWED',
      'PROMOTION_PLAYED',
      'SESSION_ENDED'
    )
  )
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary: per-session timeline reconstruction (session details view + AI context)
CREATE INDEX session_events_session_timeline_idx
  ON public.session_events (session_id, created_at ASC);

-- Analytics: per-restaurant event queries — most common admin and AI query pattern.
-- "How many ITEM_VIEWED events for restaurant X in the last 7 days?"
CREATE INDEX session_events_restaurant_event_time_idx
  ON public.session_events (restaurant_id, event_type, created_at DESC);

-- Conversion funnel: item-level view → cart → order analysis.
-- "Which items had >30s view time but no ORDER_PLACED in same session?"
CREATE INDEX session_events_item_funnel_idx
  ON public.session_events (menu_item_id, event_type)
  WHERE menu_item_id IS NOT NULL;

-- Promotion effectiveness: did promotion views lead to orders?
CREATE INDEX session_events_promotion_idx
  ON public.session_events (promotion_id, event_type)
  WHERE promotion_id IS NOT NULL;

-- Per-session funnel: build complete event timeline for a session in one pass
CREATE INDEX session_events_session_event_idx
  ON public.session_events (session_id, event_type);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;

-- Restaurant owners can read their own session events (admin dashboard + AI queries).
-- restaurant_id denormalization makes this O(1) — no subquery join required.
CREATE POLICY "session_events_owner_select"
  ON public.session_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

-- No public INSERT, UPDATE, or DELETE policies.
-- All writes go through service-role API routes only (Rule 22).

-- ── Rollback reference ────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.session_events_session_event_idx;
-- DROP INDEX IF EXISTS public.session_events_promotion_idx;
-- DROP INDEX IF EXISTS public.session_events_item_funnel_idx;
-- DROP INDEX IF EXISTS public.session_events_restaurant_event_time_idx;
-- DROP INDEX IF EXISTS public.session_events_session_timeline_idx;
-- DROP TABLE IF EXISTS public.session_events;

// ── Decision Runtime V1 ────────────────────────────────────────────────────────
//
// Autonomous decision execution engine.
// Called from the session event tracking flow after high-value behavioral events.
//
// V1 activates two opportunity types only:
//   - high_interest_no_purchase
//   - dessert_interest_after_main_order
//
// V1 activates one dispatcher only:
//   - waiter_notification → writes to live_interventions + intervention_events
//
// All other dispatchers (coupon, promotion_popup, ai_recommendation, spin_wheel,
// combo_offer) remain stubs in dispatcher.ts. Do NOT activate them here.
//
// Cooldown: one evaluation max per session every 20 seconds (module-level map).
// Deduplication: skips if a pending intervention already exists for the same
// session + opportunity type (enforced via unique index + pre-check).

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSessionState, detectOpportunities, resolveInterventions } from '../decision-engine';
import type { Intervention } from '../decision-engine/types';
import type { RawSessionEvent } from '@/lib/session-intelligence';

// ── Cooldown registry ──────────────────────────────────────────────────────────
// One execution max per session every 20 seconds.
// Per Lambda instance — cold starts reset the map, which is safe
// (means slightly higher frequency on first invocation, not lower).

const COOLDOWN_MS = 20_000;
const cooldownMap = new Map<string, number>();

function isOnCooldown(sessionId: string): boolean {
  const last = cooldownMap.get(sessionId);
  return last !== undefined && (Date.now() - last) < COOLDOWN_MS;
}

function stampCooldown(sessionId: string): void {
  cooldownMap.set(sessionId, Date.now());
}

// ── Feature flags ──────────────────────────────────────────────────────────────
// V1: only these two opportunity types are active.
// Other detectors run but their results are filtered before dispatch.
// Do NOT remove detectors from opportunity-detector.ts — they are dormant, not deleted.

const ENABLED_OPPORTUNITIES = new Set([
  'high_interest_no_purchase',
  'dessert_interest_after_main_order',
]);

// ── Service client ─────────────────────────────────────────────────────────────

function makeServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '';
  if (!url || !key) throw new Error('[decision-runtime] Supabase service credentials missing.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Reasoning summary ──────────────────────────────────────────────────────────
// Human-readable explanation shown to restaurant staff in the admin dashboard.

function buildReasoning(intervention: Intervention): string {
  const p = intervention.payload;
  const pct = Math.round(intervention.confidence * 100);
  switch (intervention.opportunity) {
    case 'high_interest_no_purchase': {
      const item = String(p.focus_item ?? p.top_item_name ?? 'an item');
      const allItems = Array.isArray(p.all_high_interest)
        ? (p.all_high_interest as Array<{ name: string }>).map((i) => i.name).join(', ')
        : null;
      return allItems && allItems !== item
        ? `Guest showed strong interest in "${item}" (also: ${allItems}). ${pct}% confidence — consider a recommendation or pairing.`
        : `Guest showed strong interest in "${item}" (${pct}% confidence). Consider a recommendation.`;
    }
    case 'dessert_interest_after_main_order': {
      const dessert = String(p.top_dessert ?? 'a dessert');
      const orderValue = p.main_order_value != null ? `$${Number(p.main_order_value).toFixed(2)} main order` : 'main order';
      return `Guest browsing desserts after placing ${orderValue} (${pct}% confidence). Ideal moment to suggest ${dessert}.`;
    }
    default:
      return `${intervention.opportunity} detected with ${pct}% confidence.`;
  }
}

// ── Waiter notification dispatcher ────────────────────────────────────────────
// The only active dispatcher in V1.
// Writes to live_interventions (admin feed) + intervention_events (audit log).
// Broadcasts to Supabase Realtime for instant admin UI refresh.

async function dispatchWaiterNotification(
  intervention: Intervention,
  sessionId: string,
  restaurantId: string,
  guestId: string | null,
  supabase: SupabaseClient,
): Promise<void> {
  const reasoning = buildReasoning(intervention);

  // 1. Write to live_interventions — the admin live feed reads from this table
  const { data: row, error: insertErr } = await supabase
    .from('live_interventions')
    .insert({
      session_id: sessionId,
      guest_id: guestId,
      restaurant_id: restaurantId,
      opportunity_type: intervention.opportunity,
      action_type: 'waiter_notification',
      confidence_score: Number(intervention.confidence.toFixed(3)),
      reasoning_summary: reasoning,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertErr) {
    // Unique constraint violation = already a pending intervention for this opp type
    if (insertErr.code === '23505') return;
    console.error('[decision-runtime] live_interventions insert error:', insertErr.message);
    return;
  }

  // 2. Append-only audit log
  await supabase
    .from('intervention_events')
    .insert({
      session_id: sessionId,
      restaurant_id: restaurantId,
      trigger_type: intervention.opportunity,
      action_taken: 'waiter_notification',
      confidence_score: Number(intervention.confidence.toFixed(3)),
    })
    .then(({ error }) => {
      if (error) console.error('[decision-runtime] intervention_events insert error:', error.message);
    });

  // 3. Realtime broadcast — triggers live admin UI refresh without polling
  await supabase
    .channel(`restaurant-decisions:${restaurantId}`)
    .send({
      type: 'broadcast',
      event: 'intervention_created',
      payload: {
        intervention_id: row.id,
        session_id: sessionId,
        guest_id: guestId,
        opportunity_type: intervention.opportunity,
        confidence_score: intervention.confidence,
        reasoning_summary: reasoning,
        status: 'pending',
        created_at: new Date().toISOString(),
      },
    })
    .catch(() => { /* non-fatal — admin sees via poll */ });

  console.log('[decision-runtime] waiter_notification dispatched', {
    sessionId,
    restaurantId,
    opportunity: intervention.opportunity,
    confidence: Number(intervention.confidence.toFixed(3)),
    interventionId: row.id,
  });
}

// ── Main entry point ───────────────────────────────────────────────────────────
//
// Called fire-and-forget from the event tracking flow.
// Must NEVER throw — all errors are caught and logged internally.
// Returns void — callers do not await the result.

export async function evaluateSession(
  sessionId: string,
  triggeringGuestId: string | null = null,
): Promise<void> {
  if (isOnCooldown(sessionId)) return;

  // Stamp before async work — prevents concurrent triggers in the same 20s window
  stampCooldown(sessionId);

  try {
    const supabase = makeServiceClient();

    // 1. Load session — must be active, otherwise no action needed
    const { data: session } = await supabase
      .from('visit_sessions')
      .select('id, restaurant_id, status, started_at, touchpoint_id, guest_count')
      .eq('id', sessionId)
      .eq('status', 'active')
      .maybeSingle();

    if (!session) return;

    // 2. Load behavioral events — full session history
    const { data: events } = await supabase
      .from('session_events')
      .select('id,session_id,guest_id,event_type,menu_item_id,promotion_id,metadata,created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (!events || events.length === 0) return;

    // 3. Build live session state (pure — no DB calls)
    const state = buildSessionState(events as RawSessionEvent[], {
      id: session.id,
      restaurant_id: session.restaurant_id,
      touchpoint_id: session.touchpoint_id ?? null,
      started_at: session.started_at,
      status: session.status,
      guest_count: session.guest_count ?? 1,
    });

    // 4. Detect all opportunities, filter to V1-enabled types only
    const opportunities = detectOpportunities(state).filter((o) =>
      ENABLED_OPPORTUNITIES.has(o.type),
    );

    if (opportunities.length === 0) return;

    // 5. Resolve all candidate interventions for enabled opportunities,
    //    then filter to waiter_notification (the only active dispatcher in V1)
    const candidates = resolveInterventions(opportunities)
      .filter((i) => i.action === 'waiter_notification' && i.confidence >= 0.55)
      .sort((a, b) => b.confidence - a.confidence);

    if (candidates.length === 0) return;

    const best = candidates[0];

    // 6. Deduplication — check for an existing pending intervention of the same type
    //    (belt-and-suspenders alongside the unique index on live_interventions)
    const { data: existing } = await supabase
      .from('live_interventions')
      .select('id')
      .eq('session_id', sessionId)
      .eq('opportunity_type', best.opportunity)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) return;

    // 7. Dispatch
    await dispatchWaiterNotification(
      best,
      sessionId,
      session.restaurant_id,
      triggeringGuestId,
      supabase,
    );
  } catch (err: unknown) {
    // Runtime must never crash the caller
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[decision-runtime] evaluateSession uncaught error:', msg);
  }
}

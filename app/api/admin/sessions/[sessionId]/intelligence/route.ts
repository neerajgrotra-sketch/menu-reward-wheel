import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import {
  reconstructSession,
  analyzeSessionBehavior,
  analyzeGuestBehavior,
  aggregateSessionIntelligence,
} from '@/lib/session-intelligence';
import type {
  RawSessionEvent,
  RawOrder,
  EnrichedGuestProfile,
  GuestIdentitySummary,
} from '@/lib/session-intelligence';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase service client is not configured.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input as RequestInfo, { ...(init as RequestInit), cache: 'no-store' }),
    },
  });
}

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const authClient = createServerAuthClient();
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { sessionId } = params;
    if (!sessionId || !/^[0-9a-f-]{36}$/.test(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID.' }, { status: 400 });
    }

    const supabase = makeServiceClient();

    // Fetch session with touchpoint join — works for any status (active/completed/abandoned)
    const { data: session, error: sessionError } = await supabase
      .from('visit_sessions')
      .select(
        'id,status,started_at,ended_at,session_access_code,total_spend,restaurant_id,restaurant_touchpoints(id,name,type,section_name,touchpoint_code)',
      )
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }

    // Ownership check — verify this restaurant belongs to the authenticated user
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id')
      .eq('id', session.restaurant_id)
      .eq('owner_id', userData.user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!restaurant) {
      return NextResponse.json({ error: 'Not authorised to view this session.' }, { status: 403 });
    }

    // Fetch all behavioral events for this session, chronological
    const { data: events, error: eventsError } = await supabase
      .from('session_events')
      .select('id,session_id,guest_id,event_type,menu_item_id,promotion_id,metadata,created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 500 });
    }

    // Fetch all orders placed during this session with their line items + guest attribution
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(
        'id,guest_id,order_number,status,subtotal,created_at,order_items(id,menu_item_id,name_snapshot,quantity,price_snapshot,effective_price_snapshot,line_total,special_instructions)',
      )
      .eq('visit_session_id', sessionId)
      .order('created_at', { ascending: true });

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    // Fetch all session_guests for identity enrichment (guest_name + connected guest count)
    const { data: sessionGuests } = await supabase
      .from('session_guests')
      .select('id, guest_name')
      .eq('session_id', sessionId);

    // Supabase returns joined relations as arrays; normalise touchpoint to single object or null
    const tp = Array.isArray(session.restaurant_touchpoints)
      ? (session.restaurant_touchpoints[0] ?? null)
      : session.restaurant_touchpoints;

    const normalisedSession = { ...session, restaurant_touchpoints: tp };

    const rawEvents = (events ?? []) as RawSessionEvent[];

    const intelligence = reconstructSession(
      rawEvents,
      (orders ?? []) as unknown as RawOrder[],
      normalisedSession as unknown as Parameters<typeof reconstructSession>[2],
    );

    const behavior = analyzeSessionBehavior(intelligence, rawEvents);

    // V3: per-guest behavioral profiles
    const guestIds = Array.from(
      new Set(rawEvents.map((e) => e.guest_id).filter((g): g is string => g !== null)),
    );
    const behaviorProfiles = guestIds.map((guestId) => analyzeGuestBehavior(rawEvents, guestId));
    const tableSummary = aggregateSessionIntelligence(behaviorProfiles, intelligence.ordered_items);

    // V3.1: identity enrichment — join session_guests + orders to each profile
    const guestNameMap = new Map<string, string | null>(
      (sessionGuests ?? []).map((g) => [g.id, g.guest_name ?? null]),
    );

    // Build map: guest_id → ordered item names (from orders.guest_id FK)
    type OrderRow = { guest_id: string | null; order_items: Array<{ name_snapshot: string; quantity: number; menu_item_id: string | null }> };
    const guestOrdersMap = new Map<string, Array<{ name: string; quantity: number; menu_item_id: string | null }>>();
    for (const order of ((orders ?? []) as unknown as OrderRow[])) {
      if (!order.guest_id) continue;
      const existing = guestOrdersMap.get(order.guest_id) ?? [];
      for (const item of order.order_items) {
        existing.push({ name: item.name_snapshot, quantity: item.quantity, menu_item_id: item.menu_item_id });
      }
      guestOrdersMap.set(order.guest_id, existing);
    }

    const guestProfiles: EnrichedGuestProfile[] = behaviorProfiles.map((p) => ({
      ...p,
      guest_name: guestNameMap.get(p.guest_id) ?? null,
      orders_placed: guestOrdersMap.get(p.guest_id) ?? [],
    }));

    // V3.1: identity summary — full picture of who is at the table
    const connectedGuests = (sessionGuests ?? []).length;
    const namedGuests = (sessionGuests ?? []).filter((g) => g.guest_name).length;
    const guestsOrdered = guestProfiles.filter((p) => p.orders_placed.length > 0).length;
    const guestIdentitySummary: GuestIdentitySummary = {
      connected_guests: connectedGuests,
      named_guests: namedGuests,
      guests_ordered: guestsOrdered,
      guests_not_ordered: connectedGuests - guestsOrdered,
      anonymous_guests: connectedGuests - namedGuests,
    };

    return NextResponse.json({
      ...intelligence,
      behavior,
      guest_profiles: guestProfiles,
      table_summary: tableSummary,
      guest_identity_summary: guestIdentitySummary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

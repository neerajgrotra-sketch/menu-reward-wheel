import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { evaluateSession } from '@/engine/decision-runtime/runtime';

// ── Per-session rate limit (in-memory, per Lambda instance) ───────────────────
const SESSION_WINDOW_MS = 60 * 1000;
const SESSION_MAX = 60; // raised from 30 — each client event is now one row
const sessionBuckets = new Map<string, number[]>();

function checkSessionRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const cutoff = now - SESSION_WINDOW_MS;
  const timestamps = (sessionBuckets.get(sessionId) ?? []).filter((t) => t > cutoff);
  if (timestamps.length >= SESSION_MAX) return true;
  timestamps.push(now);
  sessionBuckets.set(sessionId, timestamps);
  return false;
}

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Client-fireable event types only — server-only events are blocked at this layer.
// ORDER_PLACED and SESSION_ENDED are written by their respective API routes.
const CLIENT_EVENT_TYPES = new Set([
  'MENU_OPENED',
  'CATEGORY_OPENED',
  'ITEM_VIEWED',
  'ITEM_VIEW_DURATION',
  'ITEM_ADDED_TO_CART',
  'ITEM_REMOVED_FROM_CART',
  'PROMOTION_VIEWED',
  'PROMOTION_PLAYED',
]);

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { visitSessionId: string } },
) {
  try {
    const { visitSessionId } = params;

    if (!UUID_RE.test(visitSessionId)) {
      return new NextResponse(null, { status: 204 });
    }

    if (checkSessionRateLimit(visitSessionId)) {
      return new NextResponse(null, { status: 204 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return new NextResponse(null, { status: 204 });

    const {
      event_type,
      guest_id,
      menu_item_id,
      promotion_id,
      metadata,
      // Legacy V1 fields — kept for backward compatibility
      items_viewed_count,
    } = body as {
      event_type?: string;
      guest_id?: string | null;
      menu_item_id?: string | null;
      promotion_id?: string | null;
      metadata?: Record<string, unknown>;
      items_viewed_count?: number;
    };

    const supabase = makeServiceClient();

    // Look up session to get restaurant_id and validate it's still active.
    // This single query serves two purposes: access validation + FK value for insert.
    const { data: session } = await supabase
      .from('visit_sessions')
      .select('id, restaurant_id, status')
      .eq('id', visitSessionId)
      .maybeSingle();

    if (!session || session.status !== 'active') {
      return new NextResponse(null, { status: 204 });
    }

    // ── New path: write to session_events ────────────────────────────────────
    const resolvedGuestId = guest_id && UUID_RE.test(guest_id) ? guest_id : null;

    if (event_type && CLIENT_EVENT_TYPES.has(event_type)) {
      const eventRow: Record<string, unknown> = {
        session_id: visitSessionId,
        restaurant_id: session.restaurant_id,
        event_type,
        metadata: metadata ?? {},
      };

      if (resolvedGuestId) eventRow.guest_id = resolvedGuestId;
      if (menu_item_id && UUID_RE.test(menu_item_id)) eventRow.menu_item_id = menu_item_id;
      if (promotion_id && UUID_RE.test(promotion_id)) eventRow.promotion_id = promotion_id;

      await Promise.resolve(supabase.from('session_events').insert(eventRow)).catch((err: unknown) => {
        console.error('[spinbite:track] session_events insert failed', err);
      });

      // Trigger Decision Runtime after high-value behavioral signals.
      // Fire-and-forget — never blocks the track response.
      // 20s cooldown inside evaluateSession prevents excessive evaluations.
      if (event_type === 'ITEM_VIEW_DURATION' || event_type === 'ITEM_REMOVED_FROM_CART') {
        void evaluateSession(visitSessionId, resolvedGuestId).catch(() => { /* runtime is self-contained */ });
      }
    }

    // ── Legacy path: increment menu_items_viewed counter ─────────────────────
    // Retained for backward compatibility. New clients do not send items_viewed_count.
    if (items_viewed_count && items_viewed_count > 0) {
      await Promise.resolve(supabase.rpc('increment_session_counters', {
        p_session_id: visitSessionId,
        p_menu_items_viewed_delta: Math.min(items_viewed_count, 10),
      })).catch((err: unknown) => {
        console.error('[spinbite:track] counter update failed', err);
      });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    console.error('[spinbite:track] error', err);
    return new NextResponse(null, { status: 204 });
  }
}

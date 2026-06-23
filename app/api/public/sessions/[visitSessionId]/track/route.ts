import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// ── Per-session rate limit (in-memory, per Lambda instance) ───────────────────
const SESSION_WINDOW_MS = 60 * 1000; // 1 minute
const SESSION_MAX = 30;
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
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { visitSessionId: string } },
) {
  try {
    const { visitSessionId } = params;

    if (!UUID_RE.test(visitSessionId)) {
      return new NextResponse(null, { status: 204 }); // silently ignore invalid IDs
    }

    if (checkSessionRateLimit(visitSessionId)) {
      return new NextResponse(null, { status: 204 }); // silently rate-limit
    }

    const body = await req.json().catch(() => null);
    if (!body) return new NextResponse(null, { status: 204 });

    const {
      items_viewed_count,
      event_type,
      item_id,
    } = body as {
      items_viewed_count?: number;
      event_type?: string;
      item_id?: string;
    };

    const supabase = makeServiceClient();

    // Increment menu_items_viewed counter (analytics — best effort)
    if (items_viewed_count && items_viewed_count > 0) {
      await Promise.resolve(
        supabase.rpc('increment_session_counters', {
          p_session_id: visitSessionId,
          p_menu_items_viewed_delta: Math.min(items_viewed_count, 10),
        }),
      ).catch((err: unknown) => {
        console.error('[spinbite:sessions:track] counter update failed', err);
      });
    }

    // Append interaction event to session_interaction_log
    if (event_type) {
      const eventPayload: Record<string, unknown> = {
        event: event_type,
        ts: new Date().toISOString(),
      };
      if (item_id) eventPayload.item_id = item_id;

      await Promise.resolve(
        supabase.rpc('append_session_interaction', {
          p_session_id: visitSessionId,
          p_event: eventPayload,
        }),
      ).catch((err: unknown) => {
        console.error('[spinbite:sessions:track] log append failed', err);
      });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    // Analytics failure must never surface to customer
    console.error('[spinbite:sessions:track] error', err);
    return new NextResponse(null, { status: 204 });
  }
}

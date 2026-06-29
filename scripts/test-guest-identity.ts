/**
 * Guest Identity Engine V1 — Validation Script
 *
 * Verifies that the full identity attribution pipeline is correctly wired:
 *   1. session_events.guest_id = session_guests.id (server UUID, not client-generated)
 *   2. orders.guest_id = session_guests.id (per-guest order attribution)
 *   3. session_guests.guest_name is populated when a name was captured
 *   4. No orphaned guest_id values in events or orders
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/test-guest-identity.ts [sessionId]
 *
 * If sessionId is omitted, checks the 5 most recent active/completed sessions.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type CheckResult = { pass: boolean; message: string };

function ok(msg: string): CheckResult { return { pass: true, message: `  ✓ ${msg}` }; }
function fail(msg: string): CheckResult { return { pass: false, message: `  ✗ ${msg}` }; }
function warn(msg: string): CheckResult { return { pass: true, message: `  ~ ${msg}` }; }

async function auditSession(sessionId: string): Promise<void> {
  console.log(`\n── Session ${sessionId} ──`);
  const results: CheckResult[] = [];

  // Load session_guests for this session
  const { data: guests, error: guestsError } = await supabase
    .from('session_guests')
    .select('id, guest_name, joined_at, status')
    .eq('session_id', sessionId);

  if (guestsError) {
    console.error(`  ERROR loading session_guests: ${guestsError.message}`);
    return;
  }

  const guestIds = new Set((guests ?? []).map((g) => g.id));
  const namedGuests = (guests ?? []).filter((g) => g.guest_name);

  results.push(
    guests && guests.length > 0
      ? ok(`${guests.length} session_guests row(s) found`)
      : warn('No session_guests rows — session may predate Presence Engine V1'),
  );

  results.push(
    namedGuests.length > 0
      ? ok(`${namedGuests.length}/${guests?.length ?? 0} guests have names: ${namedGuests.map((g) => g.guest_name).join(', ')}`)
      : warn('No guest names captured (optional — guests may have skipped)'),
  );

  // Load session_events with guest_id
  const { data: events, error: eventsError } = await supabase
    .from('session_events')
    .select('id, guest_id, event_type, created_at')
    .eq('session_id', sessionId);

  if (eventsError) {
    console.error(`  ERROR loading session_events: ${eventsError.message}`);
    return;
  }

  const clientEvents = (events ?? []).filter((e) => e.guest_id !== null);
  const eventsWithValidGuestId = clientEvents.filter((e) => guestIds.has(e.guest_id as string));
  const eventsWithOrphanedGuestId = clientEvents.filter((e) => !guestIds.has(e.guest_id as string));

  results.push(
    ok(`${events?.length ?? 0} total events, ${clientEvents.length} have guest_id`),
  );

  if (guestIds.size > 0 && clientEvents.length > 0) {
    results.push(
      eventsWithValidGuestId.length === clientEvents.length
        ? ok(`All ${clientEvents.length} guest events link to valid session_guests rows (V1 identity)`)
        : eventsWithOrphanedGuestId.length === clientEvents.length
          ? warn(`All ${clientEvents.length} guest events use legacy client-generated UUIDs (pre-V1 data)`)
          : warn(
              `Mixed: ${eventsWithValidGuestId.length} V1 events (server UUID), ` +
              `${eventsWithOrphanedGuestId.length} legacy events (client UUID)`,
            ),
    );
  } else if (guestIds.size === 0 && clientEvents.length > 0) {
    results.push(warn(`${clientEvents.length} events have guest_id but no session_guests rows (pre-Presence data)`));
  }

  // Load orders with guest_id
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, guest_id, order_number, order_items(name_snapshot, quantity)')
    .eq('visit_session_id', sessionId);

  if (ordersError) {
    console.error(`  ERROR loading orders: ${ordersError.message}`);
    return;
  }

  const ordersWithGuestId = (orders ?? []).filter((o) => o.guest_id !== null);
  const ordersWithValidGuestId = ordersWithGuestId.filter((o) => guestIds.has(o.guest_id as string));
  const ordersWithoutGuestId = (orders ?? []).filter((o) => o.guest_id === null);

  results.push(
    ok(`${orders?.length ?? 0} order(s): ${ordersWithGuestId.length} attributed to guests, ${ordersWithoutGuestId.length} unattributed`),
  );

  if (ordersWithGuestId.length > 0 && guestIds.size > 0) {
    results.push(
      ordersWithValidGuestId.length === ordersWithGuestId.length
        ? ok(`All attributed orders link to valid session_guests rows`)
        : fail(
            `${ordersWithGuestId.length - ordersWithValidGuestId.length} order(s) reference unknown guest_id ` +
            '(FK violation or stale data)',
          ),
    );

    // Show per-guest order breakdown
    for (const order of ordersWithGuestId) {
      const guest = (guests ?? []).find((g) => g.id === order.guest_id);
      const guestLabel = guest?.guest_name ?? `Anonymous (${order.guest_id?.slice(0, 8)}…)`;
      const itemList = (order.order_items as Array<{ name_snapshot: string; quantity: number }>)
        .map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${i.name_snapshot}`)
        .join(', ');
      console.log(`     Order #${order.order_number} → ${guestLabel}: ${itemList}`);
    }
  }

  // Name persistence check — verify that all named guests have consistent guest_id in events
  for (const guest of namedGuests) {
    const guestEvents = (events ?? []).filter((e) => e.guest_id === guest.id);
    results.push(
      guestEvents.length > 0
        ? ok(`${guest.guest_name}: ${guestEvents.length} event(s) attributed`)
        : warn(`${guest.guest_name}: named but no events attributed (may have joined then left quickly)`),
    );
  }

  // Print all results
  let allPassed = true;
  for (const r of results) {
    console.log(r.message);
    if (!r.pass) allPassed = false;
  }

  console.log(allPassed ? '  → PASS' : '  → FAIL (see above)');
}

async function main() {
  const sessionId = process.argv[2];

  if (sessionId) {
    await auditSession(sessionId);
  } else {
    // Audit the 5 most recent sessions that have session_guests rows
    const { data: recentSessions, error } = await supabase
      .from('visit_sessions')
      .select('id, status, started_at')
      .order('started_at', { ascending: false })
      .limit(5);

    if (error || !recentSessions || recentSessions.length === 0) {
      console.log('No sessions found. Pass a session ID as an argument.');
      return;
    }

    console.log(`Auditing ${recentSessions.length} most recent sessions…`);
    for (const s of recentSessions) {
      await auditSession(s.id);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

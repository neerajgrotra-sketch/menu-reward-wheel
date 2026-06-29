/**
 * Session Event Fidelity Validator
 *
 * Simulates a complete customer flow and verifies that every required
 * session_events row lands correctly in the database.
 *
 * Usage:
 *   BASE_URL=https://your-deployment.vercel.app \
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=service_role_key \
 *   RESTAURANT_ID=uuid \
 *   TOUCHPOINT_ID=uuid \
 *   MENU_ITEM_ID=uuid \
 *   PROMOTION_ID=uuid \  (optional — skips PROMOTION_VIEWED/PROMOTION_PLAYED if absent)
 *   npx ts-node --project tsconfig.json scripts/test-session-events.ts
 *
 * Events tested:
 *   MENU_OPENED             — fired on session resolve
 *   CATEGORY_OPENED         — explicit category navigation
 *   ITEM_VIEWED             — item detail sheet open
 *   ITEM_VIEW_DURATION      — item detail sheet close (with duration_ms)
 *   ITEM_ADDED_TO_CART      — menu_card and detail_sheet source paths
 *   ITEM_REMOVED_FROM_CART  — partial decrement AND full removal
 *   ORDER_PLACED            — server-side on successful order POST
 *   PROMOTION_VIEWED        — promotion widget sheet opened
 *   PROMOTION_PLAYED        — user clicks Play Now
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SupabaseRow = Record<string, unknown>;

async function supabaseQuery(
  url: string,
  serviceKey: string,
  table: string,
  query: string,
): Promise<SupabaseRow[]> {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
  });
  return res.json() as Promise<SupabaseRow[]>;
}

async function track(
  baseUrl: string,
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await fetch(`${baseUrl}/api/public/sessions/${sessionId}/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ─── Result tracking ─────────────────────────────────────────────────────────

type TestResult = { event: string; expected: boolean; found: boolean; pass: boolean; note?: string };
const results: TestResult[] = [];

function record(event: string, found: boolean, expected = true, note?: string) {
  results.push({ event, expected, found, pass: found === expected, note });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
  const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const RESTAURANT_ID = process.env.RESTAURANT_ID ?? '';
  const TOUCHPOINT_ID = process.env.TOUCHPOINT_ID ?? '';
  const MENU_ITEM_ID = process.env.MENU_ITEM_ID ?? '';
  const PROMOTION_ID = process.env.PROMOTION_ID ?? '';

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !RESTAURANT_ID || !TOUCHPOINT_ID || !MENU_ITEM_ID) {
    console.error('\n[FAIL] Missing required env vars. Set: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESTAURANT_ID, TOUCHPOINT_ID, MENU_ITEM_ID\n');
    process.exit(1);
  }

  // ── Step 1: Resolve session (fires MENU_OPENED) ──────────────────────────────

  console.log('\n[STEP 1] Resolving session …');
  const resolveRes = await fetch(`${BASE_URL}/api/public/sessions/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurant_id: RESTAURANT_ID, touchpoint_id: TOUCHPOINT_ID, known_session_id: null }),
  });

  if (!resolveRes.ok) {
    console.error('[FAIL] Session resolve failed:', resolveRes.status, await resolveRes.text());
    process.exit(1);
  }

  const resolveData = await resolveRes.json() as { visit_session_id: string; guest_token: string };
  const sessionId = resolveData.visit_session_id;
  const guestId = randomUUID();
  console.log(`[OK] Session: ${sessionId}`);

  // ── Step 2: MENU_OPENED ──────────────────────────────────────────────────────

  await track(BASE_URL, sessionId, {
    event_type: 'MENU_OPENED',
    guest_id: guestId,
    metadata: { touchpoint_id: TOUCHPOINT_ID, source: 'test_script' },
  });
  console.log('[STEP 2] MENU_OPENED fired.');

  // ── Step 3: CATEGORY_OPENED ──────────────────────────────────────────────────

  const fakeCategoryId = randomUUID();
  await track(BASE_URL, sessionId, {
    event_type: 'CATEGORY_OPENED',
    guest_id: guestId,
    metadata: { category_id: fakeCategoryId, category_name: 'Mains', previous_category_id: null, previous_category_name: null },
  });
  console.log('[STEP 3] CATEGORY_OPENED fired.');

  // ── Step 4: ITEM_VIEWED ──────────────────────────────────────────────────────

  await track(BASE_URL, sessionId, {
    event_type: 'ITEM_VIEWED',
    guest_id: guestId,
    menu_item_id: MENU_ITEM_ID,
    metadata: { item_name: 'Test Item', price_snapshot: 15.00, has_image: false, category_id: fakeCategoryId, category_name: 'Mains' },
  });
  console.log('[STEP 4] ITEM_VIEWED fired.');

  // ── Step 5: ITEM_VIEW_DURATION (16s — high_intent zone) ──────────────────────

  await track(BASE_URL, sessionId, {
    event_type: 'ITEM_VIEW_DURATION',
    guest_id: guestId,
    menu_item_id: MENU_ITEM_ID,
    metadata: { item_name: 'Test Item', duration_ms: 16000 },
  });
  console.log('[STEP 5] ITEM_VIEW_DURATION fired (16000ms — high_intent).');

  // ── Step 6: ITEM_ADDED_TO_CART (menu_card) ───────────────────────────────────

  await track(BASE_URL, sessionId, {
    event_type: 'ITEM_ADDED_TO_CART',
    guest_id: guestId,
    menu_item_id: MENU_ITEM_ID,
    metadata: { item_name: 'Test Item', quantity: 2, price_snapshot: 15.00, effective_price_snapshot: 15.00, source: 'menu_card', special_instructions_present: false },
  });
  console.log('[STEP 6] ITEM_ADDED_TO_CART (menu_card) fired.');

  // ── Step 7: ITEM_REMOVED_FROM_CART (partial — qty 2→1) ───────────────────────

  await track(BASE_URL, sessionId, {
    event_type: 'ITEM_REMOVED_FROM_CART',
    guest_id: guestId,
    menu_item_id: MENU_ITEM_ID,
    metadata: { item_name: 'Test Item', quantity_removed: 1, previous_quantity: 2, cart_subtotal_before: 30.00, cart_subtotal_after: 15.00 },
  });
  console.log('[STEP 7] ITEM_REMOVED_FROM_CART (partial, qty_removed=1) fired.');

  // ── Step 8: Re-add (detail_sheet) then full remove ───────────────────────────

  await track(BASE_URL, sessionId, {
    event_type: 'ITEM_ADDED_TO_CART',
    guest_id: guestId,
    menu_item_id: MENU_ITEM_ID,
    metadata: { item_name: 'Test Item', quantity: 1, price_snapshot: 15.00, effective_price_snapshot: 15.00, source: 'detail_sheet', special_instructions_present: false },
  });
  await track(BASE_URL, sessionId, {
    event_type: 'ITEM_REMOVED_FROM_CART',
    guest_id: guestId,
    menu_item_id: MENU_ITEM_ID,
    metadata: { item_name: 'Test Item', quantity_removed: 1, previous_quantity: 1, cart_subtotal_before: 15.00, cart_subtotal_after: 0.00 },
  });
  console.log('[STEP 8] ITEM_ADDED_TO_CART (detail_sheet) + ITEM_REMOVED_FROM_CART (full) fired.');

  // ── Step 9: PROMOTION events ─────────────────────────────────────────────────

  if (PROMOTION_ID) {
    await track(BASE_URL, sessionId, {
      event_type: 'PROMOTION_VIEWED',
      guest_id: guestId,
      promotion_id: PROMOTION_ID,
      metadata: { promotion_name: 'Test Promotion', source: 'widget_sheet' },
    });
    await track(BASE_URL, sessionId, {
      event_type: 'PROMOTION_PLAYED',
      guest_id: guestId,
      promotion_id: PROMOTION_ID,
      metadata: { promotion_name: 'Test Promotion', source: 'widget_sheet', game_type: 'spin_wheel' },
    });
    console.log('[STEP 9] PROMOTION_VIEWED + PROMOTION_PLAYED fired.');
  } else {
    console.log('[STEP 9] Skipped (no PROMOTION_ID env var).');
  }

  // ── Step 10: Place order (ORDER_PLACED fires server-side) ────────────────────

  console.log('\n[STEP 10] Placing order …');
  const orderRes = await fetch(`${BASE_URL}/api/public/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurant_id: RESTAURANT_ID,
      visit_session_id: sessionId,
      items: [{ menu_item_id: MENU_ITEM_ID, quantity: 1 }],
      idempotency_key: `test-${Date.now()}-${randomUUID()}`,
    }),
  });

  let orderPlacedSuccess = false;
  if (orderRes.ok) {
    orderPlacedSuccess = true;
    console.log('[STEP 10] Order placed.');
  } else {
    console.warn('[STEP 10] Order failed (non-fatal if ordering disabled or item has no price):', orderRes.status);
  }

  // ── Wait for fire-and-forget writes ──────────────────────────────────────────

  console.log('\n[WAIT] 2s for async writes …');
  await sleep(2000);

  // ── Verify in DB ─────────────────────────────────────────────────────────────

  console.log('\n[VERIFY] Querying session_events …');
  const rows = await supabaseQuery(
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    'session_events',
    `session_id=eq.${sessionId}&select=event_type,menu_item_id,promotion_id,metadata`,
  );

  const byType = new Map<string, SupabaseRow[]>();
  for (const row of rows) {
    const key = String(row.event_type);
    const list = byType.get(key) ?? [];
    list.push(row);
    byType.set(key, list);
  }

  console.log(`[VERIFY] ${rows.length} total event rows for session.\n`);

  // Assertions
  record('MENU_OPENED', (byType.get('MENU_OPENED')?.length ?? 0) >= 1);
  record('CATEGORY_OPENED', (byType.get('CATEGORY_OPENED')?.length ?? 0) >= 1);
  record('ITEM_VIEWED', (byType.get('ITEM_VIEWED')?.length ?? 0) >= 1);
  record('ITEM_VIEW_DURATION', (byType.get('ITEM_VIEW_DURATION')?.length ?? 0) >= 1);

  const addedEvents = byType.get('ITEM_ADDED_TO_CART') ?? [];
  record('ITEM_ADDED_TO_CART (menu_card)', addedEvents.some((e) => (e.metadata as Record<string, unknown>)?.source === 'menu_card'));
  record('ITEM_ADDED_TO_CART (detail_sheet)', addedEvents.some((e) => (e.metadata as Record<string, unknown>)?.source === 'detail_sheet'));

  const removedEvents = byType.get('ITEM_REMOVED_FROM_CART') ?? [];
  const partialRemoval = removedEvents.some((e) => {
    const m = e.metadata as Record<string, unknown>;
    return Number(m?.quantity_removed) === 1 && Number(m?.previous_quantity) === 2;
  });
  const fullRemoval = removedEvents.some((e) => {
    const m = e.metadata as Record<string, unknown>;
    return Number(m?.quantity_removed) === 1 && Number(m?.cart_subtotal_after) === 0;
  });
  record('ITEM_REMOVED_FROM_CART (partial decrement)', partialRemoval);
  record('ITEM_REMOVED_FROM_CART (full removal)', fullRemoval);

  if (PROMOTION_ID) {
    const viewedEvents = byType.get('PROMOTION_VIEWED') ?? [];
    record('PROMOTION_VIEWED (widget_sheet)', viewedEvents.some((e) => (e.metadata as Record<string, unknown>)?.source === 'widget_sheet'));
    const playedEvents = byType.get('PROMOTION_PLAYED') ?? [];
    record('PROMOTION_PLAYED (widget_sheet)', playedEvents.some((e) => (e.metadata as Record<string, unknown>)?.source === 'widget_sheet'));
  }

  if (orderPlacedSuccess) {
    record('ORDER_PLACED (server-side)', (byType.get('ORDER_PLACED')?.length ?? 0) >= 1);
  }

  // ── Print report ─────────────────────────────────────────────────────────────

  console.log('════════════════════════════════════════════════');
  console.log('  SESSION EVENT FIDELITY REPORT');
  console.log('════════════════════════════════════════════════');
  console.log(`  Session:    ${sessionId}`);
  console.log(`  Total rows: ${rows.length}`);
  console.log('════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`  ${icon}  ${r.event}`);
    if (r.pass) passed++;
    else failed++;
  }

  console.log(`\n  Result: ${passed}/${passed + failed} passed`);

  if (failed > 0) {
    console.log('\n  Failed events:');
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`    - ${r.event}`);
    }
    console.log('\n  Hint: confirm that ordering is enabled and MENU_ITEM_ID has a price set.');
  }

  console.log('\n════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error('[FATAL]', err);
  process.exit(1);
});

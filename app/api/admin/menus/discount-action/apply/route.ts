import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { fetchAssignedMenus, fetchMenuContents } from '@/lib/menu/queries';
import { resolveMenuDiscountAction, isResolvableAction, type ResolvableAction, type ResolvedDiscountItem } from '@/lib/menu-discount-actions/resolve';

// POST /api/admin/menus/discount-action/apply
// The only route in this feature that writes. Deliberately does NOT trust a
// client-supplied "resolved items" diff (which could be stale or tampered
// with) — it re-runs the exact same resolve() the preview route used,
// against current live data, then writes that. Writes go through the
// session-authenticated client so RLS's "owners update own menu items"
// policy (20260609020000_phase_c1_h6_h5_h2_security_hardening.sql:101-119)
// is the real authorization boundary, same precedent as
// app/admin/menus/[menuId]/page.tsx. Each successful write gets its own
// menu_discount_change_log row (20260709040000_menu_discount_change_log.sql).

type ApplyOutcome = { id: string; name: string; success: boolean; error?: string };

export async function POST(request: Request) {
  const authClient = createServerAuthClient();
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let restaurantId: string;
  let action: ResolvableAction;
  try {
    const body = await request.json();
    restaurantId = (body.restaurantId ?? '').trim();
    if (!isResolvableAction(body.action)) {
      return NextResponse.json({ error: 'Malformed action.' }, { status: 400 });
    }
    action = body.action;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!restaurantId) {
    return NextResponse.json({ error: 'restaurantId is required.' }, { status: 400 });
  }

  const { data: restaurant } = await authClient
    .from('restaurants')
    .select('id')
    .eq('id', restaurantId)
    .eq('owner_id', userData.user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurant not found or access denied.' }, { status: 403 });
  }

  const menus = await fetchAssignedMenus(authClient, restaurantId);
  const { categories, items } = await fetchMenuContents(
    authClient,
    menus.map((m) => m.id),
  );

  const resolved = resolveMenuDiscountAction(action, categories, items);
  if (!resolved.resolved) {
    return NextResponse.json({ error: resolved.reason }, { status: 409 });
  }

  const outcomes: ApplyOutcome[] = await Promise.all(
    resolved.items.map((item) => applyOne(authClient, restaurantId, userData.user.id, item)),
  );

  const succeeded = outcomes.filter((o) => o.success).length;
  const failed = outcomes.filter((o) => !o.success);

  return NextResponse.json({
    applied: succeeded,
    total: outcomes.length,
    failed: failed.length > 0 ? failed : undefined,
  });
}

async function applyOne(
  authClient: ReturnType<typeof createServerAuthClient>,
  restaurantId: string,
  actorUserId: string,
  item: ResolvedDiscountItem,
): Promise<ApplyOutcome> {
  const updateResult = await authClient
    .from('menu_items')
    .update({
      special_enabled: item.after.specialEnabled,
      special_type: item.after.specialType,
      special_percent: item.after.specialPercent,
      special_price: item.after.specialPrice,
      special_start_at: item.after.specialStartAt,
      special_end_at: item.after.specialEndAt,
      special_no_expiry: item.after.specialNoExpiry,
    })
    .eq('id', item.id)
    .eq('restaurant_id', restaurantId);

  if (updateResult.error) {
    return { id: item.id, name: item.name, success: false, error: updateResult.error.message };
  }

  // A logging failure must not be reported as an apply failure — the write
  // already succeeded. Best-effort, matching intelligence-engine.ts's own
  // "log failure never masks a real result" convention.
  const logResult = await authClient.from('menu_discount_change_log').insert({
    restaurant_id: restaurantId,
    actor_user_id: actorUserId,
    menu_item_id: item.id,
    old_value: item.before,
    new_value: item.after,
    source: 'ai_action',
  });

  if (logResult.error) {
    console.error('[discount-action/apply] Failed to write change log:', logResult.error.message);
  }

  return { id: item.id, name: item.name, success: true };
}

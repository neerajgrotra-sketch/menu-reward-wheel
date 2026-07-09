import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { fetchAssignedMenus, fetchMenuContents } from '@/lib/menu/queries';
import { resolveMenuDiscountAction, isResolvableAction, type ResolvableAction } from '@/lib/menu-discount-actions/resolve';

// POST /api/admin/menus/discount-action/preview
// Read-only: resolves a structured discount action (already parsed from
// natural language by dashboard_assistant) against a restaurant's real menu
// data and returns a before/after preview. Never writes. The session client
// is used throughout — RLS ("Owners read own menu items including deleted",
// 20260606040000_menu_items_enrichment.sql:83-91) is the real boundary, on
// top of the explicit ownership check below for a clean error message.

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

  const result = resolveMenuDiscountAction(action, categories, items);
  return NextResponse.json(result);
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { isSpecialOfferActive, calculateSpecialPrice } from '@/lib/menu/special-offer';

export type OrderItemInput = {
  menu_item_id: string;
  quantity: number;
};

export type ResolvedItem = {
  menu_item_id: string;
  name_snapshot: string;
  price_snapshot: number;
  effective_price_snapshot: number;
  special_active_snapshot: boolean;
  quantity: number;
  line_total: number;
};

type RawMenuItem = {
  id: string;
  name: string;
  price: number | null;
  available: boolean;
  special_enabled: boolean;
  special_type: string | null;
  special_percent: number | null;
  special_price: number | null;
  special_start_at: string | null;
  special_end_at: string | null;
  special_no_expiry: boolean;
};

export type ResolveOrderItemsResult =
  | { ok: true; resolvedItems: ResolvedItem[]; subtotal: number }
  | { ok: false; status: number; error: string };

// Server-authoritative price resolution — never trust frontend prices (Invariant #5).
// Extracted verbatim from the original app/api/public/orders/route.ts pipeline so
// both the direct-order route and the payment-checkout route price identically.
export async function resolveOrderItems(
  supabase: SupabaseClient,
  restaurantId: string,
  items: OrderItemInput[],
): Promise<ResolveOrderItemsResult> {
  const menuItemIds = items.map((i) => i.menu_item_id);
  const { data: menuItemsRaw, error: menuError } = await supabase
    .from('menu_items')
    .select(
      'id,name,price,available,special_enabled,special_type,special_percent,special_price,special_start_at,special_end_at,special_no_expiry',
    )
    .eq('restaurant_id', restaurantId)
    .is('deleted_at', null)
    .in('id', menuItemIds);

  if (menuError || !menuItemsRaw) {
    return { ok: false, status: 500, error: 'Failed to load menu items.' };
  }

  const menuItemMap = new Map<string, RawMenuItem>(
    (menuItemsRaw as RawMenuItem[]).map((m) => [m.id, m]),
  );

  const now = new Date();
  let subtotal = 0;
  const resolvedItems: ResolvedItem[] = [];

  for (const input of items) {
    const mi = menuItemMap.get(input.menu_item_id);
    if (!mi) {
      return { ok: false, status: 400, error: `Menu item ${input.menu_item_id} not found.` };
    }
    if (!mi.available) {
      return { ok: false, status: 400, error: `"${mi.name}" is currently unavailable.` };
    }
    if (mi.price == null) {
      return { ok: false, status: 400, error: `"${mi.name}" has no price set.` };
    }

    const specialActive = isSpecialOfferActive(mi, now);
    const effectivePrice =
      specialActive && mi.special_type
        ? calculateSpecialPrice(mi.price, mi.special_type, mi.special_percent, mi.special_price)
        : mi.price;

    const lineTotal = Math.round(effectivePrice * input.quantity * 100) / 100;
    subtotal = Math.round((subtotal + lineTotal) * 100) / 100;

    resolvedItems.push({
      menu_item_id: input.menu_item_id,
      name_snapshot: mi.name,
      price_snapshot: mi.price,
      effective_price_snapshot: effectivePrice,
      special_active_snapshot: specialActive,
      quantity: input.quantity,
      line_total: lineTotal,
    });
  }

  return { ok: true, resolvedItems, subtotal };
}

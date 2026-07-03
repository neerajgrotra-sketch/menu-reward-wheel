// Menu Library — shared fetch helpers over the menus -> menu_categories ->
// menu_items hierarchy, joined to a restaurant via restaurant_menu_assignments.
// Used by both the public QR menu pages and the admin builder so the fetch
// shape isn't duplicated across them.

export type MenuRow = {
  id: string;
  name: string;
  menu_type: string;
  description: string | null;
};

export type MenuCategoryRow = {
  id: string;
  menu_id: string;
  name: string;
  slug: string;
  display_order: number;
};

export type MenuItemRow = {
  id: string;
  category_id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number | null;
  is_featured: boolean;
  available: boolean;
  tags: string[];
  display_order: number;
  special_enabled: boolean;
  special_type: string | null;
  special_percent: number | null;
  special_price: number | null;
  special_start_at: string | null;
  special_end_at: string | null;
  special_no_expiry: boolean;
};

const MENU_ITEM_COLUMNS =
  'id,category_id,restaurant_id,name,description,image_url,price,is_featured,available,tags,display_order,special_enabled,special_type,special_percent,special_price,special_start_at,special_end_at,special_no_expiry';

/**
 * Every menu currently and actively assigned to a restaurant (public-facing:
 * one restaurant may serve several menus at once — e.g. Lunch + Dinner both
 * live — ordered by restaurant_menu_assignments.display_order).
 */
export async function fetchAssignedMenus(
  supabase: any,
  restaurantId: string,
): Promise<MenuRow[]> {
  // display_order defaults to 0 for every assignment today (the Assign Locations
  // UI has no reordering control yet) — without a tiebreaker, Postgres does not
  // guarantee stable ordering among equal display_order values, so which menu
  // renders first for a multi-menu restaurant could vary between requests.
  // created_at is a strictly-increasing tiebreaker: first-assigned menu wins ties.
  const assignmentsResult = await supabase
    .from('restaurant_menu_assignments')
    .select('menu_id,display_order,created_at')
    .eq('restaurant_id', restaurantId)
    .eq('active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  const menuIds = (assignmentsResult.data || []).map((a: { menu_id: string }) => a.menu_id);
  if (menuIds.length === 0) return [];

  const menusResult = await supabase
    .from('menus')
    .select('id,name,menu_type,description')
    .in('id', menuIds)
    .eq('active', true);

  const byId = new Map((menusResult.data || []).map((m: MenuRow) => [m.id, m]));
  // Preserve assignment display_order, drop any menu that failed the active filter.
  return menuIds.map((id: string) => byId.get(id)).filter(Boolean) as MenuRow[];
}

/** Categories + items for a set of menus (used once assigned menus are known). */
export async function fetchMenuContents(
  supabase: any,
  menuIds: string[],
): Promise<{ categories: MenuCategoryRow[]; items: MenuItemRow[] }> {
  if (menuIds.length === 0) return { categories: [], items: [] };

  const categoriesResult = await supabase
    .from('menu_categories')
    .select('id,menu_id,name,slug,display_order')
    .in('menu_id', menuIds)
    .eq('active', true)
    .order('display_order', { ascending: true });

  const categories = (categoriesResult.data || []) as MenuCategoryRow[];
  const categoryIds = categories.map((c) => c.id);
  if (categoryIds.length === 0) return { categories, items: [] };

  const itemsResult = await supabase
    .from('menu_items')
    .select(MENU_ITEM_COLUMNS)
    .in('category_id', categoryIds)
    .is('deleted_at', null)
    .eq('active', true)
    .order('display_order', { ascending: true });

  return { categories, items: (itemsResult.data || []) as MenuItemRow[] };
}

/** Categories + items for a single menu (admin builder at /admin/menus/[menuId]). */
export async function fetchSingleMenuContents(supabase: any, menuId: string) {
  return fetchMenuContents(supabase, [menuId]);
}

// Gives the planner real menu data to reason over — the piece that lets it
// produce a first-turn reply like "I found 3 items matching chai: Masala
// Chai, Cardamom Chai, Ginger Chai" instead of discovering ambiguity only
// after guessing. This is advisory context for phrasing only: the actual
// write still goes through lib/menu-discount-actions/resolve.ts's
// deterministic, post-hoc name resolution against live rows, so a
// hallucinated or stale item name here can never reach menu_items — it just
// fails to resolve and surfaces a clarification/ambiguity message.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { fetchAssignedMenus, fetchMenuContents, type MenuCategoryRow, type MenuItemRow } from '@/lib/menu/queries';

const MAX_ITEMS_PER_CATEGORY = 25;

export async function buildMenuSnapshot(
  supabase: SupabaseClient<Database>,
  restaurantId: string,
): Promise<string> {
  const menus = await fetchAssignedMenus(supabase, restaurantId);
  const { categories, items } = await fetchMenuContents(
    supabase,
    menus.map((m) => m.id),
  );

  if (categories.length === 0) return '';

  const itemsByCategory = new Map<string, MenuItemRow[]>();
  for (const item of items) {
    const list = itemsByCategory.get(item.category_id) ?? [];
    list.push(item);
    itemsByCategory.set(item.category_id, list);
  }

  return categories
    .map((category: MenuCategoryRow) => {
      const categoryItems = itemsByCategory.get(category.id) ?? [];
      if (categoryItems.length === 0) return null;
      const names = categoryItems.slice(0, MAX_ITEMS_PER_CATEGORY).map((i) => i.name);
      const suffix = categoryItems.length > MAX_ITEMS_PER_CATEGORY ? `, +${categoryItems.length - MAX_ITEMS_PER_CATEGORY} more` : '';
      return `${category.name}: ${names.join(', ')}${suffix}`;
    })
    .filter((line): line is string => line !== null)
    .join('\n');
}

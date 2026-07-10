// Menu Tools — read-only. Every function here is a thin wrapper over
// lib/menu/queries.ts (fetchAssignedMenus/fetchMenuContents, unchanged) and
// lib/menu-discount-actions/resolve.ts's matchByName (unchanged) — no new
// matching/fetching algorithm exists in this file. searchMenuItems and
// findItemsByName from the original request are the same underlying
// primitive (a name-filtered item search) registered under one name, not
// duplicated as two near-identical tools.

import { fetchAssignedMenus, fetchMenuContents, type MenuRow, type MenuCategoryRow, type MenuItemRow } from '@/lib/menu/queries';
import { matchByName } from '@/lib/menu-discount-actions/resolve';
import type { ToolDefinition, ToolContext } from './types';
import { ok, fail } from './types';

async function fetchMenuData(ctx: ToolContext): Promise<{ categories: MenuCategoryRow[]; items: MenuItemRow[] }> {
  const menus = await fetchAssignedMenus(ctx.supabase, ctx.restaurantId);
  return fetchMenuContents(ctx.supabase, menus.map((m) => m.id));
}

export const searchMenus: ToolDefinition<Record<string, never>, MenuRow[]> = {
  name: 'searchMenus',
  description: "Every menu currently assigned to this restaurant (a restaurant may serve several at once, e.g. Lunch + Dinner).",
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (_input, ctx) => ok(await fetchAssignedMenus(ctx.supabase, ctx.restaurantId)),
};

export type SearchQuery = { query?: string };

export const searchMenuCategories: ToolDefinition<SearchQuery, MenuCategoryRow[]> = {
  name: 'searchMenuCategories',
  description: 'Real menu categories for this restaurant, optionally filtered by a name/fragment match.',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const { categories } = await fetchMenuData(ctx);
    if (!input.query) return ok(categories);
    return ok(matchByName(categories, input.query).rows);
  },
};

// Also registered as findItemsByName — same tool, both requested names.
export const searchMenuItems: ToolDefinition<SearchQuery, MenuItemRow[]> = {
  name: 'searchMenuItems',
  description: 'Real menu items for this restaurant, optionally filtered by a name/fragment match (exact match preferred, substring fallback).',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const { items } = await fetchMenuData(ctx);
    if (!input.query) return ok(items);
    return ok(matchByName(items, input.query).rows);
  },
};

export const getMenuItem: ToolDefinition<{ itemName: string }, MenuItemRow> = {
  name: 'getMenuItem',
  description: 'A single menu item resolved by name. Fails if zero or more than one real item matches — never guesses.',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const { items } = await fetchMenuData(ctx);
    const { rows } = matchByName(items, input.itemName);
    if (rows.length === 0) return fail(`No menu item found matching "${input.itemName}".`);
    if (rows.length > 1) return fail(`Multiple items match "${input.itemName}" — be more specific.`);
    return ok(rows[0]);
  },
};

export const getMenuItemsByCategory: ToolDefinition<{ categoryName: string }, MenuItemRow[]> = {
  name: 'getMenuItemsByCategory',
  description: 'Every item in one real category, resolved by name.',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const { categories, items } = await fetchMenuData(ctx);
    const { rows: categoryMatches } = matchByName(categories, input.categoryName);
    if (categoryMatches.length === 0) return fail(`No category found matching "${input.categoryName}".`);
    if (categoryMatches.length > 1) return fail(`Multiple categories match "${input.categoryName}" — be more specific.`);
    return ok(items.filter((i) => i.category_id === categoryMatches[0].id));
  },
};

export const getFeaturedItems: ToolDefinition<Record<string, never>, MenuItemRow[]> = {
  name: 'getFeaturedItems',
  description: 'Menu items currently marked is_featured.',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (_input, ctx) => {
    const { items } = await fetchMenuData(ctx);
    return ok(items.filter((i) => i.is_featured));
  },
};

export const findItemsByTags: ToolDefinition<{ tags: string[] }, MenuItemRow[]> = {
  name: 'findItemsByTags',
  description: 'Menu items whose tags overlap with any of the given tags.',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const { items } = await fetchMenuData(ctx);
    const wanted = new Set(input.tags.map((t) => t.toLowerCase()));
    return ok(items.filter((i) => i.tags.some((t) => wanted.has(t.toLowerCase()))));
  },
};

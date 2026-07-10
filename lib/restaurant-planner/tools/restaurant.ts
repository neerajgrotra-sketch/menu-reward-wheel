// Restaurant Context Tools. getRestaurant/validateOwnership extract a real,
// concrete duplication: the identical ownership query was inline-copied in
// all 6 Restaurant-Planner routes (messages, messages/outcome,
// target-selection, conversations, discount-action/preview,
// discount-action/apply) — this is the single implementation those routes
// now call. getCapabilities wraps the existing capability-settings resolver;
// getRestaurantTimezone is a stub — no timezone column exists anywhere in
// the schema (same gap flagged in every prior Restaurant Planner audit).

import { isRegisteredCapability, isCapabilityAvailable, CAPABILITY_REGISTRY, type CapabilityKey } from '../tool-registry';
import { isCapabilityEnabled } from '../capability-settings';
import type { ToolDefinition, ToolContext } from './types';
import { ok, fail } from './types';

type RestaurantRow = { id: string };

async function fetchOwnedRestaurant(ctx: ToolContext): Promise<RestaurantRow | null> {
  const { data } = await ctx.supabase
    .from('restaurants')
    .select('id')
    .eq('id', ctx.restaurantId)
    .eq('owner_id', ctx.ownerId)
    .is('deleted_at', null)
    .maybeSingle();
  return data ?? null;
}

export const getRestaurant: ToolDefinition<Record<string, never>, RestaurantRow> = {
  name: 'getRestaurant',
  description: "The current restaurant, verified to belong to the calling owner and not be soft-deleted. Fails (never guesses) if either check doesn't hold.",
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (_input, ctx) => {
    const restaurant = await fetchOwnedRestaurant(ctx);
    if (!restaurant) return fail('Restaurant not found or access denied.');
    return ok(restaurant);
  },
};

export const validateOwnership: ToolDefinition<Record<string, never>, { owns: boolean }> = {
  name: 'validateOwnership',
  description: 'Whether the calling owner actually owns the current restaurant (same query as getRestaurant, boolean-shaped).',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (_input, ctx) => ok({ owns: (await fetchOwnedRestaurant(ctx)) !== null }),
};

// Stub — there is no timezone column on restaurants (or anywhere else) in
// the live schema. lib/menu-discount-actions/schedule.ts resolves schedules
// client-side using the admin's browser as a proxy specifically because of
// this gap. Registered so the need is discoverable rather than silently
// absent; never returns a guessed value.
export const getRestaurantTimezone: ToolDefinition<Record<string, never>, { timezone: null; reason: string }> = {
  name: 'getRestaurantTimezone',
  description: 'Always returns timezone: null — no timezone column exists on restaurants today. Never guesses one.',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async () => ok({ timezone: null, reason: 'No timezone is stored for restaurants in the current schema.' }),
};

export const getCapabilities: ToolDefinition<Record<string, never>, Record<CapabilityKey, boolean>> = {
  name: 'getCapabilities',
  description: "Every registered capability's resolved availability for the current restaurant/owner (Capability Management's 3-scope resolution, one call per key).",
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (_input, ctx) => {
    const keys = Object.keys(CAPABILITY_REGISTRY).filter(isRegisteredCapability);
    const entries = await Promise.all(
      keys.map(async (key) => [key, await isCapabilityEnabled(ctx.serviceClient, { capabilityKey: key, restaurantId: ctx.restaurantId, ownerId: ctx.ownerId })] as const),
    );
    return ok(Object.fromEntries(entries) as Record<CapabilityKey, boolean>);
  },
};

// Single-capability check, distinct from getCapabilities (which resolves
// every registered key at once) — wraps isCapabilityAvailable() exactly as
// messages/route.ts and the apply/target-selection routes already do
// before selecting a tool, registered here for discoverability by a future
// composer that isn't a Restaurant Planner route.
export const validateCapability: ToolDefinition<{ capabilityKey: string }, { available: boolean }> = {
  name: 'validateCapability',
  description: 'Whether one specific capability is available for the current restaurant/owner right now (registry status + Capability Management 3-scope resolution).',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) =>
    ok({ available: await isCapabilityAvailable(ctx.serviceClient, { capabilityKey: input.capabilityKey, restaurantId: ctx.restaurantId, ownerId: ctx.ownerId }) }),
};

export const getRestaurantSettings: ToolDefinition<Record<string, never>, Record<string, unknown>> = {
  name: 'getRestaurantSettings',
  description: 'Key/value settings for the current restaurant (restaurant_settings table) as a flat object. Nothing consumes this yet — registered for future capabilities.',
  capability: 'menu_pricing',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (_input, ctx) => {
    const { data } = await ctx.supabase.from('restaurant_settings').select('key, value').eq('restaurant_id', ctx.restaurantId);
    return ok(Object.fromEntries((data ?? []).map((row) => [row.key, row.value])));
  },
};

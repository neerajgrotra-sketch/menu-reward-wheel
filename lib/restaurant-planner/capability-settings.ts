// Capability Management: resolves whether a specific capability is
// actually turned on for a given restaurant/owner right now, across three
// hierarchical scopes (restaurant > owner > environment — most specific
// wins). This is deliberately separate from lib/intelligence/feature-resolver.ts,
// which still gates the whole dashboard_assistant feature exactly as
// before — this is a second, finer-grained gate the planner's tool-selection
// layer (tool-registry.ts) checks in addition to that one, not instead of it.
//
// Reads capability_settings via the SERVICE client — same reason
// intelligence-engine.ts and generate-route-helpers.ts do: this table (and
// the legacy intelligence_features fallback) is RLS-restricted to
// is_super_admin(), but resolution must work for any authenticated
// restaurant owner's chat turn.

// Deliberately has no dependency on tool-registry.ts (which depends on this
// module for the dynamic half of isCapabilityAvailable) — keeping the
// dependency one-way avoids a circular import between the two.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export type CapabilityScope = 'environment' | 'restaurant' | 'owner';

// The one capability the legacy intelligence_features.enabled flag (for
// feature_key 'dashboard_assistant') ever gated — see the migration comment
// in 20260710030000_capability_settings.sql for why the fallback below is
// scoped to only this key.
const LEGACY_FLAG_CAPABILITY = 'menu_pricing';

// Pure decision logic, split out from the Supabase fetching below so it's
// directly unit-testable without mocking a query client (this codebase's
// established convention — see resolve.ts/schedule.ts — is to keep
// DB-fetching thin and push all real logic into plain functions over
// already-fetched data).
export function resolveCapabilityDecision(params: {
  capabilityKey: string;
  restaurantEnabled: boolean | null;
  ownerEnabled: boolean | null;
  environmentEnabled: boolean | null;
  legacyFlagEnabled: boolean | null;
}): boolean {
  // Most specific wins: a restaurant-level row always overrides an owner or
  // environment default, whether it turns the capability on OR off — an
  // explicit restaurant-level "off" must be able to override an
  // environment-level "on", not just the reverse.
  if (params.restaurantEnabled !== null) return params.restaurantEnabled;
  if (params.ownerEnabled !== null) return params.ownerEnabled;
  if (params.environmentEnabled !== null) return params.environmentEnabled;

  if (params.capabilityKey === LEGACY_FLAG_CAPABILITY) {
    return params.legacyFlagEnabled ?? false;
  }

  // No settings anywhere and no legacy flag to fall back to — safe default
  // is off, matching every non-menu_pricing registry entry's status:'planned'.
  return false;
}

export async function isCapabilityEnabled(
  serviceClient: SupabaseClient<Database>,
  params: { capabilityKey: string; restaurantId: string; ownerId: string },
): Promise<boolean> {
  const { capabilityKey, restaurantId, ownerId } = params;

  const [restaurantRow, ownerRow, environmentRow] = await Promise.all([
    serviceClient
      .from('capability_settings')
      .select('enabled')
      .eq('capability_key', capabilityKey)
      .eq('scope', 'restaurant')
      .eq('scope_id', restaurantId)
      .maybeSingle(),
    serviceClient
      .from('capability_settings')
      .select('enabled')
      .eq('capability_key', capabilityKey)
      .eq('scope', 'owner')
      .eq('scope_id', ownerId)
      .maybeSingle(),
    serviceClient
      .from('capability_settings')
      .select('enabled')
      .eq('capability_key', capabilityKey)
      .eq('scope', 'environment')
      .is('scope_id', null)
      .maybeSingle(),
  ]);

  // The legacy flag is only ever consulted for menu_pricing, and only once
  // nothing in capability_settings answered — no need to fetch it otherwise.
  let legacyFlagEnabled: boolean | null = null;
  if (capabilityKey === LEGACY_FLAG_CAPABILITY && !restaurantRow.data && !ownerRow.data && !environmentRow.data) {
    const { data: legacy } = await serviceClient
      .from('intelligence_features')
      .select('enabled')
      .eq('feature_key', 'dashboard_assistant')
      .maybeSingle();
    legacyFlagEnabled = legacy?.enabled ?? null;
  }

  return resolveCapabilityDecision({
    capabilityKey,
    restaurantEnabled: restaurantRow.data?.enabled ?? null,
    ownerEnabled: ownerRow.data?.enabled ?? null,
    environmentEnabled: environmentRow.data?.enabled ?? null,
    legacyFlagEnabled,
  });
}

// Deterministic, never AI-authored — same convention as
// lib/dashboard-assistant/describe-action.ts / outcome.ts. Used to explain
// unavailability instead of attempting execution (the planner never gets a
// chance to fabricate a reason). Takes a display label rather than looking
// one up itself — see the file header for why (avoids a circular import
// with tool-registry.ts, which owns CAPABILITY_REGISTRY's labels).
export function describeCapabilityUnavailable(capabilityKey: string, label?: string): string {
  return `${label ?? capabilityKey} isn't turned on for this restaurant right now — ask your SpinBite platform admin, or try again later.`;
}

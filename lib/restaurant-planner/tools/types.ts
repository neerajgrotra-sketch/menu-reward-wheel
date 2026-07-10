// The Restaurant Tool Library's contract — every tool in tools/*.ts is
// registered as one of these. Deliberately no runtime schema-validation
// library (this repo has none anywhere — hand-rolled guards throughout,
// e.g. lib/intelligence/actions/menu-discount-schema.ts's isMenuDiscountAction);
// input/output "schemas" are TypeScript types co-located with each tool, not
// a validated wire format.
//
// This is distinct from CAPABILITY_REGISTRY (lib/restaurant-planner/tool-registry.ts),
// which registers *capabilities* (menu_pricing, analytics_agent, ...) despite
// its filename — a pre-existing naming mismatch, not fixed here (renaming it
// would touch every import site for zero functional benefit; see
// docs/architecture/restaurant-tool-library-v1.md for the full explanation).
// TOOL_REGISTRY (registry.ts, this directory) registers individual
// *functions* — each one declares which capability it belongs to via the
// `capability` field below.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { CapabilityKey } from '../tool-registry';

// 'read' — never mutates. 'propose' — builds a not-yet-persisted draft
// (e.g. createPromotionDraft) or writes an append-only conversational
// record (e.g. cancelPromotion's outcome message) but never touches
// business data. 'write' — mutates restaurant data (menu_items, etc.).
// Write tools are registered for documentation/discovery only — exactly as
// today, they are never included in anything the model itself can call;
// only the human-gated apply routes invoke them.
export type ToolPermission = 'read' | 'propose' | 'write';

export type ToolContext = {
  // Session-authenticated client — RLS is the real boundary for everything
  // restaurant-scoped (menu, proposals, conversations). Used by most tools.
  supabase: SupabaseClient<Database>;
  // Service-role client — bypasses RLS, needed only for the handful of tools
  // that read platform tables restricted to is_super_admin() (capability_settings,
  // intelligence_features), same reason lib/intelligence/intelligence-engine.ts
  // and generate-route-helpers.ts already construct one. Cheap to always
  // provide (no I/O to construct); most tools ignore it.
  serviceClient: SupabaseClient<Database>;
  restaurantId: string;
  ownerId: string;
};

export type ToolOutcome<T> = { ok: true; data: T } | { ok: false; reason: string };

export type ToolDefinition<Input, Output> = {
  name: string;
  description: string;
  capability: CapabilityKey;
  permission: ToolPermission;
  mutating: boolean;
  version: number;
  execute: (input: Input, ctx: ToolContext) => Promise<ToolOutcome<Output>>;
};

export function ok<T>(data: T): ToolOutcome<T> {
  return { ok: true, data };
}

export function fail<T>(reason: string): ToolOutcome<T> {
  return { ok: false, reason };
}

// The extension point for future capabilities. Anything that renders a
// Proposal (components/admin/dashboard/ProposalCard.tsx) looks up which
// endpoints to call by `capability` here instead of hardcoding a route
// path, so adding a capability never requires touching the card or the
// chat UI's dispatch logic.
//
// V2 (Restaurant Planner Execution Planner) adds 8 metadata-only stub
// entries for the agents named in the product roadmap — no agent logic, no
// routes, no capability modules exist for these yet. Their purpose today is
// purely declarative: a `PlannerOutput.unsupported.capability` can now name
// a *specific* planned agent (e.g. "analytics_agent") instead of an
// arbitrary free-text string, and `executionPermission: 'none'` on every
// stub is the explicit, checkable statement that none of them can write
// anything — only `menu_pricing` (status: 'active') has real endpoints.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { isCapabilityEnabled, describeCapabilityUnavailable } from './capability-settings';

type ActiveCapability = {
  status: 'active';
  label: string;
  previewEndpoint: string;
  applyEndpoint: string;
};

type PlannedCapability = {
  status: 'planned';
  label: string;
  capabilities: string[];
  supportedActions: string[];
  requiredContext: string[];
  executionPermission: 'none';
};

export const CAPABILITY_REGISTRY = {
  menu_pricing: {
    status: 'active',
    label: 'Menu Pricing',
    previewEndpoint: '/api/admin/menus/discount-action/preview',
    applyEndpoint: '/api/admin/menus/discount-action/apply',
  },
  // Revenue Intelligence Agent V1: read-only analysis + proposal generation,
  // never a direct write of its own — every recommendation converts into an
  // ordinary menu_pricing proposal (see revenue-intelligence.ts), so this
  // capability has no menu-mutating endpoint of its own.
  // previewEndpoint has no separate round trip to point at — opportunities
  // generate inline as part of the normal chat turn (messages/route.ts),
  // same as menu_discount_action itself. Ships disabled by default (no
  // capability_settings row is inserted by this capability's code — see
  // the architecture doc's "non-code rollout steps").
  revenue_intelligence: {
    status: 'active',
    label: 'Revenue Intelligence',
    previewEndpoint: '/api/admin/assistant/messages',
    applyEndpoint: '/api/admin/assistant/revenue-intelligence/create-proposal',
  },
  // Labels below are deliberately restaurant-owner-facing business language
  // ("Marketing Campaigns"), not internal architecture naming ("Campaign
  // Agent") — these strings surface directly in chat via
  // describeUnsupportedRequest/explainCapabilityUnavailable, and "Agent" is
  // implementation vocabulary an owner has no reason to know or care about.
  menu_agent: {
    status: 'planned',
    label: 'Menu Editing',
    capabilities: ['Create, edit, or remove menu items and categories', 'Reorder menu structure', 'Manage item availability'],
    supportedActions: ['create_item', 'update_item', 'archive_item', 'reorder_category'],
    requiredContext: ['menu_snapshot'],
    executionPermission: 'none',
  },
  promotion_agent: {
    status: 'planned',
    label: 'Promotions & Rewards',
    capabilities: ['Create spin-wheel / game promotions', 'Configure rewards and redemption limits'],
    supportedActions: ['create_promotion', 'update_promotion_rewards'],
    requiredContext: ['promotion_snapshot'],
    executionPermission: 'none',
  },
  pricing_agent: {
    status: 'planned',
    label: 'Base Pricing & Bundles',
    capabilities: ['Base price changes', 'Bundle/combo pricing', 'Dynamic pricing rules'],
    supportedActions: ['update_base_price', 'create_bundle'],
    requiredContext: ['menu_snapshot'],
    executionPermission: 'none',
  },
  analytics_agent: {
    status: 'planned',
    label: 'Sales Analytics',
    capabilities: ['Explain sales trends', 'Identify slow/fast movers', 'Compare periods'],
    supportedActions: ['explain_sales_trend', 'compare_periods'],
    requiredContext: ['order_history'],
    executionPermission: 'none',
  },
  campaign_agent: {
    status: 'planned',
    label: 'Marketing Campaigns',
    capabilities: ['Plan and launch marketing campaigns', 'Draft SMS/email/social copy'],
    supportedActions: ['create_campaign'],
    requiredContext: ['restaurant_profile'],
    executionPermission: 'none',
  },
  customer_agent: {
    status: 'planned',
    label: 'Customer Management',
    capabilities: ['Segment customers', 'Manage loyalty and consent', 'Draft targeted offers'],
    supportedActions: ['segment_customers', 'draft_targeted_offer'],
    requiredContext: ['customer_identity'],
    executionPermission: 'none',
  },
  inventory_agent: {
    status: 'planned',
    label: 'Inventory Tracking',
    capabilities: ['Track stock levels', 'Flag low-stock items', 'Auto-86 out-of-stock items'],
    supportedActions: ['flag_low_stock', 'toggle_item_availability'],
    requiredContext: ['inventory_snapshot'],
    executionPermission: 'none',
  },
  ordering_agent: {
    status: 'planned',
    label: 'Order Operations',
    capabilities: ['Kitchen/order workflow changes', 'Order routing rules'],
    supportedActions: ['update_order_routing'],
    requiredContext: ['order_operations_state'],
    executionPermission: 'none',
  },
} satisfies Record<string, ActiveCapability | PlannedCapability>;

export type CapabilityKey = keyof typeof CAPABILITY_REGISTRY;

export function isRegisteredCapability(value: string): value is CapabilityKey {
  return value in CAPABILITY_REGISTRY;
}

// Only true for the one capability with real preview/apply endpoints today —
// anything else in the registry is metadata describing a future agent, not
// something a proposal can actually be built or executed against.
export function isActiveCapability(value: string): boolean {
  return isRegisteredCapability(value) && CAPABILITY_REGISTRY[value].status === 'active';
}

// Capability Management: the single entry point a capability module's route
// checks before doing any real work — combines the static registry (is this
// capability even built and active?) with the dynamic, hierarchically
// scoped capability_settings check (is it turned ON for *this*
// restaurant/owner right now?). A future capability module gets this for
// free by calling the same function with its own key; no planner or
// tool-registry change is needed when it does.
export async function isCapabilityAvailable(
  serviceClient: SupabaseClient<Database>,
  params: { capabilityKey: string; restaurantId: string; ownerId: string },
): Promise<boolean> {
  if (!isActiveCapability(params.capabilityKey)) return false;
  return isCapabilityEnabled(serviceClient, params);
}

// Deterministic explanation for the "recognized capability, currently
// unavailable" case — pulls the registry's display label so the message
// reads naturally ("Menu Pricing isn't turned on...") without
// capability-settings.ts needing to import this file.
export function explainCapabilityUnavailable(capabilityKey: string): string {
  const label = isRegisteredCapability(capabilityKey) ? CAPABILITY_REGISTRY[capabilityKey].label : undefined;
  return describeCapabilityUnavailable(capabilityKey, label);
}

function humanizeCapabilityKey(capabilityKey: string): string {
  return capabilityKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Deterministic fallback for the model's 'unsupported' intent — used only
// when the planner didn't already supply its own `note` (see
// app/api/admin/assistant/messages/route.ts). Per the product standard,
// "capability unavailable" must never be a dead end: name what IS built
// today (every 'active' registry entry) alongside what was actually asked
// for, instead of a bare "not supported yet."
export function describeUnsupportedRequest(capabilityKey: string): string {
  const activeLabels = Object.values(CAPABILITY_REGISTRY)
    .filter((entry) => entry.status === 'active')
    .map((entry) => entry.label);
  const requestedLabel = isRegisteredCapability(capabilityKey) ? CAPABILITY_REGISTRY[capabilityKey].label : humanizeCapabilityKey(capabilityKey);

  const capabilitiesLine =
    activeLabels.length > 0
      ? `I can currently help with ${activeLabels.join(' and ')}.`
      : "I can't take action on your restaurant's data yet — I can still answer questions.";

  return `${capabilitiesLine} ${requestedLabel} isn't enabled for this restaurant yet.`;
}

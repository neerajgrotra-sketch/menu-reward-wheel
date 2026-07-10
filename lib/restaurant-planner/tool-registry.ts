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
  menu_agent: {
    status: 'planned',
    label: 'Menu Agent',
    capabilities: ['Create, edit, or remove menu items and categories', 'Reorder menu structure', 'Manage item availability'],
    supportedActions: ['create_item', 'update_item', 'archive_item', 'reorder_category'],
    requiredContext: ['menu_snapshot'],
    executionPermission: 'none',
  },
  promotion_agent: {
    status: 'planned',
    label: 'Promotion Agent',
    capabilities: ['Create spin-wheel / game promotions', 'Configure rewards and redemption limits'],
    supportedActions: ['create_promotion', 'update_promotion_rewards'],
    requiredContext: ['promotion_snapshot'],
    executionPermission: 'none',
  },
  pricing_agent: {
    status: 'planned',
    label: 'Pricing Agent',
    capabilities: ['Base price changes', 'Bundle/combo pricing', 'Dynamic pricing rules'],
    supportedActions: ['update_base_price', 'create_bundle'],
    requiredContext: ['menu_snapshot'],
    executionPermission: 'none',
  },
  analytics_agent: {
    status: 'planned',
    label: 'Analytics Agent',
    capabilities: ['Explain sales trends', 'Identify slow/fast movers', 'Compare periods'],
    supportedActions: ['explain_sales_trend', 'compare_periods'],
    requiredContext: ['order_history'],
    executionPermission: 'none',
  },
  campaign_agent: {
    status: 'planned',
    label: 'Campaign Agent',
    capabilities: ['Plan and launch marketing campaigns', 'Draft SMS/email/social copy'],
    supportedActions: ['create_campaign'],
    requiredContext: ['restaurant_profile'],
    executionPermission: 'none',
  },
  customer_agent: {
    status: 'planned',
    label: 'Customer Agent',
    capabilities: ['Segment customers', 'Manage loyalty and consent', 'Draft targeted offers'],
    supportedActions: ['segment_customers', 'draft_targeted_offer'],
    requiredContext: ['customer_identity'],
    executionPermission: 'none',
  },
  inventory_agent: {
    status: 'planned',
    label: 'Inventory Agent',
    capabilities: ['Track stock levels', 'Flag low-stock items', 'Auto-86 out-of-stock items'],
    supportedActions: ['flag_low_stock', 'toggle_item_availability'],
    requiredContext: ['inventory_snapshot'],
    executionPermission: 'none',
  },
  ordering_agent: {
    status: 'planned',
    label: 'Ordering Agent',
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

// The menu_edit capability's action contract — one variant of the Restaurant
// Planner's structured output (lib/restaurant-planner/types.ts), sibling to
// menu_pricing's MenuDiscountAction (menu-discount-schema.ts). Persistent
// catalog changes (price, name, description, category, visibility, tags) —
// never a temporary/schedulable overlay, which stays menu_pricing's job.
//
// `target`/`action` reference menu content by name, never by ID — same
// invariant as menu_pricing: the model is shown real category/item names in
// its prompt context but never invents a UUID; resolving a name to a real
// row happens in lib/menu-edit-actions/resolve.ts, not here.
//
// MenuEditTarget is deliberately NOT imported from menu-discount-schema.ts's
// DiscountTarget even though it's structurally identical — see the "Target
// resolution reuse" section of docs/architecture/menu-editing-capability-
// boundary-audit-v1.md and the approved implementation plan: extracting a
// shared scope type would require editing menu_pricing's own files, which
// this build was explicitly instructed not to touch. The duplication is
// small and this shape hasn't changed since Phase 1 of menu_pricing.
export type MenuEditTarget =
  | { scope: 'all' }
  | { scope: 'category'; name: string; exclude?: string[] }
  | { scope: 'item'; name: string }
  | { scope: 'items'; names: string[] }
  | { scope: 'name_contains'; query: string; exclude?: string[] };

export type PriceAdjustment = {
  direction: 'increase' | 'decrease';
  amount: { kind: 'percentage' | 'fixed'; value: number };
};

// The 12 V1 operations collapse into 7 action types — "increase/decrease/
// bulk price" is one adjust_price type parameterized by direction and
// target scope; "hide/show" is one set_availability type; "chef special/
// popular/featured" is one set_tag type. 'featured' writes menu_items'
// dedicated is_featured boolean column; 'chef_special'/'popular' write
// string literals inside the tags array — that representation difference is
// handled in resolve.ts's before/after computation, not exposed here.
export type MenuEditAction =
  | { type: 'set_price'; target: MenuEditTarget; price: number }
  | { type: 'adjust_price'; target: MenuEditTarget; adjustment: PriceAdjustment }
  | { type: 'rename_item'; target: MenuEditTarget; name: string }
  | { type: 'update_description'; target: MenuEditTarget; description: string }
  | { type: 'move_category'; target: MenuEditTarget; toCategoryName: string }
  | { type: 'set_availability'; target: MenuEditTarget; available: boolean }
  | { type: 'set_tag'; target: MenuEditTarget; tag: 'featured' | 'chef_special' | 'popular'; enabled: boolean };

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string' && v.trim().length > 0);
}

function isExcludeList(value: unknown): value is string[] | undefined {
  return value === undefined || isNonEmptyStringArray(value);
}

// Exported so lib/menu-edit-actions/resolve.ts's isResolvableMenuEditAction
// can reuse it for the target portion of its shape check, same pattern as
// menu-discount-schema.ts's isDiscountTarget.
export function isMenuEditTarget(value: unknown): value is MenuEditTarget {
  if (typeof value !== 'object' || value === null) return false;
  const target = value as Record<string, unknown>;
  if (target.scope === 'all') return true;
  if (target.scope === 'category') {
    return typeof target.name === 'string' && target.name.trim().length > 0 && isExcludeList(target.exclude);
  }
  if (target.scope === 'item') {
    return typeof target.name === 'string' && target.name.trim().length > 0;
  }
  if (target.scope === 'items') {
    return isNonEmptyStringArray(target.names);
  }
  if (target.scope === 'name_contains') {
    return typeof target.query === 'string' && target.query.trim().length > 0 && isExcludeList(target.exclude);
  }
  return false;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isPriceAdjustment(value: unknown): value is PriceAdjustment {
  if (typeof value !== 'object' || value === null) return false;
  const adjustment = value as Record<string, unknown>;
  if (adjustment.direction !== 'increase' && adjustment.direction !== 'decrease') return false;
  const amount = adjustment.amount as Record<string, unknown> | undefined;
  if (typeof amount !== 'object' || amount === null) return false;
  if (amount.kind !== 'percentage' && amount.kind !== 'fixed') return false;
  if (!isPositiveFiniteNumber(amount.value)) return false;
  if (amount.kind === 'percentage' && (amount.value as number) >= 100) return false;
  return true;
}

export function isMenuEditAction(value: unknown): value is MenuEditAction {
  if (typeof value !== 'object' || value === null) return false;
  const action = value as Record<string, unknown>;
  if (!isMenuEditTarget(action.target)) return false;

  switch (action.type) {
    case 'set_price':
      return isPositiveFiniteNumber(action.price);
    case 'adjust_price':
      return isPriceAdjustment(action.adjustment);
    case 'rename_item':
      return isNonEmptyString(action.name);
    case 'update_description':
      return typeof action.description === 'string';
    case 'move_category':
      return isNonEmptyString(action.toCategoryName);
    case 'set_availability':
      return typeof action.available === 'boolean';
    case 'set_tag':
      return (
        (action.tag === 'featured' || action.tag === 'chef_special' || action.tag === 'popular') &&
        typeof action.enabled === 'boolean'
      );
    default:
      return false;
  }
}

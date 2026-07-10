// The menu_pricing capability's action contract — one variant of the
// Restaurant Planner's structured output (lib/restaurant-planner/types.ts).
// `target`/`action` reference menu content by name, never by ID — the model
// is shown real category/item names in its prompt context (menu snapshot,
// lib/restaurant-planner/context.ts) but never invents a UUID; resolving a
// name to a real row happens in lib/menu-discount-actions/resolve.ts, not
// here.

// V2 (Restaurant Planner Execution Planner): 'category' gained an optional
// `exclude`, and two scopes were added — 'items' (an explicit, planner- or
// checkbox-selected set of names) and 'name_contains' (every item whose name
// matches a fragment, applied to ALL matches rather than treated as
// ambiguous — see resolve.ts's resolveTargetItems). The three original
// variants ('all' | 'category' without exclude | 'item') are unchanged; old
// persisted actions and an old prompt template's output still validate and
// resolve identically.
export type DiscountTarget =
  | { scope: 'all' }
  | { scope: 'category'; name: string; exclude?: string[] }
  | { scope: 'item'; name: string }
  | { scope: 'items'; names: string[] }
  | { scope: 'name_contains'; query: string; exclude?: string[] };

export type DiscountSpec = {
  discountType: 'percentage' | 'fixed_price';
  value: number;
  startTime?: string;
  noExpiry?: boolean;
  // V2: 'tomorrow' lets "start tomorrow at 7 PM" be expressed without a new
  // date format — resolveDiscountSchedule (lib/menu-discount-actions/schedule.ts)
  // adds a day before applying startTime. Omitted/'today' is unchanged behavior.
  dayOffset?: 'today' | 'tomorrow';
};

export type MenuDiscountAction =
  | { type: 'clear_discount'; target: DiscountTarget }
  | { type: 'set_discount'; target: DiscountTarget; discount: DiscountSpec };

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string' && v.trim().length > 0);
}

function isExcludeList(value: unknown): value is string[] | undefined {
  return value === undefined || isNonEmptyStringArray(value);
}

// Exported so lib/menu-discount-actions/resolve.ts's isResolvableAction can
// reuse it for the target portion of its shape check — ResolvableAction's
// target field is this exact DiscountTarget type, so validating it twice
// with separately-maintained logic would only risk the two drifting apart.
export function isDiscountTarget(value: unknown): value is DiscountTarget {
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

// Exported (Restaurant Tool Library) so lib/restaurant-planner/tools/pricing.ts's
// validateDiscount can reuse these exact bounds checks as a standalone,
// directly-callable tool instead of reimplementing them — same reasoning as
// isDiscountTarget's export above.
export function isDiscountSpec(value: unknown): value is DiscountSpec {
  if (typeof value !== 'object' || value === null) return false;
  const spec = value as Record<string, unknown>;
  if (spec.discountType !== 'percentage' && spec.discountType !== 'fixed_price') return false;
  if (typeof spec.value !== 'number' || !Number.isFinite(spec.value) || spec.value <= 0) return false;
  if (spec.discountType === 'percentage' && spec.value >= 100) return false;
  if (spec.startTime !== undefined && typeof spec.startTime !== 'string') return false;
  if (spec.noExpiry !== undefined && typeof spec.noExpiry !== 'boolean') return false;
  if (spec.dayOffset !== undefined && spec.dayOffset !== 'today' && spec.dayOffset !== 'tomorrow') return false;
  return true;
}

export function isMenuDiscountAction(value: unknown): value is MenuDiscountAction {
  if (typeof value !== 'object' || value === null) return false;
  const action = value as Record<string, unknown>;
  if (action.type === 'clear_discount') return isDiscountTarget(action.target);
  if (action.type === 'set_discount') return isDiscountTarget(action.target) && isDiscountSpec(action.discount);
  return false;
}

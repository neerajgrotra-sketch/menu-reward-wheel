// Contract for dashboard_assistant's structured output. The model returns
// JSON matching this shape instead of prose, so a request like "remove
// discounts from desserts" can become a real action instead of just an
// answer. `target`/`action` reference menu content by name, never by ID —
// the model is shown real category/item names in its prompt context but
// never invents a UUID; resolving a name to a real row happens in
// lib/menu-discount-actions/resolve.ts, not here.

export type DiscountTarget =
  | { scope: 'all' }
  | { scope: 'category'; name: string }
  | { scope: 'item'; name: string };

export type DiscountSpec = {
  discountType: 'percentage' | 'fixed_price';
  value: number;
  startTime?: string;
  noExpiry?: boolean;
};

export type MenuDiscountAction =
  | { type: 'clear_discount'; target: DiscountTarget }
  | { type: 'set_discount'; target: DiscountTarget; discount: DiscountSpec };

export type DashboardAssistantOutput =
  | { intent: 'answer'; answer: string }
  | { intent: 'menu_discount_action'; action: MenuDiscountAction };

export class DashboardAssistantParseError extends Error {
  constructor(reason: string) {
    super(`Could not parse dashboard_assistant output: ${reason}`);
    this.name = 'DashboardAssistantParseError';
  }
}

function isDiscountTarget(value: unknown): value is DiscountTarget {
  if (typeof value !== 'object' || value === null) return false;
  const target = value as Record<string, unknown>;
  if (target.scope === 'all') return true;
  if (target.scope === 'category' || target.scope === 'item') {
    return typeof target.name === 'string' && target.name.trim().length > 0;
  }
  return false;
}

function isDiscountSpec(value: unknown): value is DiscountSpec {
  if (typeof value !== 'object' || value === null) return false;
  const spec = value as Record<string, unknown>;
  if (spec.discountType !== 'percentage' && spec.discountType !== 'fixed_price') return false;
  if (typeof spec.value !== 'number' || !Number.isFinite(spec.value) || spec.value <= 0) return false;
  if (spec.discountType === 'percentage' && spec.value >= 100) return false;
  if (spec.startTime !== undefined && typeof spec.startTime !== 'string') return false;
  if (spec.noExpiry !== undefined && typeof spec.noExpiry !== 'boolean') return false;
  return true;
}

function isMenuDiscountAction(value: unknown): value is MenuDiscountAction {
  if (typeof value !== 'object' || value === null) return false;
  const action = value as Record<string, unknown>;
  if (action.type === 'clear_discount') return isDiscountTarget(action.target);
  if (action.type === 'set_discount') return isDiscountTarget(action.target) && isDiscountSpec(action.discount);
  return false;
}

export function parseDashboardAssistantOutput(raw: string): DashboardAssistantOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DashboardAssistantParseError('output was not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new DashboardAssistantParseError('output was not a JSON object');
  }
  const obj = parsed as Record<string, unknown>;

  if (obj.intent === 'answer') {
    if (typeof obj.answer !== 'string' || obj.answer.trim().length === 0) {
      throw new DashboardAssistantParseError('answer intent missing a non-empty "answer" string');
    }
    return { intent: 'answer', answer: obj.answer };
  }

  if (obj.intent === 'menu_discount_action') {
    if (!isMenuDiscountAction(obj.action)) {
      throw new DashboardAssistantParseError('menu_discount_action intent had a malformed "action"');
    }
    return { intent: 'menu_discount_action', action: obj.action };
  }

  throw new DashboardAssistantParseError(`unrecognized intent "${String(obj.intent)}"`);
}

// The capability-agnostic proposal model — deferred in Phase 1 (the
// discount-specific preview/apply round trip stood in for it), built now
// because V2 needs a real persisted, versioned entity (see the
// restaurant_planner_proposals migration). Every field here is generic
// enough for a future Pricing/Promotion/Analytics capability to reuse
// without changes; capability-specific logic (matching menu_pricing's
// MatchKind to a Confidence, building its plan_tasks template) lives in
// capabilities/menu-pricing.ts, not here.

export type ProposalStatus = 'draft' | 'modified' | 'approved' | 'cancelled' | 'executed';

export type Confidence = 'high' | 'medium' | 'low';

export type PlanTaskStatus = 'pending' | 'completed' | 'blocked' | 'failed';

// A fixed, per-capability step list populated as the server walks its
// pipeline — explainability data, not a graph-execution engine. Storing it
// as plain objects (rather than building a scheduler around it) means a
// real dependency graph can be layered on later, once a capability
// genuinely needs branching/parallel steps, without a storage migration.
export type PlanTask = {
  id: string;
  label: string;
  status: PlanTaskStatus;
};

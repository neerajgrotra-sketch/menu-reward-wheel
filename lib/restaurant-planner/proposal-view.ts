// The capability-agnostic display view-model ProposalCard.tsx actually
// renders. Deliberately separate from proposal.ts (which scopes itself to
// the persisted/versioned proposal MODEL — ProposalStatus/Confidence/
// PlanTask) — this is a different concern, the shape a capability's preview
// route hands to the UI, not what gets stored.
//
// Introduced alongside the menu_edit capability: ProposalCard.tsx was
// previously coupled directly to menu_pricing's ResolvedDiscountItem/
// ResolvableAction shapes despite claiming to be capability-generic (see
// docs/architecture/menu-editing-capability-boundary-audit-v1.md). Every
// capability's preview route now composes these two shapes — via
// lib/menu-discount-actions/proposal-copy.ts for menu_pricing (a verbatim
// relocation of the label logic that used to live in ProposalCard.tsx,
// zero behavior change) and lib/menu-edit-actions/proposal-copy.ts for
// menu_edit — so the card itself never needs to know which capability it's
// rendering.

export type ProposalItemView = {
  id: string;
  name: string;
  categoryName: string;
  beforeLabel: string;
  afterLabel: string;
  badge?: string;
};

export type ProposalCopy = {
  title: string;
  // Short, lowercase restatement used only to prefill the "Modify" chat
  // draft — distinct from `title` so that text doesn't have to be scraped
  // back out of the headline-style title.
  shortSummary: string;
  recommendationText: string;
  objectiveText: string;
  // undefined => the card's "Schedule" section is hidden entirely. Only
  // menu_pricing sets this — menu_edit changes are immediate and permanent,
  // no schedule concept.
  scheduleText?: string;
  // undefined => the card's "Visibility" section is hidden entirely.
  visibilityChannels?: string[];
  afterApprovalSteps: string[];
};

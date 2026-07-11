// Shared by ProposalCard and RevenueOpportunityList — previously copy-pasted
// verbatim in both files.
export const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-[#E7F3EC] text-[#1F8A5B]',
  medium: 'bg-[#FBF0DF] text-[#A9600B]',
  low: 'bg-[#FBEAE6] text-[#C1442D]',
};

// The owner-facing Decision Summary tier ("Should I Do This?") — a distinct
// 4-tier scale from Confidence above, so it gets its own palette rather than
// reusing CONFIDENCE_STYLE's 3 tones.
export const DECISION_TIER_STYLE: Record<string, string> = {
  strong: 'bg-[#E7F3EC] text-[#1F8A5B]',
  good: 'bg-[#FBF0DF] text-[#A9600B]',
  moderate: 'bg-[#FFF0E0] text-[#FF6B00]',
  weak: 'bg-[#FBEAE6] text-[#C1442D]',
};

-- Fixes a naming/semantic gap from the previous migration: messages.proposal_group_id
-- points at restaurant_planner_proposals(id), but for any version after the
-- first, a row's own `id` is NOT the same as its (stable) `proposal_group_id`.
-- A message needs BOTH:
--   - proposal_group_id: the stable anchor used to find "is this proposal
--     thread still open" (refersToProposalId verification, transcript
--     tagging) — unaffected by which specific version is current.
--   - proposal_id (new): the exact version row THIS message represents, for
--     faithful historical rendering on reload — an older chat bubble must
--     keep showing the resolved_snapshot/confidence/reasoning it had at the
--     time, not whatever the group's latest version now is.

alter table public.dashboard_assistant_messages
  add column proposal_id uuid references public.restaurant_planner_proposals(id) on delete set null;

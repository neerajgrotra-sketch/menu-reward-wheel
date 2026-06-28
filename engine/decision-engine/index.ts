// ── SpinBite Decision Engine V1 ───────────────────────────────────────────────
//
// Entry point. Import from here in API routes and future real-time workers.
//
// Decision cycle (single table, one invocation):
//
//   const state       = buildSessionState(events, session);
//   const opps        = detectOpportunities(state);
//   const best        = selectBestIntervention(opps);
//   if (best) {
//     const action    = interventionToAction(best, session.id, session.restaurant_id);
//     const result    = await dispatcher(action);
//   }

export type {
  SessionContext,
  SessionState,
  ViewedItem,
  CartItem,
  RemovedCartItem,
  PlacedOrder,
  OpportunityType,
  Opportunity,
  ActionType,
  Intervention,
  DispatchAction,
  DispatchResult,
} from './types';

export { buildSessionState }      from './session-state';
export { detectOpportunities }    from './opportunity-detector';
export { resolveInterventions, selectBestIntervention } from './intervention-policy';
export { dispatcher, interventionToAction, CHANNELS }   from './dispatcher';

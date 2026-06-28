// ── Session Presence Engine V1 — Public API ───────────────────────────────────

export type {
  GuestStatus,
  SessionGuest,
  JoinSessionResult,
  HeartbeatResult,
  ActiveGuestCountResult,
} from './types';

export { resolveSessionJoin } from './join-session';
export { updateGuestPresence, sweepStaleGuests } from './presence-heartbeat';
export { getActiveGuestCount } from './guest-counter';
export {
  sessionPresenceChannel,
  restaurantSessionsChannel,
} from './realtime-channels';

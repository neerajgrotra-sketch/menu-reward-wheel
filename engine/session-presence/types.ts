// ── Session Presence Engine V1 — Shared Types ─────────────────────────────────
//
// All domain types for per-device presence tracking.
// Functions live in their respective feature files; types live here.

export type GuestStatus = 'active' | 'inactive' | 'disconnected' | 'blocked';

// ── DB record shape ───────────────────────────────────────────────────────────

export type SessionGuest = {
  id: string;
  session_id: string;
  restaurant_id: string;
  guest_token: string;
  guest_name: string | null;
  device_fingerprint: string;
  user_agent: string | null;
  joined_at: string;
  last_seen_at: string;
  status: GuestStatus;
};

// ── Engine return types ───────────────────────────────────────────────────────

export type JoinSessionResult = {
  session_id: string;
  guest_id: string;
  guest_token: string;
  is_new_session: boolean;
  is_new_device: boolean;
  session_access_code: string;
};

export type HeartbeatResult = {
  updated: boolean;
  status: GuestStatus | null;
  // false when the parent session is no longer active — frontend must redirect
  session_active: boolean;
};

export type ActiveGuestCountResult = {
  count: number;
};

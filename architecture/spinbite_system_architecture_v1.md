# SpinBite System Architecture V1

**Document version:** 1.0
**Date:** 2026-06-29
**Status:** Current — reflects codebase as of 2026-06-29
**Supersedes:** n/a (new document; canonical platform overview)
**See also:** `/docs/architecture/spinbite-platform-architecture-v4.md` (product decisions + security invariants)

---

## 1. Platform Mission

SpinBite is an AI-first restaurant revenue operating system. The current product is a multi-tenant QR dining platform. The long-term north star is an AI system that monitors every dining session in real time and intervenes to maximize revenue through personalized offers, promotions, and intelligent waiter notifications.

---

## 2. System Layer Map

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          CUSTOMER SURFACE                                │
│  /r/{slug}?tp={code}   (public QR menu + ordering + session tracking)   │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │ QR scan → session resolve
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       SESSION LAYER (real-time)                          │
│  visit_sessions  ·  session_guests  ·  heartbeat  ·  presence channels  │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │ events feed
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     INTELLIGENCE LAYER (analysis)                        │
│  session_events  ·  session-intelligence.ts  ·  Decision Engine V1      │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │ admin reads
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          ADMIN SURFACE                                   │
│  /admin/sessions  (live dining intelligence + manual session control)    │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                    COMMERCE + ENGAGEMENT LAYER                           │
│  Promotions · Games · Rewards · Coupons · Orders · Order Tracker         │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                       CONTENT + AI LAYER                                 │
│  Menu Builder · Intelligence Engine · Food Image Generation              │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Major Subsystems

| Subsystem | Status | Purpose |
|---|---|---|
| QR Menu + Ordering | Live | Customer-facing menu browsing, cart, order submission |
| Touchpoint Management | Live | Restaurant physical locations (tables, kiosks, etc.) |
| Session Lifecycle Engine | Live | QR scan → session create/reuse → session end |
| Session Presence Engine | Live | Per-device heartbeat, guest count, stale sweep |
| Session Events (Behavioral Log) | Live | Append-only relational behavioral intelligence |
| Session Intelligence Engine V2 | Live | Pure-TS reconstruction + behavior analysis |
| Decision Engine V1 | Architecture | Pure-TS opportunity detection + intervention policy (dispatcher stubs only) |
| intervention_events | Live (schema) | Append-only log for future dispatcher output |
| Promotions + Game Engine | Live | Spin wheel, scratch card, reward pool |
| AI Intelligence Layer | Live | Text generation, food image generation, prompt management |
| Admin Sessions Page | Live | Real-time session monitoring + intelligence panel |

---

## 4. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password) |
| Realtime | Supabase Realtime (postgres_changes + Broadcast REST) |
| Storage | Supabase Storage |
| AI — text | Anthropic Claude (Haiku / Sonnet) |
| AI — image | Google Vertex AI (Imagen 3) + Gemini Pro fallback |
| Hosting | Vercel |
| Language | TypeScript |

---

## 5. Public Route Inventory

| Route | Audience | Purpose |
|---|---|---|
| `/r/[restaurantSlug]` | Customers | QR menu, ordering, session presence |
| `/r/[restaurantSlug]?tp={code}` | Customers | Touchpoint-scoped QR entry (table/kiosk) |
| `/r/order/[orderId]` | Customers | Live order status tracker |
| `/play/[restaurantSlug]/[promotionSlug]` | Customers | Promotion game play |
| `/admin` | Restaurant owners | Dashboard |
| `/admin/sessions` | Restaurant owners | Live dining session intelligence |
| `/admin/restaurants` | Restaurant owners | Restaurant management |
| `/admin/menu` | Restaurant owners | Menu builder |
| `/admin/orders` | Restaurant owners | Order inbox |
| `/admin/promotions` | Restaurant owners | Promotion management |
| `/super-admin/intelligence-lab` | SpinBite staff | Prompt management, AI experiments |

---

## 6. End-to-End Session Lifecycle (Data Flow)

```
Customer scans table QR code
  URL: /r/{slug}?tp={touchpoint_code}
  ↓
Client resolves touchpoint: touchpoint_code → touchpoint_id
  POST /api/public/sessions/resolve
    { restaurant_id, touchpoint_id, device_fingerprint, known_session_id, user_agent }
  ↓
resolveSessionJoin() [engine/session-presence/join-session.ts]
  1. Find active session for touchpoint (visit_sessions WHERE status='active')
  2a. Session fresh → reuse → create session_guests row
  2b. Session stale/missing → abandon old → INSERT new visit_session + session_guests
  3. If new device on existing session → increment_guest_count() RPC
  ↓
Response: { visit_session_id, guest_token, session_access_code, touchpoint_name, is_new_session }
  ↓
Client: sessionPhase = 'confirmed', confirmedSessionId set
  ↓
Client fires MENU_OPENED event → POST /api/public/sessions/{id}/track
  ↓
Customer browses menu → ITEM_VIEWED, ITEM_VIEW_DURATION events fire
Customer adds to cart → ITEM_ADDED_TO_CART fires
Customer places order → POST /api/public/orders
  Server writes ORDER_PLACED to session_events
  Server calls increment_session_counters() RPC
  ↓
Heartbeat loop (every 30s):
  POST /api/public/sessions/{id}/heartbeat { guest_token }
  → refreshes session_guests.last_seen_at
  → returns { active: true|false }
  → active: false → client navigates to session-ended page
  ↓
Admin ends session:
  PATCH /api/admin/sessions/{id}/end
  → status = 'completed', ended_at = now()
  → disconnect_session_guests() RPC (all guests → disconnected)
  → INSERT SESSION_ENDED to session_events (fire-and-forget)
  → POST Supabase Broadcast REST: session-lifecycle:{sessionId} 'session_ended'
  → Customer page receives broadcast → redirects instantly
  ↓
Admin views intelligence:
  GET /api/admin/sessions/{id}/intelligence
  → loads session_events (all events)
  → loads orders + order_items for session
  → reconstructSession() → SessionIntelligence
  → analyzeSessionBehavior() → BehavioralIntelligence
  → returns combined JSON to admin panel
```

---

## 7. Critical Path Services

These are the systems that must succeed for a customer to complete a dining action. Any failure here is user-visible.

| Service | Critical? | If it fails |
|---|---|---|
| `POST /api/public/sessions/resolve` | CRITICAL | Customer can't get a session → can't track or order |
| `POST /api/public/orders` | CRITICAL | Customer can't place order |
| `GET /r/[restaurantSlug]` | CRITICAL | Customer sees no menu |
| Supabase (DB) | CRITICAL | Entire platform down |
| Supabase Auth | CRITICAL | Admin can't log in |

---

## 8. Non-Critical Telemetry Systems

These are instrumentation systems. Failures must be fire-and-forget and must NEVER block critical path.

| System | If it fails |
|---|---|
| `session_guests` INSERT on resolve | Presence tracking degrades; session resolves anyway |
| `session_events` INSERT on track | Behavioral log incomplete; ordering unaffected |
| `increment_guest_count()` RPC | Guest count may lag; session stays active |
| `disconnect_session_guests()` RPC | Tokens not immediately invalidated; next heartbeat catches it |
| `SESSION_ENDED` event insert | Intelligence timeline incomplete; session still ended |
| Supabase Broadcast on session end | Customer page falls back to heartbeat (30s delay) |
| Decision Engine cycle | No intervention fired; nothing visible to customer |
| `intervention_events` INSERT | Intervention not logged; no customer impact |

---

## 9. Graceful Degradation Rules

1. **Session resolution always completes.** `session_guests` INSERT failure is caught and swallowed in `resolveSessionJoin()`. The session ID is still returned.
2. **Session events never block.** The track route returns 204 regardless of whether `session_events.insert` succeeds.
3. **Heartbeat session liveness is the safety net.** If Supabase Broadcast fails on session end, the customer's 30s heartbeat returns `{ active: false }` and redirects them.
4. **Order 409 is the final safety net.** If a customer somehow retains a stale session ID and places an order, the orders API returns `409 SESSION_INVALID`, preventing orphaned orders.
5. **Intelligence load never blocks the admin UI.** Intelligence is lazy-loaded on card expand. A failed intelligence fetch shows an inline error; the sessions list remains visible and functional.
6. **The Decision Engine is purely analytical.** It has no connection to the DB or the customer UI. Dispatcher stubs currently log to console only. No customer is impacted.

---

## 10. Production Deployment Rules

1. All schema changes require a migration file in `supabase/migrations/`.
2. Migrations are named `YYYYMMDDHHMMSS_scope_name.sql`.
3. Every migration must include a rollback reference comment block.
4. RLS must be enabled on every new table.
5. No `using (true)` policies on platform, session, or intelligence tables.
6. Service role key is never exposed to the client.
7. Before deploying: run `npm run lint` and `npx tsc --noEmit`.
8. After merging to main: verify Vercel deployment SHA matches the merge commit.
9. After Vercel deploy: smoke test the public QR scan flow end-to-end.
10. Architecture documentation must be updated when any of the following change: migrations, API routes, engine files, realtime channels.

# SpinBite

SpinBite is an AI-first restaurant revenue operating system. A restaurant scans one QR code onto every table, counter, or pickup point; a diner scans it to get a live menu, order directly (commission-free), and optionally play a quick game — spin the wheel, mystery box, scratch card — for a real reward tied to real menu items. Every interaction is captured as structured behavioral data, which powers session-level intelligence (who's at the table, what they're into, whether it's worth a nudge from staff) and — long-term — AI-driven revenue optimization.

Near-term the platform is built around one stable primitive chain: **menu → item → promotion → reward → coupon → customer → campaign**. Every feature has to serve that chain before AI automation is layered on top.

## Platform engines

| Engine | Purpose |
|---|---|
| Merchant OS | Admin: restaurants, menus, categories, items, merchandising |
| Commerce Engine | Sales-lift promotions — item/category/restaurant discounts |
| Engagement Engine | Game-based capture — spin wheel, scratch card, mystery box, weighted reward pool |
| Customer Experience Layer | QR menu, filter chips, ordering, promotion widget |
| Session & Behavioral Intelligence | Live session presence, per-guest event tracking, decision runtime (e.g. autonomous waiter notifications) |
| Customer Intelligence Engine | Phone-as-identity, anonymous-first, progressive enrichment |
| AI Content Engine | Claude-generated menu descriptions, Vertex AI food photography |
| Communication Engine *(future)* | SMS / push / email / wallet — restaurant owns the relationship |
| POS / Ordering Layer *(future)* | POS as system of record |
| AI Revenue Optimization *(north star)* | Natural-language revenue goals → AI proposes/executes |

## What it does today

- **Restaurant admins** manage one or more locations (multi-tenant, `owner_id`-scoped), build a real menu (sections, items, images, AI-generated descriptions, time-boxed special pricing), toggle commission-free ordering per restaurant, and build promotions with a registry-driven builder: pick a game, configure weighted rewards backed by real menu items, schedule, and publish.
- **Diners** scan a QR code tied to a restaurant or a specific touchpoint (table, patio, counter, pickup), browse the live menu, add items to a cart and order directly, and/or play the promotion's game for a coupon — redeemed instantly, no app download.
- **Staff** get a live orders inbox, a session view showing who's active at each touchpoint with named-guest behavioral summaries, and — via the Decision Runtime — real-time nudges (e.g. "table showing high interest but hasn't ordered") without any client-side popups or blocking AI calls.
- **Super admins** manage the game catalog, editable homepage/marketing content, and the Intelligence Lab (prompt templates, A/B experiments, generation cost/usage logs) through `/super-admin`.

### Games

Games are self-contained contracts resolved through a central registry (`lib/games/registry.ts`) — the builder and play runtime render games from the registry, not hardcoded branches:

- Spin Wheel (`spin_wheel` / `wheel`)
- Mystery Box (`mystery_box`)
- Scratch Card (`scratch_card`)
- Open The Door (`open_the_door`)
- Reward Reels (`reward_reels`, beta)

Adding a new game means adding a contract folder under `lib/games/` and registering it. See `docs/architecture/game-creation-framework.md`.

## Tech stack

- **Next.js 14** (App Router), **React 18**, **TypeScript**
- **Tailwind CSS** + **Framer Motion**
- **Supabase** — Postgres, Auth, Row Level Security, Storage, and Realtime (`postgres_changes` + Broadcast) for live session/order updates
- **Anthropic Claude** (Haiku/Sonnet) for menu description generation and prompt enhancement; **Google Vertex AI** (Gemini 2.5 Flash Image) for AI food photography — both routed through a database-driven Intelligence Engine, never called directly from feature code
- **canvas-confetti** (win effects), **qr-scanner** (coupon validation), **lucide-react** (icons)
- Auth gating in `middleware.ts` (admin routes require a Supabase session)
- Deployed on **Vercel**, auto-deploying from `main`

## Project structure

```
app/                  Next.js routes
  api/                Route handlers — public ordering/sessions/promotions, admin intelligence/coupons/sessions
  r/[slug]/            Public QR menu (restaurant- and touchpoint-scoped)
  play/                Customer game play pages
  admin/               Restaurant admin — menu, promotions, orders, restaurants, sessions
  super-admin/         Game catalog, site content CMS, Intelligence Lab
components/            React UI — games, promotion builder, admin, public menu, home/landing sections
engine/
  session-presence/    Join-session, presence heartbeat, guest counter, realtime channel builders
  decision-runtime/     evaluateSession() — autonomous opportunity detection + staff notification
lib/
  games/               Per-game contracts + central registry
  game-pool/           Weighted game selection and promotion-to-game resolution
  intelligence/        AI content-generation engine (providers, prompt/feature resolution)
  session-intelligence.ts  Pure-TS behavioral analysis (per-guest profiling, cross-guest insights)
  rewards.ts           Reward selection and coupon helpers
  supabase/            Server and client Supabase helpers
supabase/              SQL schema and migrations (see setup note below)
architecture/          Session/presence/intelligence/decision-runtime architecture docs
docs/architecture/     Platform architecture doc + documentation index (start here) + historical docs
docs/engineering/      Mandatory engineering rules for anyone (human or AI) modifying this codebase
tests/e2e/              End-to-end tests
```

**Architecture docs — start at [`docs/architecture/README.md`](docs/architecture/README.md)**, which indexes both documentation trees. The canonical product/architecture reference is [`docs/architecture/spinbite-platform-architecture-v4.md`](docs/architecture/spinbite-platform-architecture-v4.md).

## Running locally

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env.local` file with your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # used by server-side admin/public routes
```

> Without Supabase env vars, middleware auth and database-backed pages are skipped, but the app still serves static/fallback content (including the homepage).

### 3. Set up the database

Three SQL sources need to run, in order — `schema.sql` alone is not sufficient:

```bash
# 1. Base schema
supabase/schema.sql
# 2. Promotion builder tables (promotion_rewards, coupon_redemptions — the tables the app actually queries)
supabase/promotion_builder_schema.sql
# 3. All incremental migrations, in order
supabase/migrations/*.sql
```

### 4. Start the dev server

```bash
npm run dev
```

Then open:

- http://localhost:3000 — marketing homepage
- http://localhost:3000/play/demo — customer game demo
- http://localhost:3000/admin — restaurant admin (requires auth)
- http://localhost:3000/staff — staff coupon validation

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint (`eslint-config-next`) |

## Deploying

`main` auto-deploys to production on Vercel via the GitHub integration (no in-repo CI/CD config). To set up a new environment:

1. Push the repo to GitHub.
2. In Vercel, **Add New Project** and import the repo.
3. Add the Supabase environment variables (see above) in the project settings.
4. Use the default Next.js build settings and deploy.

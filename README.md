# Menu Reward Wheel (SpinBite)

A QR-based promotional platform for restaurants. Restaurants create promotions tied
to real menu items; diners scan a QR code, play a quick game (spin the wheel,
mystery box, scratch card, and more), win a reward, and redeem the coupon
instantly — no app download required. Staff validate and redeem coupons against
server-side records.

## What it does

- **Restaurant admins** build promotions with a registry-driven Promotion Builder:
  pick a game type, configure weighted rewards backed by menu items, schedule the
  promotion, and publish.
- **Customers** open a play URL (`/play/[restaurantSlug]/[promotionSlug]`) from a
  QR code, play the configured game, and receive a coupon with an expiry.
- **Staff** validate or redeem issued coupons in person via the admin/staff tools.
- **Super admins** manage the catalog of available games and editable site content
  through the `/super-admin` area.

### Games

Games are defined as self-contained contracts and resolved through a central
registry (`lib/games/registry.ts`). Currently included:

- Spin Wheel (`spin_wheel` / `wheel`)
- Mystery Box (`mystery_box`)
- Scratch Card (`scratch_card`)
- Open The Door (`open_the_door`)
- Reward Reels / slot machine (`reward_reels`, placeholder)

Adding a new game means adding a contract folder under `lib/games/` and registering
it — the builder and play runtime render games from the registry rather than from
hardcoded branches. See `docs/architecture/game-creation-framework.md`.

## Tech stack

- **Next.js 14** (App Router) with **React 18** and **TypeScript**
- **Tailwind CSS** for styling, **Framer Motion** for animation
- **Supabase** (Postgres + Auth + Row Level Security) via `@supabase/ssr` and
  `@supabase/supabase-js`
- **canvas-confetti** for win effects, **qr-scanner** for QR validation,
  **lucide-react** for icons
- Auth gating handled in `middleware.ts` (admin routes require a Supabase session)
- Deployed on **Vercel**

## Project structure

```
app/                  Next.js routes (landing, play, admin, super-admin, API handlers)
  api/                Route handlers — public promotion play, coupon issuance, admin metrics
  play/               Customer play pages
  admin/              Restaurant admin UI (promotions, menu, coupons, validate)
  super-admin/        Game catalog + site content management
components/           React UI — games, promotion builder, admin, home/landing sections
lib/
  games/              Per-game contracts + central registry
  game-pool/          Weighted game selection and promotion-to-game resolution
  supabase/           Server and client Supabase helpers
  rewards.ts          Reward selection and coupon helpers
supabase/             SQL schema and migrations
docs/architecture/    Architecture notes, framework docs, postmortems
tests/e2e/            End-to-end tests
```

A fuller architecture overview lives in `docs/architecture/README.md`.

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
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # used by server-side admin routes
```

> Without Supabase env vars, middleware auth and database-backed pages are skipped,
> but the app still serves static/fallback content.

### 3. Set up the database

Run the SQL in `supabase/schema.sql` against your Supabase project, then apply the
migrations in `supabase/migrations/` (and any relevant scripts in `supabase/`).

### 4. Start the dev server

```bash
npm run dev
```

Then open:

- http://localhost:3000 — marketing landing page
- http://localhost:3000/play/demo — customer reward wheel demo
- http://localhost:3000/admin — restaurant admin (requires auth)
- http://localhost:3000/staff — staff coupon validation

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint (`eslint-config-next`) |

## Deploying to Vercel

1. Push the repo to GitHub.
2. In Vercel, **Add New Project** and import the repo.
3. Add the Supabase environment variables (see above) in the project settings.
4. Use the default Next.js build settings and deploy.

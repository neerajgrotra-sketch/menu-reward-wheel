# Menu Reward Wheel

QR-based restaurant spin-to-win promotional web app.

## MVP routes

- `/play/demo` — customer reward wheel demo
- `/staff` — staff coupon validation demo

## Local setup

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000/play/demo
http://localhost:3000/staff
```

## Deploy to Vercel

1. Push this folder to GitHub.
2. In Vercel, click **Add New Project**.
3. Import the `menu-reward-wheel` repo.
4. Use default Next.js settings.
5. Deploy.

## Phase 2 backlog

- Add Supabase/Firebase database.
- Replace mock reward selection with `/api/spin`.
- Store issued coupons with expiry and redemption status.
- Add daily caps and one-spin-per-device rules.
- Add admin campaign management.

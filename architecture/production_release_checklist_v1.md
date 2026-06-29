# Production Release Checklist V1

**Document version:** 1.0
**Date:** 2026-06-29
**Status:** Current — mandatory checklist for all production releases

---

## Pre-Merge Checks (required before any merge to main)

### 1. TypeScript Check

```bash
npx tsc --noEmit
```

Must exit 0 with no errors. Zero exceptions.

If it fails: fix the type errors. Do not merge with `// @ts-ignore` added to silence errors.

---

### 2. Lint Check

```bash
npm run lint
```

Must exit 0 with no errors. Warning-only is acceptable.

If it fails: fix the lint errors. Do not add `eslint-disable` lines to silence errors without a comment explaining why.

---

### 3. Build Check

```bash
npm run build
```

Must succeed. A build that fails in CI will not deploy on Vercel.

If it fails: the deployment won't happen — fix before merging.

---

### 4. Migration Audit (if schema changes are included)

For every new migration file:

- [ ] Migration file is in `supabase/migrations/` with timestamp-prefixed name
- [ ] RLS is enabled on any new table (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [ ] No `using (true)` on any SELECT policy on platform, session, or intelligence tables
- [ ] All foreign keys have the correct `ON DELETE` behavior (CASCADE, SET NULL, RESTRICT)
- [ ] All CHECK constraints match the TypeScript enum values in the engine
- [ ] Rollback reference comment block is present at the bottom of the migration
- [ ] Migration has been previewed against production schema before applying

---

### 5. Pending Migration Check

```bash
supabase db diff --linked
```

Should show no local-only migrations not applied to the linked project. If migrations show as pending: apply them or confirm they are intentionally held back.

---

## Post-Deploy Verification (required after Vercel deploy)

### 6. Git Verification

```bash
git log origin/main --oneline -3
```

Confirm the merged commit SHA is present on `origin/main`.

---

### 7. Vercel Deployment Verification

In the Vercel dashboard:
- [ ] Latest deployment is in READY state
- [ ] Deployment SHA matches the commit SHA from step 6
- [ ] Build logs show no errors

READY status alone is not sufficient — the SHA must match. A prior commit's READY deployment does not mean the new commit is live.

---

### 8. Production Schema Verification (after applying migrations)

Using Supabase dashboard or SQL editor on the production project:

```sql
-- Confirm expected tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Confirm RLS is enabled
SELECT relname, relrowsecurity FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace;

-- Confirm no open policies on sensitive tables
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE tablename IN ('visit_sessions','session_guests','session_events','intervention_events')
ORDER BY tablename, policyname;
```

---

### 9. RLS Verification

For every new table in the release:
- [ ] Anon SELECT is blocked (test with anon key)
- [ ] Owner SELECT returns only that owner's rows
- [ ] Public INSERT is blocked (no policy allowing anon/authenticated INSERT)
- [ ] Service role can INSERT without policy

---

## Smoke Tests (run against production after deploy)

### 10. Public QR Scan Smoke Test

1. Navigate to `/r/{any-restaurant-slug}?tp={any-touchpoint-code}`
2. Verify: page loads without error
3. Verify: session resolves (no spinner/retry UI)
4. Verify: menu items render
5. Verify: session phase indicator shows confirmed (if visible)

---

### 11. Session End Propagation Test

1. Open a customer tab at `/r/{slug}?tp={code}` — verify session confirmed
2. In admin tab at `/admin/sessions`, find the active session
3. Click "End Session"
4. Verify: admin UI session moves to Completed tab (within ~1s via postgres_changes)
5. Verify: customer tab shows session-ended UI (within ~200ms via Broadcast, or ≤30s via heartbeat)

---

### 12. Guest Count Test

1. Open the same QR URL in two separate browser windows (incognito for the second)
2. Verify: admin 👥 count increments to 2 (within the polling/realtime window)
3. Close the second window and wait 3+ minutes
4. Verify: 👥 count decrements to 1 (after stale sweep on next guest-count fetch)

---

### 13. Order Placement Test

1. Enable ordering capability for a test restaurant (`restaurant_capabilities.ordering = true`)
2. Scan QR → add an item to cart → place order
3. Verify: order appears in `/admin/orders` inbox
4. Verify: `ORDER_PLACED` event appears in session intelligence panel

---

## Rollback Notes

### How to roll back a schema migration

Supabase does not auto-rollback migrations. To undo:

1. Run the rollback SQL from the bottom of the migration file in the Supabase SQL editor
2. Remove the migration file from `supabase/migrations/` (prevents re-apply)
3. Redeploy with the reverted migration removed

Every migration file must contain a rollback comment block for this reason. Example:
```sql
-- ── Rollback reference ──────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.new_table;
-- DROP INDEX IF EXISTS public.new_table_idx;
```

### How to roll back application code

1. Identify the last good commit SHA from `git log origin/main`
2. Create a revert commit: `git revert {bad-commit-sha}`
3. Push to main → Vercel auto-deploys the revert
4. Verify: production SHA matches the revert commit (Rule 15)

---

## Notes

- Never skip the TypeScript and lint checks with `--no-verify` or `--skip-checks` flags
- The intelligence panel (session details, behavioral analysis) is non-critical — a failed load shows an inline error and does not block the release
- A release that only changes documentation files (`.md`) does not require smoke tests but must still pass TypeScript and lint
- Architecture documentation (`/architecture/*.md`) must be updated within the same PR if any of the following changed: migrations, API routes, engine files, realtime channel names

-- Image Generation Quota Integrity
-- Branch: feature/ai-food-image-generation-engine
-- Date: 2026-06-20
--
-- Fixes two pre-merge blockers identified in kill-test audit:
--
-- BLOCKER 1 (Tests 1, 5, 10): Quota race condition.
--   Old approach: read usage → check → generate (~20-40s) → write increment.
--   Any concurrent requests within the generation window bypass the limit.
--   Fix: reserve_image_generation_credit() atomically checks AND increments
--   under a row lock in a single UPDATE statement. The route handler calls this
--   BEFORE creating the job. If the worker fails, refund_image_generation_credit()
--   decrements back. The post-completion increment in image-engine.ts is removed.
--
-- BLOCKER 2 (Test 1): Double-click creates duplicate concurrent jobs.
--   Fix: partial unique index prevents more than one active job per menu item.
--   Route handler also pre-checks and returns 409 before INSERT (belt + suspenders).
--
-- Fix C (Tests 2, 3): Job recovery on sheet reopen / browser refresh.
--   Resume API route added in application code; no schema changes needed here.

-- ─── Fix A: Atomic quota reservation ────────────────────────────────────────
-- reserve_image_generation_credit:
--   1. Auto-provisions the limits row if absent (INSERT … ON CONFLICT DO NOTHING).
--   2. Resets the counter if the calendar month has rolled over.
--   3. Atomically increments usage WHERE current < limit (single UPDATE).
--   Returns TRUE if a credit was reserved, FALSE if the limit is already reached.
--   SECURITY DEFINER so the service role key can call it without RLS bypass issues.

create or replace function public.reserve_image_generation_credit(p_restaurant_id uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  -- Auto-provision with defaults if this restaurant has no limits row yet.
  insert into public.intelligence_usage_limits (restaurant_id)
  values (p_restaurant_id)
  on conflict (restaurant_id) do nothing;

  -- Reset the image counter if the calendar month has rolled over.
  -- usage_reset_at is set to the first instant of next month on creation/reset.
  update public.intelligence_usage_limits
  set
    image_current_month_usage = 0,
    usage_reset_at = date_trunc('month', now()) + interval '1 month'
  where
    restaurant_id = p_restaurant_id
    and usage_reset_at <= now();

  -- Atomic check-and-increment. Only modifies the row when usage is below limit.
  -- FOUND is true when the UPDATE touches ≥ 1 row (i.e. the limit was not reached).
  update public.intelligence_usage_limits
  set image_current_month_usage = image_current_month_usage + 1
  where
    restaurant_id = p_restaurant_id
    and image_current_month_usage < image_monthly_limit;

  return found;
end;
$$;

-- refund_image_generation_credit:
--   Called by the background worker if generation fails after credit was reserved.
--   Decrements by 1, floored at 0. Best-effort — does not throw on missing row.

create or replace function public.refund_image_generation_credit(p_restaurant_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.intelligence_usage_limits
  set image_current_month_usage = greatest(0, image_current_month_usage - 1)
  where restaurant_id = p_restaurant_id;
end;
$$;

-- ─── Fix B: One active job per menu item ─────────────────────────────────────
-- Prevents duplicate concurrent generation jobs for the same menu item.
-- The route handler performs an explicit pre-check (belt), this index is the
-- DB-level guarantee (suspenders): the second INSERT raises error code 23505.

create unique index if not exists image_generation_jobs_one_active_per_item
  on public.image_generation_jobs (menu_item_id)
  where (status = 'pending' or status = 'generating');

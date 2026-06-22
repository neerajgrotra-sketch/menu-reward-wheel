-- ── Duplicate Restaurant Audit ────────────────────────────────────────────────
-- Run this in Supabase SQL Editor (production).
-- DO NOT DELETE based on this output — review first.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Restaurants sharing identical normalised names under the same owner
--    (exact duplicates: same owner_id, same name after trim+lower)
SELECT
  owner_id,
  lower(trim(name))          AS normalised_name,
  count(*)                   AS duplicate_count,
  array_agg(id  ORDER BY created_at) AS restaurant_ids,
  array_agg(name ORDER BY created_at) AS names,
  array_agg(slug ORDER BY created_at) AS slugs,
  array_agg(created_at ORDER BY created_at) AS created_ats
FROM public.restaurants
WHERE deleted_at IS NULL
GROUP BY owner_id, lower(trim(name))
HAVING count(*) > 1
ORDER BY duplicate_count DESC, owner_id;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. All restaurants per owner — full inventory for manual review
SELECT
  r.owner_id,
  r.id,
  r.name,
  r.slug,
  r.created_at,
  r.deleted_at,
  r.address_line1,
  r.city
FROM public.restaurants r
ORDER BY r.owner_id, r.created_at;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Orphaned restaurants — no owner_id (should be 0 after this cleanup)
SELECT id, name, slug, created_at
FROM public.restaurants
WHERE owner_id IS NULL
ORDER BY created_at;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Owners with more than 2 restaurants (flag for review, not necessarily wrong)
SELECT
  owner_id,
  count(*) AS restaurant_count,
  array_agg(name ORDER BY created_at) AS names
FROM public.restaurants
WHERE deleted_at IS NULL
GROUP BY owner_id
HAVING count(*) > 2
ORDER BY restaurant_count DESC;

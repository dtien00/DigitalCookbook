-- Migration 014: recipes_with_counts view for popularity-sort
--
-- Stage 13 v2 needs the home grid to order by like count. Three options
-- were considered:
--
--   (a) Denormalised counter columns on `recipes`, kept in sync by
--       AFTER INSERT/DELETE triggers on `likes`. Fastest reads, but
--       adds two triggers, a one-time backfill, and a permanent surface
--       where the counter can drift from the source of truth. Overkill
--       at current corpus size.
--
--   (b) Client-side aggregation from useLikes' bulk-fetched map.
--       Already in memory — but only for currently-loaded pages. Server
--       still has to order the page itself, so this option doesn't
--       actually solve the sort problem; it's just what App.jsx does
--       today to render counts.
--
--   (c) A read-only view that joins recipes to an aggregated likes
--       subquery. Pure read, no triggers, no backfill, no drift. The
--       trade-off is the join cost at query time — fine for thousands
--       of recipes, would warrant revisit at hundreds of thousands.
--
-- Chose (c). The upgrade path to (a) is straightforward when needed:
-- add the column, write a backfill, swap the view to read the column,
-- callers don't change.
--
-- `security_invoker = true` makes the view honor the *invoker's* RLS
-- on the underlying tables. Without it, the view runs as its owner
-- (postgres) and would bypass the recipes RLS — meaning anon visitors
-- would see private recipes through the view. The likes subquery is
-- safe under invoker semantics because `likes` already has a public
-- SELECT policy (migration 001), so the counts are accurate for
-- anonymous and authenticated callers alike.
--
-- Bookmarks-sort is intentionally NOT included here. `favorites` is
-- private (own-only SELECT, migration 003), so a `bookmark_count`
-- aggregate under invoker semantics would always be 0 for everyone
-- except the bookmark's owner — useless as a sort key. Adding it
-- would require either a SECURITY DEFINER count function or a public
-- aggregate table; either way it's a privacy decision worth its own
-- sub-stage.
--
-- Idempotent: CREATE OR REPLACE. Run in Supabase Dashboard → SQL Editor.

CREATE OR REPLACE VIEW public.recipes_with_counts
WITH (security_invoker = true) AS
SELECT
  r.*,
  COALESCE(l.like_count, 0)::bigint AS like_count
FROM public.recipes r
LEFT JOIN (
  SELECT recipe_id, COUNT(*) AS like_count
  FROM public.likes
  GROUP BY recipe_id
) l ON l.recipe_id = r.id;

-- Grant select to the same roles that can read recipes. The RLS on
-- recipes (via security_invoker) still does the actual filtering.
GRANT SELECT ON public.recipes_with_counts TO anon, authenticated;

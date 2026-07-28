-- Migration 026: refresh recipes_with_counts to expose allergens / dietary
-- (Stage N — Allergen / Dietary filter, "filter behavior" item)
--
-- The home grid filters recipes client-side by author-declared allergens /
-- dietary (migration 025). When the likes-sort is active the grid reads from
-- the `recipes_with_counts` view (migration 014) instead of the base table —
-- but that view was created before migration 025, so it does NOT expose the
-- new `allergens` / `dietary` columns. A recipe read through the stale view
-- would arrive with those fields undefined, the client filter would treat
-- them as empty, and an allergen-containing recipe would slip PAST an
-- exclusion. For a safety filter that is a false negative we can't ship, so
-- the view must carry the columns.
--
-- Why DROP + CREATE, not CREATE OR REPLACE: the view is `SELECT r.*, like_count`.
-- Migration 025 appended allergens/dietary to the end of `recipes`, so `r.*`
-- now expands them in BEFORE `like_count` — changing the position of an
-- existing view column. CREATE OR REPLACE VIEW only permits *appending* new
-- columns after the existing set, so it would error here. Dropping first and
-- recreating sidesteps the ordering rule; column order is irrelevant to the
-- client, which selects by name.
--
-- Nothing in the DB depends on this view (only App.jsx queries it), so a plain
-- DROP (no CASCADE) is safe. `security_invoker = true` and the GRANT are
-- re-applied exactly as migration 014 set them — the recipes RLS still does
-- the filtering, and the likes subquery is safe under invoker semantics
-- (likes has a public SELECT policy).
--
-- ⚠ Deploy ordering: apply this alongside/after migration 025. Until it's
-- applied, the likes-sort path can under-filter allergens. The default
-- (date) sort reads the base `recipes` table directly, so it is unaffected.
--
-- ============================================================
-- Run in Supabase Dashboard → SQL Editor. Idempotent (DROP IF EXISTS + CREATE).

DROP VIEW IF EXISTS public.recipes_with_counts;

CREATE VIEW public.recipes_with_counts
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

GRANT SELECT ON public.recipes_with_counts TO anon, authenticated;

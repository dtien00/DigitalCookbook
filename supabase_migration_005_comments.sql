-- Migration 005: comments INSERT policy hardening + covering index.
--
-- Two changes, both additive / idempotent:
--
-- 1. Replace the INSERT policy. Migration 001's original policy was
--    `WITH CHECK (auth.role() = 'authenticated')` — it only verified
--    that the caller was logged in, not that the `user_id` on the
--    inserted row matched the authenticated user. A crafted client
--    could insert a comment claiming to be someone else. This mirrors
--    the migration-004 fix that closed the same gap on `likes`.
--
-- 2. Add a covering index `(recipe_id, created_at DESC)` for the
--    dominant query pattern: list all comments for a recipe, newest
--    first. The pre-existing `idx_comments_recipe (recipe_id)` from
--    migration 001 covers the filter but not the sort; the new index
--    serves both with no separate sort step. Both indexes coexist —
--    the write amplification is minimal and Postgres can choose the
--    cheaper one per query.
--
-- Idempotent: DROP POLICY IF EXISTS / CREATE POLICY for the policy
-- swap, CREATE INDEX IF NOT EXISTS for the index.

-- 1. Tighten INSERT policy
DROP POLICY IF EXISTS "Authenticated users can comment" ON public.comments;
CREATE POLICY "Authenticated users can comment" ON public.comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 2. Covering index for (recipe_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_comments_recipe_created
  ON public.comments(recipe_id, created_at DESC);

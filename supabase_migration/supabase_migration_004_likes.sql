-- Migration 004: refine likes table
--
-- 1. Add created_at so future "recently liked" / "trending" queries
--    have a sort key. Not used in Stage 4 directly, but adding now
--    avoids another migration when the feature lands.
-- 2. Replace the migration-001 INSERT policy with a stricter one.
--    The original policy only checked auth.role() = 'authenticated' —
--    a logged-in user could insert a like row claiming to be someone
--    else. The new policy enforces auth.uid() = user_id.
--
-- Idempotent: column add uses IF NOT EXISTS; policy uses DROP IF EXISTS
-- + CREATE. Run in Supabase Dashboard → SQL Editor.

ALTER TABLE public.likes
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

-- Replace the original INSERT policy.
DROP POLICY IF EXISTS "Any authenticated user can like" ON public.likes;
DROP POLICY IF EXISTS "Users can like recipes" ON public.likes;
CREATE POLICY "Users can like recipes" ON public.likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- The other migration-001 likes policies (DELETE own, public SELECT) are
-- correct as-is and need no change.

-- Migration 019: comment_likes table
--
-- Stage 15 item 4. Lightweight "I appreciate this comment" signal on
-- each comment row. Mirrors the migration-001 `likes` table shape and
-- the migration-004 policy posture (avoids that migration's original
-- `WITH CHECK (auth.role() = 'authenticated')` gap from day one).
--
-- Composite PK (comment_id, user_id) gives us:
--   1. Uniqueness — a user can only like a given comment once.
--   2. A leading-edge index on comment_id, so the bulk-fetch pattern
--      ("give me every comment_likes row where comment_id IN (...)"
--      used by useComments to render counts under a thread) hits the
--      PK index directly. No separate covering index needed.
--
-- FK on comment_id ON DELETE CASCADE means the existing comment-delete
-- paths (own-delete + admin-override from migration 008) clean up
-- their likes automatically — no extra triggers.
--
-- Admin-override DELETE policy is included for parity with migrations
-- 008/009 (admins can already delete comments, recipes, likes,
-- favorites; comment_likes should behave the same way for moderation).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, ALTER TABLE ... ENABLE RLS
-- is a no-op if already enabled, DROP POLICY IF EXISTS + CREATE POLICY
-- for each policy. Safe to re-run.

-- 1. Table -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.comment_likes (
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

-- 2. RLS -------------------------------------------------------------------

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

-- Public read — counts and "who liked what" are public information,
-- same posture as recipe likes.
DROP POLICY IF EXISTS "Comment likes are viewable by everyone" ON public.comment_likes;
CREATE POLICY "Comment likes are viewable by everyone" ON public.comment_likes
  FOR SELECT USING (true);

-- INSERT: caller may only insert a row claiming themselves as the liker.
-- Closes the same gap migrations 004 / 005 / 012 had to retroactively fix
-- on `likes` / `comments` / `follows`.
DROP POLICY IF EXISTS "Users can like comments" ON public.comment_likes;
CREATE POLICY "Users can like comments" ON public.comment_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- DELETE: own row only.
DROP POLICY IF EXISTS "Users can unlike comments they liked" ON public.comment_likes;
CREATE POLICY "Users can unlike comments they liked" ON public.comment_likes
  FOR DELETE USING (auth.uid() = user_id);

-- Admin-override DELETE for moderation parity (migration 008 pattern).
-- Additive: regular users still own their own rows via the policy above.
DROP POLICY IF EXISTS "Admins can delete any comment like" ON public.comment_likes;
CREATE POLICY "Admins can delete any comment like" ON public.comment_likes
  FOR DELETE USING (public.is_admin());

-- Migration 003: enable bookmarks (favorites)
--
-- The favorites table was created in migration 001 with RLS enabled
-- but no policies attached, so currently no one — including the row's
-- own user — can read or write it. This migration:
--   1. Adds a created_at column so "My Bookmarks" can sort by recency.
--   2. Adds a covering index on (user_id, created_at DESC) for that
--      common query pattern.
--   3. Adds RLS policies: each user can read / insert / delete only
--      their own favorites. Bookmarks are private — other users don't
--      need to know what you've saved.
--
-- Idempotent: column add and index use IF NOT EXISTS; policies are
-- dropped first if present so the script can be re-run safely.
--
-- Run in Supabase Dashboard → SQL Editor.

ALTER TABLE public.favorites
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_favorites_user_created
  ON public.favorites (user_id, created_at DESC);

-- RLS policies (own-only across all three operations)

DROP POLICY IF EXISTS "Users can view own favorites" ON public.favorites;
CREATE POLICY "Users can view own favorites" ON public.favorites
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can favorite" ON public.favorites;
CREATE POLICY "Authenticated users can favorite" ON public.favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove own favorites" ON public.favorites;
CREATE POLICY "Users can remove own favorites" ON public.favorites
  FOR DELETE USING (auth.uid() = user_id);

-- Migration 009: admin SELECT visibility
--
-- Migration 008 gave admins DELETE rights on every moderation-relevant
-- table, but the SELECT policies on recipes / ingredients / steps still
-- read `is_public OR auth.uid() = author_id`. So admins could DELETE
-- private recipes they couldn't actually see — they had moderation
-- authority but no way to find the content.
--
-- This migration adds additive SELECT policies on the three
-- visibility-gated tables (recipes, ingredients, steps). The existing
-- "Public X are viewable by everyone" policies stay untouched; Postgres
-- RLS OR's all policies for the same action, so non-admin behavior is
-- unchanged — admins simply gain access to the union of their own
-- content + public content + everyone else's private content.
--
-- Likes and comments don't need a SELECT override: their existing
-- policies are `USING (true)` (public-read).
-- Favorites stays own-only SELECT — admins can DELETE rows (reset
-- bookmarks) without needing to see who bookmarked what.
--
-- Run in Supabase Dashboard → SQL Editor. Idempotent.

DROP POLICY IF EXISTS "Admins can view all recipes" ON public.recipes;
CREATE POLICY "Admins can view all recipes" ON public.recipes
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view all ingredients" ON public.ingredients;
CREATE POLICY "Admins can view all ingredients" ON public.ingredients
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view all steps" ON public.steps;
CREATE POLICY "Admins can view all steps" ON public.steps
  FOR SELECT USING (public.is_admin());

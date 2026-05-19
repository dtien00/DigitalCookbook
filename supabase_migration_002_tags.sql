-- Migration 002: add tags column to recipes
--
-- Adds a TEXT[] tags column so recipes can be categorized
-- (e.g. ["vegan", "weeknight", "asian"]). Indexed with GIN
-- for fast containment queries against future tag-filter UIs.
--
-- Run in Supabase Dashboard → SQL Editor.
-- Idempotent — safe to re-run; the IF NOT EXISTS guards both
-- the column add and the index creation.

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_recipes_tags
  ON public.recipes USING GIN (tags);

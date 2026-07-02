-- Migration 007: add notes column to ingredients
--
-- Adds an optional free-text `notes` field per ingredient so authors can
-- record substitutions and alternatives ("or any neutral oil",
-- "fresh basil works if you can't find Thai basil") without baking them
-- into the ingredient name itself. Renders as italic sub-text under each
-- line on the recipe detail page.
--
-- Nullable — existing rows get NULL, no default needed. No RLS changes:
-- the ingredients SELECT / INSERT policies already gate on the parent
-- recipe's visibility and authorship.
--
-- Run in Supabase Dashboard → SQL Editor.
-- Idempotent — IF NOT EXISTS makes re-runs a no-op.

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS notes TEXT;

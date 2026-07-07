-- Migration 024: add section column to ingredients (Stage 21 —
-- Ingredient sections: "For the sauce" / "For the dough" grouping)
--
-- Each ingredient carries an optional section label; renderers derive
-- groups from contiguous runs of the same label, so grouping is
-- data-driven rather than DOM-structural (RecipeDetail, CookingMode's
-- drawer, and print/PDF all read the same rows they already fetch).
--
-- Nullable — existing ingredients get NULL and render exactly as today
-- (one ungrouped list). No RLS changes: the ingredients policies already
-- gate on the parent recipe's visibility and authorship (same posture as
-- migration 007's notes column).
--
-- The shopping-list / clipboard exporters deliberately never read this
-- column — ingredient provenance and cross-recipe list merging are
-- unchanged by design (see refs/ROADMAP.md Stage 21).
--
-- ============================================================
-- Run in Supabase Dashboard → SQL Editor.
-- Idempotent — IF NOT EXISTS makes re-runs a no-op.

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS section TEXT;

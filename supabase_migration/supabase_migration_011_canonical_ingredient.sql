-- Migration 011: add canonical_ingredient_id column to ingredients
--
-- Forward-compatibility hook for ingredient normalization. The Stage 10
-- fridge-basket feature ships v1 with a simple token-match against the
-- free-text `name` column ("eggs" matches "2 eggs" but not "eggplant"
-- thanks to word-boundary tokenization). That's the right MVP — it kills
-- the obvious false-positives without paying the cost of building a
-- canonical-ingredient table, seed data, or a fuzzy-match UI.
--
-- This column is the schema-side half of the deal. It defaults to NULL
-- today and nothing reads it yet. When a future stage introduces a
-- canonical ingredients table (for grocery-list aggregation, nutrition,
-- substitution graphs, etc.), a backfill script — or an LLM-assisted
-- pass — can parse the free-text strings and populate the IDs without
-- requiring a painful schema migration at that point.
--
-- Nullable, no FK target yet. The FK + the canonical_ingredients table
-- itself land in the future migration that introduces them.
--
-- No RLS changes — the existing ingredients SELECT / INSERT / DELETE
-- policies already gate on the parent recipe's visibility and authorship,
-- and adding a column doesn't change row visibility.
--
-- Run in Supabase Dashboard → SQL Editor.
-- Idempotent — IF NOT EXISTS makes re-runs a no-op.

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS canonical_ingredient_id UUID;

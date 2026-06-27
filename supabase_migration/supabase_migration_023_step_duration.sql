-- Migration 023: add duration_seconds column to steps (Stage 19 Phase 2 —
-- Cooking Mode Timer per-step presets)
--
-- Adds an optional authored timer duration per step (integer seconds) so a
-- step like "simmer 20 minutes" can offer a one-tap "Start 20:00" timer in
-- CookingMode / RecipeDetail instead of forcing the cook to dial it in.
--
-- Nullable — existing steps get NULL and simply show no preset chip; the
-- ad-hoc timer (Phase 1) still covers them. No RLS changes: the steps
-- SELECT / INSERT / UPDATE / DELETE policies already gate on the parent
-- recipe's visibility and authorship (same posture as migration 018's
-- photo_path).
--
-- Stored as seconds (not minutes) so sub-minute steps ("rest 30s") are
-- expressible; the client parses author input (bare-minutes / mm:ss /
-- h:mm:ss) via src/lib/parseDuration.js before save.
--
-- Relationship to Stage 13's deferred recipes.cook_time: that is a
-- recipe-level total for sorting; this is per-step. Complementary, not a
-- dependency — per-step durations could later sum into a suggested
-- cook_time.
--
-- ============================================================
-- Run in Supabase Dashboard → SQL Editor.
-- Idempotent — IF NOT EXISTS makes re-runs a no-op.

ALTER TABLE public.steps
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

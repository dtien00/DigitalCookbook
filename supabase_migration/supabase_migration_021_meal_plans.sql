-- Migration 021: meal planning week grid (Stage M+1, item 1)
--
-- A signed-in user can assign a recipe to a (date, slot) cell on a
-- weekly meal-plan grid. Each cell holds at most one recipe, so the
-- grid is a sparse map of (user_id, plan_date, slot) -> recipe_id.
--
-- This migration:
--   1. Creates public.meal_plans with a UNIQUE (user_id, plan_date, slot)
--      constraint — that's the "one recipe per cell" rule AND the upsert
--      conflict target the client uses to REPLACE a cell's recipe when a
--      new one is dropped on top of an existing assignment.
--   2. Adds own-only RLS across all four operations (SELECT / INSERT /
--      UPDATE / DELETE). UPDATE is included — unlike the favorites
--      pattern (003) — because the add path is an upsert: on conflict it
--      UPDATEs the existing row's recipe_id, which the UPDATE policy must
--      permit. Meal plans are private; no public-read and no admin
--      override (they're personal planning, not moderatable content).
--
-- `slot` is a TEXT column with a CHECK constraint rather than a Postgres
-- ENUM type — matches the lightweight style used elsewhere (e.g.
-- notifications.kind) and avoids the ALTER TYPE dance if slots ever grow.
--
-- The UNIQUE constraint's btree index leads with (user_id, plan_date),
-- so the dominant query — "fetch one user's week" (WHERE user_id = ?
-- AND plan_date BETWEEN ? AND ?) — is already covered; no extra index.
--
-- recipe_id CASCADEs on recipe delete, so a planned recipe that gets
-- deleted simply drops out of the grid (the cell empties). user_id
-- CASCADEs on account delete (consistent with the admin_delete_user path).
--
-- Idempotent: table/index use IF NOT EXISTS; policies are dropped first
-- so the script can be re-run safely.
--
-- Run in Supabase Dashboard -> SQL Editor.

CREATE TABLE IF NOT EXISTS public.meal_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  plan_date   DATE NOT NULL,
  slot        TEXT NOT NULL CHECK (slot IN ('breakfast', 'lunch', 'dinner', 'misc')),
  recipe_id   UUID NOT NULL REFERENCES public.recipes (id) ON DELETE CASCADE,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT meal_plans_user_date_slot_key UNIQUE (user_id, plan_date, slot)
);

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

-- RLS policies (own-only across all four operations)

DROP POLICY IF EXISTS "Users can view own meal plans" ON public.meal_plans;
CREATE POLICY "Users can view own meal plans" ON public.meal_plans
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can add to own meal plans" ON public.meal_plans;
CREATE POLICY "Users can add to own meal plans" ON public.meal_plans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE needed for the upsert-replace path (ON CONFLICT ... DO UPDATE).
DROP POLICY IF EXISTS "Users can change own meal plans" ON public.meal_plans;
CREATE POLICY "Users can change own meal plans" ON public.meal_plans
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove own meal plans" ON public.meal_plans;
CREATE POLICY "Users can remove own meal plans" ON public.meal_plans
  FOR DELETE USING (auth.uid() = user_id);

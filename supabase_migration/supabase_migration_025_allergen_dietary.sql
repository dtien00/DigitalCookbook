-- Migration 025: allergen / dietary declarations + user filter prefs
-- (Stage N — Allergen / Dietary filter)
--
-- Allergens are AUTHOR-DECLARED on the recipe, never inferred from
-- ingredient names. Token-matching an ingredient list is fine for "what
-- can I cook" (Stage 10 fridge basket) but unsafe for "what won't put me
-- in the hospital" — an un-flagged "almond extract" is a real harm. So the
-- data lives on the recipe as an explicit author responsibility.
--
--   recipes.allergens  TEXT[] — canonical allergen slugs the recipe
--                       CONTAINS (dairy, eggs, tree_nuts, peanuts, …).
--   recipes.dietary    TEXT[] — positive attributes the recipe SATISFIES
--                       (vegetarian, vegan). Kept separate from allergens:
--                       one is "exclude if present", the other "require if
--                       requested" — opposite filter directions.
--
-- Signed-in users persist their own filter preferences on the profile so
-- the choice follows them across devices (localStorage is too thin for
-- safety-critical state — a cleared cache silently drops an exclusion):
--
--   profiles.allergen_exclusions   TEXT[] — allergens to hide.
--   profiles.dietary_requirements  TEXT[] — dietary attrs to require.
--
-- All four are TEXT[] NOT NULL DEFAULT '{}' + a GIN index, exactly like
-- migration 002's tags column — GIN is the index type that serves array
-- containment/overlap (@>, <@, &&); a B-tree on an array can't. The recipe
-- filter query uses `allergens && excluded` (overlap → hide) and
-- `dietary @> required` (contains all → keep).
--
-- No RLS changes. The recipes columns are additive and covered by the
-- existing `is_public OR auth.uid() = author_id` policy; profiles already
-- has an owner-only UPDATE policy (the migration-010 trigger only reverts
-- is_admin tampering, so these columns write freely for their owner). Same
-- additive-column posture as migration 024's ingredients.section.
--
-- ============================================================
-- Run in Supabase Dashboard → SQL Editor.
-- Idempotent — IF NOT EXISTS guards every column and index.

-- Recipe-side declarations -----------------------------------

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS allergens TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS dietary TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_recipes_allergens
  ON public.recipes USING GIN (allergens);

CREATE INDEX IF NOT EXISTS idx_recipes_dietary
  ON public.recipes USING GIN (dietary);

-- User-side filter preferences -------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allergen_exclusions TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dietary_requirements TEXT[] NOT NULL DEFAULT '{}';

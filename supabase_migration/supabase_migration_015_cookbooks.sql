-- Migration 015: cookbooks (collections of recipes) — Stage 14 item 1
--
-- A cookbook is an owner-curated, optionally-public collection of recipes.
-- A recipe can live in many cookbooks (many-to-many via cookbook_recipes).
--
-- Schema:
--   cookbooks         — one row per collection
--   cookbook_recipes  — join table, ordered via `position`
--
-- RLS pattern:
--   cookbooks:        public-read when is_public OR own (mirrors `recipes`);
--                     own-only INSERT / UPDATE / DELETE.
--   cookbook_recipes: SELECT inherits the parent cookbook's visibility
--                     (so anyone can browse a public cookbook's contents);
--                     INSERT / DELETE are gated on owning the parent
--                     cookbook (Option A: own-only curation, no collab v1).
--
-- Cover image: nullable `cover_image_url TEXT`. Client falls back to
-- auto-composing a cover from the first N recipe thumbnails when null,
-- so authoring a cookbook requires zero image work to look good.
-- Reuses the existing `recipe-images` storage bucket — no new bucket /
-- storage policy needed.
--
-- Idempotent: tables / indexes use IF NOT EXISTS; policies are dropped
-- first if present so the script can be re-run safely.
--
-- Run in Supabase Dashboard → SQL Editor.

-- =====================================================================
-- cookbooks
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.cookbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Covering index for "list my cookbooks newest-first" and "list this
-- author's public cookbooks" — both query on owner_id then sort by
-- created_at DESC.
CREATE INDEX IF NOT EXISTS idx_cookbooks_owner_created
  ON public.cookbooks (owner_id, created_at DESC);

ALTER TABLE public.cookbooks ENABLE ROW LEVEL SECURITY;

-- Public read when public; own-read always.
DROP POLICY IF EXISTS "Cookbooks are viewable when public or own" ON public.cookbooks;
CREATE POLICY "Cookbooks are viewable when public or own" ON public.cookbooks
  FOR SELECT USING (is_public OR auth.uid() = owner_id);

-- Own-only writes. INSERT uses auth.uid() = owner_id (not auth.role =
-- 'authenticated') — same hardening as migrations 004 / 005 / 012.
DROP POLICY IF EXISTS "Users can create own cookbooks" ON public.cookbooks;
CREATE POLICY "Users can create own cookbooks" ON public.cookbooks
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own cookbooks" ON public.cookbooks;
CREATE POLICY "Users can update own cookbooks" ON public.cookbooks
  FOR UPDATE USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own cookbooks" ON public.cookbooks;
CREATE POLICY "Users can delete own cookbooks" ON public.cookbooks
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================================
-- cookbook_recipes (join)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.cookbook_recipes (
  cookbook_id UUID NOT NULL REFERENCES public.cookbooks(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cookbook_id, recipe_id)
);

-- Order-preserving listing within a cookbook: (cookbook_id, position).
-- The PK already covers membership lookups by (cookbook_id, recipe_id).
CREATE INDEX IF NOT EXISTS idx_cookbook_recipes_position
  ON public.cookbook_recipes (cookbook_id, position);

-- Reverse-lookup: "which cookbooks contain this recipe" (for the future
-- "Add to cookbook…" affordance on RecipeDetail).
CREATE INDEX IF NOT EXISTS idx_cookbook_recipes_recipe
  ON public.cookbook_recipes (recipe_id);

ALTER TABLE public.cookbook_recipes ENABLE ROW LEVEL SECURITY;

-- SELECT inherits parent cookbook visibility. A row in cookbook_recipes
-- is visible iff the parent cookbook is visible to the caller. RLS on
-- the parent table already filters that set, so the EXISTS check returns
-- false for cookbooks the caller can't see.
DROP POLICY IF EXISTS "Cookbook recipes inherit parent visibility" ON public.cookbook_recipes;
CREATE POLICY "Cookbook recipes inherit parent visibility" ON public.cookbook_recipes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.cookbooks c
      WHERE c.id = cookbook_recipes.cookbook_id
    )
  );

-- INSERT / DELETE gated on owning the parent cookbook (Option A:
-- own-only curation). Note: a malicious caller can't insert a row for
-- someone else's cookbook because cookbooks RLS hides cookbooks they
-- don't own from the EXISTS subquery — but we also check ownership
-- explicitly for clarity and defence-in-depth.
DROP POLICY IF EXISTS "Owners can add recipes to own cookbooks" ON public.cookbook_recipes;
CREATE POLICY "Owners can add recipes to own cookbooks" ON public.cookbook_recipes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cookbooks c
      WHERE c.id = cookbook_recipes.cookbook_id
        AND c.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can remove recipes from own cookbooks" ON public.cookbook_recipes;
CREATE POLICY "Owners can remove recipes from own cookbooks" ON public.cookbook_recipes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.cookbooks c
      WHERE c.id = cookbook_recipes.cookbook_id
        AND c.owner_id = auth.uid()
    )
  );

-- UPDATE policy covers position reordering (drag-to-reorder within a
-- cookbook). Same ownership gate.
DROP POLICY IF EXISTS "Owners can reorder own cookbook recipes" ON public.cookbook_recipes;
CREATE POLICY "Owners can reorder own cookbook recipes" ON public.cookbook_recipes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.cookbooks c
      WHERE c.id = cookbook_recipes.cookbook_id
        AND c.owner_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cookbooks c
      WHERE c.id = cookbook_recipes.cookbook_id
        AND c.owner_id = auth.uid()
    )
  );

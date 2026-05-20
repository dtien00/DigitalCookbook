-- Migration 006: Patch the missing INSERT policy on `profiles`
--
-- Background
-- ----------
-- Migration 001 enabled RLS on `public.profiles` and added SELECT (public)
-- and UPDATE (own-only) policies — but never added an INSERT policy. The
-- `handle_new_user()` trigger creates profile rows on signup via
-- `SECURITY DEFINER`, bypassing RLS entirely, so most profiles exist and
-- the gap stayed hidden.
--
-- The bug surfaces from `Profile.jsx`'s `supabase.from('profiles').upsert(...)`.
-- Postgres implements upsert as `INSERT ... ON CONFLICT DO UPDATE`, which
-- has to pass the INSERT RLS check even when the row ultimately takes the
-- UPDATE branch. With no INSERT policy, the request is rejected:
--
--     new row violates row-level security policy for table "profiles"
--
-- Fix
-- ---
-- Add an INSERT policy scoped to the authenticated user's own id. Same
-- `auth.uid() = <user-column>` pattern used to close INSERT gaps on:
--   - migration 004 (likes)
--   - migration 005 (comments)
--
-- Safe to re-run: DROP IF EXISTS + CREATE.

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

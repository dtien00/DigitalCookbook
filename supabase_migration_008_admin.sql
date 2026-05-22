-- Migration 008: admin role + moderation policies + user-deletion RPC
--
-- Adds an `is_admin` flag on profiles, additive RLS policies that let an
-- admin delete any recipe / comment / like / favorite, and a
-- SECURITY DEFINER RPC for deleting an auth.users row (which cascades
-- through profiles and all user content). Also exposes a one-shot
-- `bootstrap_admin()` RPC the seed script can call to promote the
-- known seed admin email — non-seed accounts cannot use it.
--
-- The admin override policies are ADDITIVE — they coexist with the
-- existing owner-only DELETE policies, so a regular user retains the
-- ability to delete their own content while an admin gains the ability
-- to delete anyone's. Postgres RLS OR's policies for the same action.
--
-- A BEFORE UPDATE trigger on profiles prevents non-admin users from
-- self-promoting via the existing "Users can update own profile"
-- policy — it resets is_admin back to its prior value when the caller
-- isn't already an admin.
--
-- Run in Supabase Dashboard → SQL Editor. Idempotent.

-- 1. is_admin column on profiles -------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Helper: is_admin() returns whether the caller is an admin -------------
-- SECURITY DEFINER so the function bypasses RLS when reading profiles —
-- not strictly required since profiles SELECT is public-read, but it
-- keeps the function independent of future SELECT-policy changes.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  );
END;
$$;

-- 3. Admin-override DELETE policies ----------------------------------------
-- Each is additive — the original owner-only DELETE policies remain so a
-- regular user still controls their own content.
DROP POLICY IF EXISTS "Admins can delete any recipe" ON public.recipes;
CREATE POLICY "Admins can delete any recipe" ON public.recipes
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete any comment" ON public.comments;
CREATE POLICY "Admins can delete any comment" ON public.comments
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete any like" ON public.likes;
CREATE POLICY "Admins can delete any like" ON public.likes
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete any favorite" ON public.favorites;
CREATE POLICY "Admins can delete any favorite" ON public.favorites
  FOR DELETE USING (public.is_admin());

-- 4. Prevent self-promotion -----------------------------------------------
-- Existing UPDATE policy on profiles is `USING (auth.uid() = id)` — i.e.
-- any user can update their own row, including is_admin. This trigger
-- silently reverts is_admin changes when the caller isn't already an
-- admin, so a regular user can edit their profile but not grant
-- themselves admin via a crafted UPDATE.
CREATE OR REPLACE FUNCTION public.prevent_self_admin_grant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin AND NOT public.is_admin() THEN
    NEW.is_admin := OLD.is_admin;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_self_admin_grant ON public.profiles;
CREATE TRIGGER profiles_prevent_self_admin_grant
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_admin_grant();

-- 5. Admin user-deletion RPC ----------------------------------------------
-- Deletes the target row from auth.users which cascades through profiles
-- and every content table the user owns. SECURITY DEFINER so it runs as
-- the function owner (typically `postgres`) which has DELETE on auth.users
-- — a regular caller cannot DELETE from auth.users directly. Two guards:
--   (a) caller must be an admin (else throw)
--   (b) target_id may not equal the caller (admins can't delete themselves
--       via this RPC — prevents accidentally locking the project out of
--       admin access; the Supabase Dashboard remains the escape hatch)
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_delete_user: caller is not an admin';
  END IF;
  IF target_id = auth.uid() THEN
    RAISE EXCEPTION 'admin_delete_user: admins cannot delete their own account here';
  END IF;
  DELETE FROM auth.users WHERE id = target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

-- 6. bootstrap_admin RPC --------------------------------------------------
-- Self-promotes the *currently signed-in* caller to admin, but ONLY if
-- their email matches the known seed allowlist. Used once by the seed
-- script after creating admin@example.com. Real (non-seed) admin
-- promotion is intentionally a manual SQL step by an existing admin —
-- this is a personal-cookbook project; a self-service promotion UI
-- would be a privilege-escalation footgun.
CREATE OR REPLACE FUNCTION public.bootstrap_admin()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
BEGIN
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'bootstrap_admin: not signed in';
  END IF;
  IF caller_email NOT IN ('admin@example.com') THEN
    RAISE EXCEPTION 'bootstrap_admin: % is not in the seed allowlist', caller_email;
  END IF;
  UPDATE public.profiles SET is_admin = TRUE WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_admin() TO authenticated;

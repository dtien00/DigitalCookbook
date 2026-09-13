-- Migration 027: require AAL2 (verified MFA) for destructive admin actions
--
-- Stage 16 item 2 shipped admin MFA as a CLIENT-side gate: AdminReports and
-- RecipeDetail's moderation block render their controls only when
-- `mfa.isAal2` (see src/hooks/useMfa.js). That protects the screen, not the
-- endpoint — PostgREST exposes every RLS policy and RPC directly, so an
-- admin session at AAL1 (fresh password login, MFA enrolled but not yet
-- challenged) could still issue the destructive calls by hand with the
-- public anon key. This migration moves the check into the database, where
-- it is actually a control.
--
-- Supabase encodes the session's Authentication Assurance Level as an `aal`
-- claim in the JWT, and PostgREST forwards that JWT to Postgres, so
-- `auth.jwt() ->> 'aal'` is readable from policies and functions alike.
-- AAL is a property of the SESSION, not the user: enrolling a TOTP factor
-- yields `aal1` until the user completes a challenge, at which point
-- Supabase mints a fresh token carrying `aal2`.
--
-- SCOPE — destructive only. The five admin-override DELETE policies and the
-- admin_delete_user RPC now additionally require AAL2. Deliberately NOT
-- changed:
--   * Admin SELECT policies (migration 009 visibility, 017 report reads) —
--     reading the moderation queue is the routine workflow, and demanding a
--     TOTP code to look at it is the kind of friction that gets MFA turned
--     off. Confidentiality exposure, not destruction.
--   * "Admins can update any report" (017) — report status is reversible
--     (the stamp trigger clears resolved_at/resolved_by on transition back)
--     and is an audit trail with no DELETE policy at all.
--
-- Owner paths are untouched. RLS OR's permissive policies for the same
-- action, so tightening the admin-override DELETE policies leaves "users
-- can delete their own content" working exactly as before — only the
-- delete-someone-else's-content branch now demands AAL2.
--
-- Run in Supabase Dashboard -> SQL Editor. Idempotent.

-- 1. Helper: is_aal2() ------------------------------------------------------
-- NOT SECURITY DEFINER: it reads only the request's own JWT, touches no
-- table, and therefore needs no elevated privilege (unlike is_admin(),
-- which reads profiles).
--
-- Two escape hatches, both deliberate:
--   * auth.jwt() IS NULL means the statement is NOT arriving through
--     PostgREST — a direct connection from the SQL Editor, psql, or a
--     migration. Those are already privileged by definition, and failing
--     closed there would make this migration unable to be exercised by its
--     own author.
--   * service_role bypasses RLS wholesale anyway, so making the RPC
--     stricter than the policies behind it would be theatre.
CREATE OR REPLACE FUNCTION public.is_aal2()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.jwt() IS NULL OR auth.jwt() = '{}'::jsonb THEN TRUE
    WHEN coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN TRUE
    -- Absent claim fails closed: null <> 'aal2' is NULL, not TRUE, so the
    -- coalesce is load-bearing rather than cosmetic.
    ELSE coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  END;
$$;

COMMENT ON FUNCTION public.is_aal2() IS
  'True when the caller''s session has completed an MFA challenge (JWT aal claim = aal2), or is a privileged non-PostgREST caller. See migration 027.';

-- 2. Re-create the admin-override DELETE policies with the AAL2 requirement -
-- Same names as migrations 008 / 019 so this replaces rather than stacks.
DROP POLICY IF EXISTS "Admins can delete any recipe" ON public.recipes;
CREATE POLICY "Admins can delete any recipe" ON public.recipes
  FOR DELETE USING (public.is_admin() AND public.is_aal2());

DROP POLICY IF EXISTS "Admins can delete any comment" ON public.comments;
CREATE POLICY "Admins can delete any comment" ON public.comments
  FOR DELETE USING (public.is_admin() AND public.is_aal2());

DROP POLICY IF EXISTS "Admins can delete any like" ON public.likes;
CREATE POLICY "Admins can delete any like" ON public.likes
  FOR DELETE USING (public.is_admin() AND public.is_aal2());

DROP POLICY IF EXISTS "Admins can delete any favorite" ON public.favorites;
CREATE POLICY "Admins can delete any favorite" ON public.favorites
  FOR DELETE USING (public.is_admin() AND public.is_aal2());

DROP POLICY IF EXISTS "Admins can delete any comment like" ON public.comment_likes;
CREATE POLICY "Admins can delete any comment like" ON public.comment_likes
  FOR DELETE USING (public.is_admin() AND public.is_aal2());

-- 3. admin_delete_user: the most destructive call in the schema -------------
-- Deletes an auth.users row, cascading through profiles and every content
-- table the target owns. Body is migration 008's, plus the AAL2 guard.
-- Guard order matters: check admin first so a non-admin gets the same
-- message as before and learns nothing about MFA state from the error.
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
  IF NOT public.is_aal2() THEN
    RAISE EXCEPTION 'admin_delete_user: requires a verified MFA session (aal2)';
  END IF;
  IF target_id = auth.uid() THEN
    RAISE EXCEPTION 'admin_delete_user: admins cannot delete their own account here';
  END IF;
  DELETE FROM auth.users WHERE id = target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

-- 4. Record the bootstrap_admin drop ---------------------------------------
-- Dropped by hand in the live database on 2026-09-08 after a security sweep:
-- it was SECURITY DEFINER, granted to `authenticated`, and gated only on an
-- email allowlist that still held the literal placeholder 'admin@example.com'
-- (migrations 008 and 010 both ship that value). Its whole purpose was to
-- bypass the profiles_prevent_self_admin_grant trigger, so it was the single
-- path from `authenticated` to is_admin = TRUE. Nothing in src/ ever called
-- it. Restated here so a fresh clone replaying the migrations in order does
-- not recreate the hole that 008/010 leave behind.
--
-- Granting admin from here on is a manual UPDATE from the SQL Editor, which
-- gates on dashboard access rather than on an email string.
DROP FUNCTION IF EXISTS public.bootstrap_admin();

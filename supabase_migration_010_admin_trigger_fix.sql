-- Migration 010: fix prevent_self_admin_grant trigger
--
-- The trigger from migration 008 had two failure modes:
--
--  1. SQL editor / backend tasks: when an operator runs an UPDATE on
--     profiles in the Supabase SQL editor, there's no JWT, so
--     `auth.uid()` returns NULL. The trigger calls `public.is_admin()`
--     which then evaluates `WHERE id = NULL` — returns no rows, so
--     `is_admin()` returns FALSE, so the trigger reverts the change.
--     The operator sees a "successful" UPDATE that quietly produced no
--     visible change. This is wrong: the SQL editor is inherently
--     privileged and should not be second-guessed.
--
--  2. bootstrap_admin RPC: when the seed script signs in as
--     `admin@example.com` and calls `bootstrap_admin()`, that function
--     does `UPDATE profiles SET is_admin = TRUE WHERE id = auth.uid()`.
--     The trigger fires; at that exact moment the caller is NOT yet
--     admin (we're in the middle of promoting them); `is_admin()`
--     returns FALSE; the trigger reverts. bootstrap_admin silently
--     no-ops. Net effect: the seed admin account is never actually
--     promoted, and the symptom is "logged in as admin but can't see
--     private recipes / can't moderate".
--
-- This migration:
--   - Teaches the trigger to skip when `auth.uid() IS NULL` (no JWT
--     context → inherently privileged path).
--   - Teaches the trigger to skip when an opted-in SECURITY DEFINER
--     function has set a transaction-local GUC (`app.bypass_admin_trigger`
--     = 'true'). bootstrap_admin sets this before its UPDATE.
--
-- The defense against the original attack (a regular signed-in user
-- trying to grant themselves admin via the existing own-row UPDATE
-- policy) is preserved: those callers DO have an auth.uid(), do NOT
-- have the GUC set, are NOT already admin, so the trigger still
-- reverts their change.
--
-- Run in Supabase Dashboard → SQL Editor. Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.prevent_self_admin_grant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- (a) No JWT → SQL editor / backend tasks / postgres direct. These
  -- paths are already privileged; don't second-guess them.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- (b) An opted-in SECURITY DEFINER function set the bypass GUC for
  -- this transaction. Used by bootstrap_admin to promote the seed
  -- account. The GUC is transaction-local (third arg to set_config
  -- is true), so it doesn't leak between requests on a pooled
  -- connection.
  IF current_setting('app.bypass_admin_trigger', true) = 'true' THEN
    RETURN NEW;
  END IF;
  -- (c) Default path: a signed-in client trying to change is_admin.
  -- Allow only if they're already admin.
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin AND NOT public.is_admin() THEN
    NEW.is_admin := OLD.is_admin;
  END IF;
  RETURN NEW;
END;
$$;

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
  -- Opt out of prevent_self_admin_grant for the UPDATE below. Third
  -- argument `true` makes the setting transaction-local — it auto-reverts
  -- at COMMIT/ROLLBACK so this doesn't leak to other requests on a
  -- pooled connection.
  PERFORM set_config('app.bypass_admin_trigger', 'true', true);
  UPDATE public.profiles SET is_admin = TRUE WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_admin() TO authenticated;

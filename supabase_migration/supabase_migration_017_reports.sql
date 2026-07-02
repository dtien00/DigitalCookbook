-- Migration 017: report handling (Stage 16 item 1)
--
-- Adds a `reports` table so any signed-in user can flag a comment, recipe,
-- or author profile for admin review, plus the RLS and trigger machinery
-- around it.
--
-- RLS pattern (mirrors migration 008's admin-override approach):
--   - Reporters can INSERT a report row claiming themselves as reporter_id
--   - Reporters can SELECT their own report rows
--   - Admins can SELECT every report row (additive policy)
--   - Admins can UPDATE every report row (status workflow lives here)
--   - No DELETE policy at all — reports are an audit trail; resolving or
--     dismissing flips status, it does not remove the row. Admins can
--     still remove rows via the dashboard if a legal need arises.
--
-- Spam cap: a BEFORE INSERT trigger raises when the reporter already has
-- 10 open reports. Schema-level enforcement (not just a UI hide) so a
-- crafted client request can't bypass it. Reporter must resolve / dismiss
-- (admin action) before the 11th can land. Picked 10 from the roadmap
-- spec; revisit if it becomes a friction signal.
--
-- target_id is intentionally NOT a foreign key — it points at one of
-- three different tables (comments / recipes / profiles) depending on
-- target_type, and Postgres FKs can't be conditional. Admin UI handles
-- "target no longer exists" gracefully.
--
-- Run in Supabase Dashboard → SQL Editor. Idempotent.

-- 1. Enums -----------------------------------------------------------------
-- Using enums instead of TEXT + CHECK for cleaner client-side parsing and
-- because both vocabularies are closed sets that change rarely.
DO $$ BEGIN
  CREATE TYPE public.report_target_type AS ENUM ('comment', 'recipe', 'profile');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.report_status AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. reports table ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type  public.report_target_type NOT NULL,
  target_id    UUID NOT NULL,
  reason       TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
  status       public.report_status NOT NULL DEFAULT 'open',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 3. Indexes ---------------------------------------------------------------
-- Covers "reporter views their own reports" (rare, but keeps RLS query plans tight).
CREATE INDEX IF NOT EXISTS reports_reporter_created_idx
  ON public.reports (reporter_id, created_at DESC);

-- Covers the dominant admin query: open reports newest-first.
CREATE INDEX IF NOT EXISTS reports_status_created_idx
  ON public.reports (status, created_at DESC);

-- 4. Enable RLS ------------------------------------------------------------
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies ----------------------------------------------------------
DROP POLICY IF EXISTS "Reporters can insert their own reports" ON public.reports;
CREATE POLICY "Reporters can insert their own reports" ON public.reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Reporters can view their own reports" ON public.reports;
CREATE POLICY "Reporters can view their own reports" ON public.reports
  FOR SELECT USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Admins can view all reports" ON public.reports;
CREATE POLICY "Admins can view all reports" ON public.reports
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update any report" ON public.reports;
CREATE POLICY "Admins can update any report" ON public.reports
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 6. Spam-cap trigger ------------------------------------------------------
-- Raises when the reporter already has >= 10 open reports. SECURITY DEFINER
-- so the count bypasses RLS — without it the inner SELECT would only see
-- the reporter's own rows anyway (which is what we want here), but
-- SECURITY DEFINER decouples the trigger from any future RLS changes.
-- The cap is on STATUS = 'open' only — resolved / dismissed reports do
-- not block new reports, otherwise a busy reporter is permanently capped.
CREATE OR REPLACE FUNCTION public.enforce_report_spam_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  open_count INT;
BEGIN
  SELECT COUNT(*) INTO open_count
    FROM public.reports
    WHERE reporter_id = NEW.reporter_id AND status = 'open';

  IF open_count >= 10 THEN
    RAISE EXCEPTION 'reports_spam_cap: reporter has 10 open reports; resolve or dismiss existing ones before filing another'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reports_enforce_spam_cap ON public.reports;
CREATE TRIGGER reports_enforce_spam_cap
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_report_spam_cap();

-- 7. resolved_at + resolved_by auto-fill ----------------------------------
-- When an admin flips status to 'resolved' or 'dismissed', stamp
-- resolved_at and resolved_by automatically so the client doesn't have to
-- (and so an admin's UPDATE-via-dashboard also gets the audit trail).
-- When status goes back to 'open' or 'reviewing', clear them — the row is
-- live again.
CREATE OR REPLACE FUNCTION public.stamp_report_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('resolved', 'dismissed') AND OLD.status NOT IN ('resolved', 'dismissed') THEN
    NEW.resolved_at := NOW();
    NEW.resolved_by := auth.uid();
  ELSIF NEW.status IN ('open', 'reviewing') AND OLD.status IN ('resolved', 'dismissed') THEN
    NEW.resolved_at := NULL;
    NEW.resolved_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reports_stamp_resolution ON public.reports;
CREATE TRIGGER reports_stamp_resolution
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.stamp_report_resolution();

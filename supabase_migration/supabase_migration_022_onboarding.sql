-- Migration 022: first-run onboarding dismissal flag (Stage M, item 2)
--
-- The 3-step first-run onboarding tour shows once for brand-new accounts and
-- must stay dismissed across re-logins and devices. A single nullable timestamp
-- on profiles records when (and whether) the user has dismissed it:
--   NULL  -> never dismissed; tour is eligible to show (subject to the
--            client-side "account < 24h old" gate)
--   set   -> dismissed at this instant; never show again
--
-- A TIMESTAMPTZ (rather than a BOOLEAN) costs nothing extra and lets us answer
-- "when did they finish onboarding" later without a second migration.
--
-- No RLS changes: profiles already has an owner-only UPDATE policy, so a user
-- can write their own row's onboarding_dismissed_at. The migration 010 BEFORE
-- UPDATE trigger only reverts is_admin tampering by non-admins; it leaves every
-- other column (including this one) untouched, so the dismissal write passes.
--
-- No index: the column is only ever read as part of fetching the current user's
-- own single profile row by primary key. Anonymous users have no profile row,
-- so the tour never applies to them (enforced client-side too).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, safe to re-run.
--
-- Run in Supabase Dashboard -> SQL Editor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_dismissed_at TIMESTAMP WITH TIME ZONE;

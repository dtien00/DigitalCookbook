-- Migration 013: Patch handle_new_user() to populate profiles from OAuth metadata
--
-- Problem
-- -------
-- The trigger reads fixed key names from raw_user_meta_data that only work for
-- email/password signups (where useAuthForm.js explicitly passes
-- data: { username: email.split('@')[0] }):
--
--   username   → raw_user_meta_data->>'username'    (absent for OAuth)
--   avatar_url → raw_user_meta_data->>'avatar_url'  (absent for Google)
--
-- OAuth providers surface the same data under different keys:
--
--   Provider | username key   | avatar key
--   -------- | -------------- | ----------
--   Google   | (none)         | picture
--   GitHub   | user_name      | avatar_url   ← avatar already worked
--
-- Without this patch, every OAuth signup produces a profile row with
-- username = NULL and avatar_url = NULL (for Google), breaking:
--   - Recipe card bylines (Stage 11: falls back to "Anonymous chef")
--   - Comment author avatars (falls back to initials chip — ok, but not ideal)
--   - Username uniqueness: NULL is not constrained by UNIQUE in Postgres so
--     multiple OAuth users all end up with username = NULL with no collision,
--     but the display fallback chain in AuthorProfile / RecipeCard degrades.
--
-- Fix
-- ---
-- Replace the INSERT in handle_new_user() with COALESCE chains that try
-- each provider's key before falling back:
--
--   username:   username (email/pw) → user_name (GitHub) → email prefix (Google)
--   avatar_url: avatar_url (GitHub / manually set) → picture (Google)
--
-- The email-prefix fallback for username derives from raw_user_meta_data->>'email'
-- (populated by both Google and GitHub) rather than new.email so the logic stays
-- inside the meta bag and is consistent across providers. If the email prefix is
-- also absent, substring(new.id::text, 1, 8) is the last resort — always unique,
-- never NULL, never conflicts with the UNIQUE constraint.
--
-- Safe to re-run: CREATE OR REPLACE replaces the function body in place; the
-- trigger binding (on_auth_user_created) already exists and is not dropped.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, avatar_url)
  VALUES (
    new.id,

    -- username: prefer the explicitly-set value from email/password signup,
    -- then GitHub's user_name, then the email prefix (Google), then a UUID
    -- prefix as an absolute last resort.
    COALESCE(
      NULLIF(TRIM(new.raw_user_meta_data->>'username'),  ''),
      NULLIF(TRIM(new.raw_user_meta_data->>'user_name'), ''),
      NULLIF(TRIM(SPLIT_PART(new.raw_user_meta_data->>'email', '@', 1)), ''),
      SUBSTRING(new.id::text, 1, 8)
    ),

    -- full_name: both Google and GitHub surface this key; email/password
    -- signups don't set it (NULL is fine — the profile edit screen fills it).
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),

    -- avatar_url: GitHub and any manually-set value use avatar_url directly;
    -- Google uses picture.
    COALESCE(
      NULLIF(TRIM(new.raw_user_meta_data->>'avatar_url'), ''),
      NULLIF(TRIM(new.raw_user_meta_data->>'picture'),    '')
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

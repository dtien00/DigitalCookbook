-- Migration 012: follows hardening + new-recipe notifications (Stage 11)
--
-- Three things land here, all additive except the follows INSERT policy
-- which gets the same hardening as migrations 004 (likes) and 005
-- (comments) — same gap, same fix.
--
-- 1. follows.INSERT policy: WITH CHECK (auth.role() = 'authenticated')
--    only verified the caller was logged in, not that follower_id matched
--    the caller. A crafted client could insert (follower_id = '<someone
--    else>', following_id = '<author>') and impersonate a follow.
--    Replaced with WITH CHECK (auth.uid() = follower_id).
--
-- 2. follows gains notify_on_new_recipe BOOLEAN (off by default — opt-in)
--    + created_at TIMESTAMPTZ for sortability + an UPDATE policy so
--    followers can toggle the preference (the original migration had no
--    UPDATE policy on follows; RLS denies by default). Covering index on
--    (follower_id, created_at DESC) for the followed-authors list query.
--
-- 3. notifications table — own-only SELECT/UPDATE/DELETE for the
--    recipient; NO client INSERT (RLS denies by default). Rows are only
--    created by the AFTER INSERT trigger on recipes which runs
--    SECURITY DEFINER and fans out one row per follower with
--    notify_on_new_recipe = TRUE. WHERE is_public = TRUE on the trigger
--    means private recipes don't notify — followers shouldn't be told
--    about content RLS hides from them anyway.
--
-- Notifications are scoped to delivery (one row = one in-app surface),
-- not preferences (which live on the follows row). Splitting them lets
-- "I follow X but don't want pings" coexist cleanly with "I have a
-- backlog of unread pings."
--
-- Run in Supabase Dashboard → SQL Editor. Idempotent.

-- 1. Harden follows INSERT policy -----------------------------------------
DROP POLICY IF EXISTS "Authenticated users can follow" ON public.follows;
CREATE POLICY "Authenticated users can follow" ON public.follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- 2. Additive follows columns --------------------------------------------
ALTER TABLE public.follows
  ADD COLUMN IF NOT EXISTS notify_on_new_recipe BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.follows
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Covering index for the dominant query: "list everyone I follow,
-- newest follow first" (item 3's followed-authors list).
CREATE INDEX IF NOT EXISTS idx_follows_follower_created
  ON public.follows (follower_id, created_at DESC);

-- 3. UPDATE policy on follows --------------------------------------------
-- The original migration had no UPDATE policy on follows; with RLS
-- enabled that means UPDATE is denied for everyone. Now that follows
-- carries a mutable preference (notify_on_new_recipe), the follower
-- needs to be able to toggle it on their own row. Mirror the favorites/
-- comments-style own-only pattern.
DROP POLICY IF EXISTS "Users can update their own follow row" ON public.follows;
CREATE POLICY "Users can update their own follow row" ON public.follows
  FOR UPDATE
  USING (auth.uid() = follower_id)
  WITH CHECK (auth.uid() = follower_id);

-- 4. notifications table -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Bell dropdown: latest N notifications for the signed-in user.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- Unread-count badge: fast lookup of unread rows for a user. Partial
-- index keeps it tiny since most rows are read most of the time.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 5. notifications RLS policies ------------------------------------------
-- Recipient-only access. No INSERT policy — RLS denies by default so
-- only the SECURITY DEFINER trigger below can create rows.
DROP POLICY IF EXISTS "Users can see their own notifications" ON public.notifications;
CREATE POLICY "Users can see their own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);

-- 6. Fan-out trigger on new recipes --------------------------------------
-- AFTER INSERT on recipes. Only fires for public recipes — there's no
-- value in pinging followers about content RLS hides from them. Inserts
-- one notification row per follower whose follows.notify_on_new_recipe
-- is TRUE. SECURITY DEFINER so the function can write to notifications
-- despite no public INSERT policy.
--
-- Failure isolation: if the notification insert errors, we DON'T want to
-- block the recipe creation itself. Wrap in BEGIN/EXCEPTION/END so a
-- delivery failure surfaces in Postgres logs but the parent transaction
-- commits the recipe. The author still gets their recipe; their
-- followers just don't get pinged. Worth more than strict consistency
-- here since the recipe is the canonical artifact and notifications are
-- a derived hint.
CREATE OR REPLACE FUNCTION public.notify_followers_on_new_recipe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_public = TRUE THEN
    BEGIN
      INSERT INTO public.notifications (user_id, kind, actor_id, recipe_id)
      SELECT f.follower_id, 'new_recipe', NEW.author_id, NEW.id
      FROM public.follows f
      WHERE f.following_id = NEW.author_id
        AND f.notify_on_new_recipe = TRUE;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_followers_on_new_recipe failed for recipe %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipes_notify_followers ON public.recipes;
CREATE TRIGGER recipes_notify_followers
  AFTER INSERT ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.notify_followers_on_new_recipe();

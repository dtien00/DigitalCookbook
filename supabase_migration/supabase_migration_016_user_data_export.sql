-- Migration 016: GDPR-style user data export RPC (Stage 16 item 4)
--
-- Adds `export_user_data(target_id UUID)` — a SECURITY DEFINER function
-- that returns a single JSONB blob containing every row the platform
-- holds about the requesting user. Powers the "Download my data" button
-- in the Profile → Security tab.
--
-- Auth gate: callers may only export their OWN data (auth.uid() = target_id).
-- SECURITY DEFINER is used so the function can read across RLS boundaries
-- in a single round-trip (e.g. notifications received from other users,
-- follow rows where the caller is the followed party, etc.) — every read
-- inside the function is still scoped to target_id, so privacy is preserved.
--
-- Scope decision: the original roadmap spec listed profile + recipes +
-- favorites + comments + follows. Cookbooks (Stage 14), likes (Stage 4),
-- notifications (Stage 11), and the caller's auth.users.email are also
-- included because they are all "data the platform holds about you" and
-- excluding them would defeat the GDPR-portability purpose. Documented
-- in refs/DATABASE_DECISIONS.md so the addition isn't accidental.
--
-- Run in Supabase Dashboard → SQL Editor. Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.export_user_data(target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_email TEXT;
  result JSONB;
BEGIN
  -- Auth gate: must be signed in AND can only export self.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'export_user_data: not signed in';
  END IF;
  IF auth.uid() <> target_id THEN
    RAISE EXCEPTION 'export_user_data: callers may only export their own data';
  END IF;

  -- Email lives on auth.users; pull it once for inclusion in the profile block.
  SELECT email INTO caller_email FROM auth.users WHERE id = target_id;

  SELECT jsonb_build_object(
    'export_version', 1,
    'exported_at', NOW(),
    'user_id', target_id,
    'profile', (
      SELECT jsonb_build_object(
        'id', p.id,
        'email', caller_email,
        'username', p.username,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'bio', p.bio,
        'is_admin', p.is_admin,
        'updated_at', p.updated_at
      )
      FROM public.profiles p WHERE p.id = target_id
    ),
    'recipes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'description', r.description,
        'image_url', r.image_url,
        'servings', r.servings,
        'is_public', r.is_public,
        'tags', r.tags,
        'created_at', r.created_at,
        'ingredients', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'name', i.name,
            'quantity', i.quantity,
            'unit', i.unit,
            'notes', i.notes,
            'order_index', i.order_index
          ) ORDER BY i.order_index, i.created_at)
          FROM public.ingredients i WHERE i.recipe_id = r.id
        ), '[]'::jsonb),
        'steps', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'step_number', s.step_number,
            'instruction', s.instruction,
            'image_url', s.image_url
          ) ORDER BY s.step_number)
          FROM public.steps s WHERE s.recipe_id = r.id
        ), '[]'::jsonb)
      ) ORDER BY r.created_at)
      FROM public.recipes r WHERE r.author_id = target_id
    ), '[]'::jsonb),
    'favorites', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'recipe_id', f.recipe_id,
        'created_at', f.created_at
      ) ORDER BY f.created_at)
      FROM public.favorites f WHERE f.user_id = target_id
    ), '[]'::jsonb),
    'likes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'recipe_id', l.recipe_id,
        'created_at', l.created_at
      ) ORDER BY l.created_at)
      FROM public.likes l WHERE l.user_id = target_id
    ), '[]'::jsonb),
    'comments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'recipe_id', c.recipe_id,
        'content', c.content,
        'created_at', c.created_at
      ) ORDER BY c.created_at)
      FROM public.comments c WHERE c.user_id = target_id
    ), '[]'::jsonb),
    'follows', jsonb_build_object(
      'following', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'following_id', f.following_id,
          'notify_on_new_recipe', f.notify_on_new_recipe,
          'created_at', f.created_at
        ) ORDER BY f.created_at)
        FROM public.follows f WHERE f.follower_id = target_id
      ), '[]'::jsonb),
      'followers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'follower_id', f.follower_id,
          'created_at', f.created_at
        ) ORDER BY f.created_at)
        FROM public.follows f WHERE f.following_id = target_id
      ), '[]'::jsonb)
    ),
    'cookbooks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cb.id,
        'title', cb.title,
        'description', cb.description,
        'cover_image_url', cb.cover_image_url,
        'is_public', cb.is_public,
        'created_at', cb.created_at,
        'updated_at', cb.updated_at,
        'recipes', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'recipe_id', cr.recipe_id,
            'position', cr.position,
            'added_at', cr.added_at
          ) ORDER BY cr.position, cr.added_at)
          FROM public.cookbook_recipes cr WHERE cr.cookbook_id = cb.id
        ), '[]'::jsonb)
      ) ORDER BY cb.created_at)
      FROM public.cookbooks cb WHERE cb.owner_id = target_id
    ), '[]'::jsonb),
    'notifications', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id,
        'kind', n.kind,
        'actor_id', n.actor_id,
        'recipe_id', n.recipe_id,
        'created_at', n.created_at,
        'read_at', n.read_at
      ) ORDER BY n.created_at)
      FROM public.notifications n WHERE n.user_id = target_id
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.export_user_data(UUID) TO authenticated;

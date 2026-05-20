import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

// Per-recipe comments hook. Unlike useLikes / useFavorites (which live
// at the App level and bulk-fetch tiny rows for the whole grid), comments
// are recipe-scoped, content-heavy, and only viewed one recipe at a time.
// So this hook mounts inside RecipeDetail and fetches just that recipe's
// comments.
//
// The fetch joins to `profiles` for the author's username and avatar.
// PostgREST resolves the relationship via the FK `comments.user_id ->
// profiles.id` (there's exactly one FK between the two tables, so no
// disambiguation needed). Profiles' RLS SELECT policy is `USING (true)`,
// so the join works for any commenter, signed-in or anonymous viewer.
//
// API:
//   const { comments, addComment, deleteComment, loading } = useComments(recipeId, userId)
//
// Each comment shape:
//   { id, recipe_id, user_id, content, created_at,
//     profiles: { username, avatar_url } | null }
//
// Sort order: newest first. Reading the latest reaction is the more
// common need on a casual recipe page; if a future "conversation thread"
// view wants chronological, flip the `ascending` flag.
//
// Optimistic UI:
//   - addComment: pushes a temp-id row immediately, swaps with the real
//     server row on success (which carries the joined `profiles`).
//     Rolls back (removes the temp row) on error and re-throws so the
//     caller can surface the failure.
//   - deleteComment: removes immediately, snapshots prior list, restores
//     on error. Silent failure (logs only) — delete-failed-then-rolled-
//     back is rare and intuitively re-tryable.
//
// When userId is null/undefined (anonymous), addComment and deleteComment
// are no-ops. The Comments component gates the input UI itself and calls
// onRequireAuth to prompt sign-in.
export function useComments(recipeId, userId) {
    const [comments, setComments] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!recipeId) return

        let active = true
        setLoading(true)

        ;(async () => {
            const { data, error } = await supabase
                .from('comments')
                .select('id, recipe_id, user_id, content, created_at, profiles(username, avatar_url)')
                .eq('recipe_id', recipeId)
                .order('created_at', { ascending: false })

            if (!active) return

            if (error) {
                console.error('Failed to fetch comments:', error.message)
                setComments([])
            } else {
                setComments(data || [])
            }
            setLoading(false)
        })()

        return () => { active = false }
    }, [recipeId])

    const addComment = useCallback(async (content) => {
        if (!userId || !content?.trim()) return

        const trimmed = content.trim()
        const tempId = `temp-${Date.now()}-${Math.random()}`
        const optimistic = {
            id: tempId,
            recipe_id: recipeId,
            user_id: userId,
            content: trimmed,
            created_at: new Date().toISOString(),
            profiles: null, // hydrated by the server response on success
        }
        setComments(prev => [optimistic, ...prev])

        try {
            const { data, error } = await supabase
                .from('comments')
                .insert({ recipe_id: recipeId, user_id: userId, content: trimmed })
                .select('id, recipe_id, user_id, content, created_at, profiles(username, avatar_url)')
                .single()

            if (error) throw error

            // Swap the optimistic temp row for the real server row (which
            // carries the joined profile data).
            setComments(prev => prev.map(c => c.id === tempId ? data : c))
        } catch (e) {
            console.error('Failed to add comment:', e.message)
            // Roll back — remove the optimistic row.
            setComments(prev => prev.filter(c => c.id !== tempId))
            throw e
        }
    }, [recipeId, userId])

    const deleteComment = useCallback(async (commentId) => {
        if (!userId) return

        // Snapshot for rollback. (Closure over `comments` is intentional —
        // useCallback's dep array includes it so we always see the latest.)
        const snapshot = comments
        setComments(prev => prev.filter(c => c.id !== commentId))

        try {
            const { error } = await supabase
                .from('comments')
                .delete()
                .eq('id', commentId)
                .eq('user_id', userId) // belt-and-suspenders; RLS also enforces

            if (error) throw error
        } catch (e) {
            console.error('Failed to delete comment:', e.message)
            setComments(snapshot)
        }
    }, [userId, comments])

    return { comments, addComment, deleteComment, loading }
}

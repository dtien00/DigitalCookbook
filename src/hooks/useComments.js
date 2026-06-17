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
//
// Comment likes (migration 019) are bulk-fetched alongside the comments
// in the same effect, keyed by the loaded comment ids. The hook exposes
// `commentLikeCount(id)` and `userLikedComment(id)` derived from a count
// Map and an own-Set — the same shape useLikes uses for recipe likes.
// Anonymous viewers see counts but `userLikedComment` is always false.
// `toggleCommentLike(id)` is optimistic with rollback on failure.
export function useComments(recipeId, userId, isAdmin = false) {
    const [comments, setComments] = useState([])
    const [commentLikeCounts, setCommentLikeCounts] = useState(() => new Map())
    const [userLikedCommentIds, setUserLikedCommentIds] = useState(() => new Set())
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!recipeId) return

        let active = true
        setLoading(true)

        ;(async () => {
            const { data, error } = await supabase
                .from('comments')
                .select('id, recipe_id, user_id, content, created_at, profiles!comments_user_id_fkey(username, avatar_url)')
                .eq('recipe_id', recipeId)
                .order('created_at', { ascending: false })

            if (!active) return

            if (error) {
                console.error('Failed to fetch comments:', error.message)
                setComments([])
                setCommentLikeCounts(new Map())
                setUserLikedCommentIds(new Set())
                setLoading(false)
                return
            }

            const loadedComments = data || []
            setComments(loadedComments)

            // Second hop: bulk-fetch comment_likes for this thread only.
            // We key on the loaded comment ids rather than recipe_id because
            // comment_likes has no recipe_id column (it'd duplicate the
            // comment->recipe relationship). At a thread's typical scale
            // this is one round-trip total.
            if (loadedComments.length === 0) {
                setCommentLikeCounts(new Map())
                setUserLikedCommentIds(new Set())
                setLoading(false)
                return
            }

            const commentIds = loadedComments.map(c => c.id)
            const { data: likeRows, error: likeError } = await supabase
                .from('comment_likes')
                .select('comment_id, user_id')
                .in('comment_id', commentIds)

            if (!active) return

            if (likeError) {
                console.error('Failed to fetch comment likes:', likeError.message)
                setCommentLikeCounts(new Map())
                setUserLikedCommentIds(new Set())
            } else {
                const counts = new Map()
                const own = new Set()
                for (const { comment_id, user_id } of likeRows) {
                    counts.set(comment_id, (counts.get(comment_id) ?? 0) + 1)
                    if (userId && user_id === userId) own.add(comment_id)
                }
                setCommentLikeCounts(counts)
                setUserLikedCommentIds(own)
            }
            setLoading(false)
        })()

        return () => { active = false }
    }, [recipeId, userId])

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
                .select('id, recipe_id, user_id, content, created_at, profiles!comments_user_id_fkey(username, avatar_url)')
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

    const toggleCommentLike = useCallback(async (commentId) => {
        if (!userId) return

        const wasLiked = userLikedCommentIds.has(commentId)
        const currentCount = commentLikeCounts.get(commentId) ?? 0

        // Optimistic — same pattern as useLikes.toggleLike.
        setUserLikedCommentIds(prev => {
            const next = new Set(prev)
            if (wasLiked) next.delete(commentId)
            else next.add(commentId)
            return next
        })
        setCommentLikeCounts(prev => {
            const next = new Map(prev)
            const newCount = currentCount + (wasLiked ? -1 : 1)
            if (newCount <= 0) next.delete(commentId)
            else next.set(commentId, newCount)
            return next
        })

        try {
            if (wasLiked) {
                const { error } = await supabase
                    .from('comment_likes')
                    .delete()
                    .eq('user_id', userId)
                    .eq('comment_id', commentId)
                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('comment_likes')
                    .insert({ user_id: userId, comment_id: commentId })
                if (error) throw error
            }
        } catch (e) {
            console.error('Failed to toggle comment like:', e.message)
            setUserLikedCommentIds(prev => {
                const next = new Set(prev)
                if (wasLiked) next.add(commentId)
                else next.delete(commentId)
                return next
            })
            setCommentLikeCounts(prev => {
                const next = new Map(prev)
                if (currentCount > 0) next.set(commentId, currentCount)
                else next.delete(commentId)
                return next
            })
        }
    }, [userId, userLikedCommentIds, commentLikeCounts])

    const commentLikeCount = useCallback(
        (commentId) => commentLikeCounts.get(commentId) ?? 0,
        [commentLikeCounts]
    )

    const userLikedComment = useCallback(
        (commentId) => userLikedCommentIds.has(commentId),
        [userLikedCommentIds]
    )

    const deleteComment = useCallback(async (commentId) => {
        if (!userId) return

        // Snapshot for rollback. (Closure over `comments` is intentional —
        // useCallback's dep array includes it so we always see the latest.)
        const snapshot = comments
        setComments(prev => prev.filter(c => c.id !== commentId))

        try {
            // Admins delete by id only — the admin-override DELETE policy
            // on `comments` (migration 008) gates by `public.is_admin()`,
            // not by user_id, so the belt-and-suspenders user_id filter
            // would prevent admin moderation. RLS still enforces the
            // correct authorization in both branches.
            let query = supabase.from('comments').delete().eq('id', commentId)
            if (!isAdmin) query = query.eq('user_id', userId)
            const { error } = await query

            if (error) throw error
        } catch (e) {
            console.error('Failed to delete comment:', e.message)
            setComments(snapshot)
        }
    }, [userId, isAdmin, comments])

    return {
        comments,
        addComment,
        deleteComment,
        loading,
        commentLikeCount,
        userLikedComment,
        toggleCommentLike,
    }
}

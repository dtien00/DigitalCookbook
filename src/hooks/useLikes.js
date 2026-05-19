import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

// Bulk-fetches all likes once and exposes per-recipe counts + the
// current user's liked set. Mirrors the useFavorites pattern but
// surfaces a count (likes are public; bookmarks are private), so a
// single query feeds both the count Map and the user-liked Set.
//
// At current scale (50 recipes × low single-digit likes each = ~150
// rows) this is well under any noticeable transfer cost. When the
// likes table grows past ~5k rows the same hook can be swapped for
// a Postgres view or a counter-column-with-trigger approach without
// changing the consumer API.
//
// API:
//   const { likeCount, userLiked, toggleLike, loading } = useLikes(userId)
//   likeCount(recipeId)  -> number      (0 if no likes)
//   userLiked(recipeId)  -> boolean     (false when anonymous)
//   toggleLike(recipeId) -> Promise<void>  (no-op when anonymous; caller
//                                           should gate to prompt sign-in)
export function useLikes(userId) {
    const [likeCounts, setLikeCounts] = useState(() => new Map())
    const [userLikedIds, setUserLikedIds] = useState(() => new Set())
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let active = true
        setLoading(true)

        ;(async () => {
            const { data, error } = await supabase
                .from('likes')
                .select('recipe_id, user_id')

            if (!active) return

            if (error) {
                console.error('Failed to fetch likes:', error.message)
                setLikeCounts(new Map())
                setUserLikedIds(new Set())
            } else {
                const counts = new Map()
                const own = new Set()
                for (const { recipe_id, user_id } of data) {
                    counts.set(recipe_id, (counts.get(recipe_id) ?? 0) + 1)
                    if (userId && user_id === userId) own.add(recipe_id)
                }
                setLikeCounts(counts)
                setUserLikedIds(own)
            }
            setLoading(false)
        })()

        return () => { active = false }
    }, [userId])

    const likeCount = useCallback(
        (recipeId) => likeCounts.get(recipeId) ?? 0,
        [likeCounts]
    )

    const userLiked = useCallback(
        (recipeId) => userLikedIds.has(recipeId),
        [userLikedIds]
    )

    const toggleLike = useCallback(async (recipeId) => {
        if (!userId) return

        const wasLiked = userLikedIds.has(recipeId)
        const currentCount = likeCounts.get(recipeId) ?? 0

        // Optimistic — flip both state values immediately so the UI feels instant.
        setUserLikedIds(prev => {
            const next = new Set(prev)
            if (wasLiked) next.delete(recipeId)
            else next.add(recipeId)
            return next
        })
        setLikeCounts(prev => {
            const next = new Map(prev)
            const newCount = currentCount + (wasLiked ? -1 : 1)
            if (newCount <= 0) next.delete(recipeId)
            else next.set(recipeId, newCount)
            return next
        })

        try {
            if (wasLiked) {
                const { error } = await supabase
                    .from('likes')
                    .delete()
                    .eq('user_id', userId)
                    .eq('recipe_id', recipeId)
                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('likes')
                    .insert({ user_id: userId, recipe_id: recipeId })
                if (error) throw error
            }
        } catch (e) {
            console.error('Failed to toggle like:', e.message)
            // Roll back both updates on failure.
            setUserLikedIds(prev => {
                const next = new Set(prev)
                if (wasLiked) next.add(recipeId)
                else next.delete(recipeId)
                return next
            })
            setLikeCounts(prev => {
                const next = new Map(prev)
                if (currentCount > 0) next.set(recipeId, currentCount)
                else next.delete(recipeId)
                return next
            })
        }
    }, [userId, userLikedIds, likeCounts])

    return { likeCount, userLiked, toggleLike, loading }
}

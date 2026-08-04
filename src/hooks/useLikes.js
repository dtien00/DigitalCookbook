import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

// Split hook (Stage 20 §1.2): the two things this hook exposes have very
// different natural sizes, so they now have two different sources.
//
//   - Own-likes (the current user's liked Set) scale with ONE user's
//     enthusiasm. Sourced from a `user_id`-scoped query. Skipped entirely
//     for anonymous visitors — there's no "you" to have likes.
//   - Public counts scale with recipes, and every surface already fetches
//     the recipes it displays. Migration 014's `recipes_with_counts` view
//     exposes `like_count` on each recipe row, so counts ride along on data
//     already in flight. The hook holds them in a Map (seeded via
//     `seedCounts`/`fetchCounts`) so the optimistic toggle and cross-surface
//     consistency stay in one place without a global store.
//
// This deletes the old design's platform-wide `SELECT * FROM likes` that ran
// on every app mount for every visitor (the only App-level query whose size
// grew with total usage — see refs/DATABASE_DECISIONS.md "count strategy").
//
// API:
//   const { likeCount, userLiked, toggleLike, seedCounts, fetchCounts, refetch, loading } = useLikes(userId)
//   likeCount(recipeId)  -> number      (0 until the recipe's row is seeded)
//   userLiked(recipeId)  -> boolean     (false when anonymous)
//   toggleLike(recipeId) -> Promise<void>  (no-op when anonymous; caller
//                                           should gate to prompt sign-in)
//   seedCounts(rows)     -> void        (merge like_count from view rows the
//                                        caller just fetched)
//   fetchCounts(ids)     -> Promise<void>  (for surfaces whose rows don't
//                                        carry like_count — embed queries;
//                                        bounded to the passed ids)
//   refetch()            -> Promise<void>  (re-sync own-likes + counts for
//                                        loaded recipes; used by admin reset)
export function useLikes(userId) {
    const [likeCounts, setLikeCounts] = useState(() => new Map())
    const [userLikedIds, setUserLikedIds] = useState(() => new Set())
    const [loading, setLoading] = useState(true)

    // Mirror the count Map into a ref so `refetch` can read the currently
    // loaded recipe ids without taking `likeCounts` as a dependency (which
    // would rebuild refetch — and every prop threaded from it — on every seed).
    const likeCountsRef = useRef(likeCounts)
    useEffect(() => { likeCountsRef.current = likeCounts }, [likeCounts])

    // Merge like counts from rows that carry `like_count` (i.e. rows fetched
    // from `recipes_with_counts`). Returns the previous Map untouched when
    // nothing changed so callers can seed inside a fetch without forcing a
    // re-render on every page load.
    const seedCounts = useCallback((rows) => {
        if (!rows || rows.length === 0) return
        setLikeCounts(prev => {
            let next = null
            for (const row of rows) {
                if (!row || row.id == null || row.like_count == null) continue
                const n = Number(row.like_count)
                if (prev.get(row.id) === n) continue
                if (!next) next = new Map(prev)
                next.set(row.id, n)
            }
            return next || prev
        })
    }, [])

    // Fetch counts for a bounded set of recipe ids and seed them. For
    // surfaces whose recipe rows arrive through a PostgREST embed (favorites,
    // cookbook_recipes) and therefore can't carry the view's `like_count`.
    const fetchCounts = useCallback(async (ids) => {
        const unique = [...new Set((ids || []).filter(Boolean))]
        if (unique.length === 0) return
        const { data, error } = await supabase
            .from('recipes_with_counts')
            .select('id, like_count')
            .in('id', unique)
        if (error) {
            console.error('Failed to fetch like counts:', error.message)
            return
        }
        seedCounts(data)
    }, [seedCounts])

    // Own-likes only. Scoped to the caller; no query at all when anonymous.
    useEffect(() => {
        let active = true
        setLoading(true)

        if (!userId) {
            setUserLikedIds(new Set())
            setLoading(false)
            return
        }

        ;(async () => {
            const { data, error } = await supabase
                .from('likes')
                .select('recipe_id')
                .eq('user_id', userId)

            if (!active) return

            if (error) {
                console.error('Failed to fetch your likes:', error.message)
                setUserLikedIds(new Set())
            } else {
                setUserLikedIds(new Set(data.map(r => r.recipe_id)))
            }
            setLoading(false)
        })()

        return () => { active = false }
    }, [userId])

    // Re-sync to server truth. Used by the admin "Reset likes" path, which
    // deletes every like for a recipe server-side: refetching own-likes drops
    // it from the liked Set, and refetching counts for the loaded recipes
    // (bounded to what's in memory, not the whole table) brings its count to 0.
    const refetch = useCallback(async () => {
        if (userId) {
            const { data, error } = await supabase
                .from('likes')
                .select('recipe_id')
                .eq('user_id', userId)
            if (error) console.error('Failed to fetch your likes:', error.message)
            else setUserLikedIds(new Set(data.map(r => r.recipe_id)))
        } else {
            setUserLikedIds(new Set())
        }
        await fetchCounts([...likeCountsRef.current.keys()])
    }, [userId, fetchCounts])

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

    return { likeCount, userLiked, toggleLike, seedCounts, fetchCounts, refetch, loading }
}

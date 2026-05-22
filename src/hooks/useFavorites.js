import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

// Bulk-fetches the current user's favorited recipe IDs once and exposes
// O(1) membership + a toggle function. Lives at the App level so grid
// views of 30+ cards don't each fire their own query (N+1).
//
// API:
//   const { isFavorited, toggleFavorite, loading } = useFavorites(userId)
//
//   isFavorited(recipeId): boolean
//   toggleFavorite(recipeId): Promise<void>  // optimistic, rolls back on error
//
// When userId is null/undefined (anonymous viewer), the hook returns an
// empty set and toggleFavorite is a no-op. Callers gate the bookmark
// button's onClick to prompt sign-in for anonymous users themselves.
export function useFavorites(userId) {
    const [favoritedIds, setFavoritedIds] = useState(() => new Set())
    const [loading, setLoading] = useState(false)

    // Re-fetches the user's favorited recipe IDs. Used by the admin
    // "Reset bookmarks" path on RecipeDetail — wipes server-side rows
    // across all users for a given recipe, and refetch refreshes the
    // current user's own set (which will no longer include that recipe).
    const refetch = useCallback(async () => {
        if (!userId) {
            setFavoritedIds(new Set())
            return
        }
        const { data, error } = await supabase
            .from('favorites')
            .select('recipe_id')
            .eq('user_id', userId)
        if (error) {
            console.error('Failed to fetch favorites:', error.message)
            return
        }
        setFavoritedIds(new Set(data.map(f => f.recipe_id)))
    }, [userId])

    useEffect(() => {
        if (!userId) {
            setFavoritedIds(new Set())
            setLoading(false)
            return
        }

        let active = true
        setLoading(true)

        ;(async () => {
            const { data, error } = await supabase
                .from('favorites')
                .select('recipe_id')
                .eq('user_id', userId)

            if (!active) return

            if (error) {
                console.error('Failed to fetch favorites:', error.message)
                setFavoritedIds(new Set())
            } else {
                setFavoritedIds(new Set(data.map(f => f.recipe_id)))
            }
            setLoading(false)
        })()

        return () => { active = false }
    }, [userId])

    const isFavorited = useCallback(
        (recipeId) => favoritedIds.has(recipeId),
        [favoritedIds]
    )

    const toggleFavorite = useCallback(async (recipeId) => {
        if (!userId) return

        const wasFavorited = favoritedIds.has(recipeId)

        // Optimistic update first — the UI flips immediately so the click feels instant.
        setFavoritedIds(prev => {
            const next = new Set(prev)
            if (wasFavorited) next.delete(recipeId)
            else next.add(recipeId)
            return next
        })

        try {
            if (wasFavorited) {
                const { error } = await supabase
                    .from('favorites')
                    .delete()
                    .eq('user_id', userId)
                    .eq('recipe_id', recipeId)
                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('favorites')
                    .insert({ user_id: userId, recipe_id: recipeId })
                if (error) throw error
            }
        } catch (e) {
            console.error('Failed to toggle favorite:', e.message)
            // Roll back the optimistic update on failure.
            setFavoritedIds(prev => {
                const next = new Set(prev)
                if (wasFavorited) next.add(recipeId)
                else next.delete(recipeId)
                return next
            })
        }
    }, [userId, favoritedIds])

    return { isFavorited, toggleFavorite, refetch, loading }
}

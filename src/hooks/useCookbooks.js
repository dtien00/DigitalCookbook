import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'

// Bulk-fetches the current user's own cookbooks + their recipe-membership
// once at App level. Mirrors useFavorites / useFollowing / useLikes — one
// query, O(1) membership lookups, optimistic mutators with rollback.
//
// Unlike the membership-only hooks (useFavorites stores a Set of recipe
// IDs), cookbooks are first-class entities the UI renders — so the state
// shape is a Map<cookbookId, { ...cookbookFields, recipeIds: Set<string> }>.
// One PostgREST embed gets both sides:
//
//   select('*, cookbook_recipes(recipe_id)')
//
// API:
//   const {
//     cookbooks,                    // Array<cookbook>, newest first
//     getCookbookRecipeIds,         // (cookbookId) => Set<string>
//     isRecipeInCookbook,           // (cookbookId, recipeId) => boolean
//     createCookbook,               // ({ title, description, is_public, cover_image_url }) => Promise<cookbook>
//     updateCookbook,               // (cookbookId, patch) => Promise<void>
//     deleteCookbook,               // (cookbookId) => Promise<void>
//     addRecipeToCookbook,          // (cookbookId, recipeId) => Promise<void>   optimistic
//     removeRecipeFromCookbook,     // (cookbookId, recipeId) => Promise<void>   optimistic
//     loading,
//   } = useCookbooks(userId)
//
// When userId is null/undefined (anonymous viewer), cookbooks is empty
// and all mutators are no-ops. Callers gate "Add to cookbook" affordances
// to prompt sign-in for anonymous users themselves.
export function useCookbooks(userId) {
    const [cookbookMap, setCookbookMap] = useState(() => new Map())
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!userId) {
            setCookbookMap(new Map())
            setLoading(false)
            return
        }

        let active = true
        setLoading(true)

        ;(async () => {
            const { data, error } = await supabase
                .from('cookbooks')
                .select('*, cookbook_recipes(recipe_id)')
                .eq('owner_id', userId)
                .order('created_at', { ascending: false })

            if (!active) return

            if (error) {
                console.error('Failed to fetch cookbooks:', error.message)
                setCookbookMap(new Map())
            } else {
                const next = new Map()
                for (const row of data) {
                    const { cookbook_recipes, ...cookbook } = row
                    next.set(cookbook.id, {
                        ...cookbook,
                        recipeIds: new Set((cookbook_recipes ?? []).map(cr => cr.recipe_id)),
                    })
                }
                setCookbookMap(next)
            }
            setLoading(false)
        })()

        return () => { active = false }
    }, [userId])

    // Derived array — sorted newest first, ready to render.
    const cookbooks = useMemo(() => {
        return Array.from(cookbookMap.values()).sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
        )
    }, [cookbookMap])

    const getCookbookRecipeIds = useCallback(
        (cookbookId) => cookbookMap.get(cookbookId)?.recipeIds ?? new Set(),
        [cookbookMap]
    )

    const isRecipeInCookbook = useCallback(
        (cookbookId, recipeId) => cookbookMap.get(cookbookId)?.recipeIds.has(recipeId) ?? false,
        [cookbookMap]
    )

    const createCookbook = useCallback(async ({ title, description = null, is_public = false, cover_image_url = null }) => {
        if (!userId) return null
        const { data, error } = await supabase
            .from('cookbooks')
            .insert({ owner_id: userId, title, description, is_public, cover_image_url })
            .select()
            .single()
        if (error) {
            console.error('Failed to create cookbook:', error.message)
            throw error
        }
        setCookbookMap(prev => {
            const next = new Map(prev)
            next.set(data.id, { ...data, recipeIds: new Set() })
            return next
        })
        return data
    }, [userId])

    const updateCookbook = useCallback(async (cookbookId, patch) => {
        if (!userId || !cookbookId) return
        const prior = cookbookMap.get(cookbookId)
        if (!prior) return

        // Optimistic merge.
        setCookbookMap(prev => {
            const next = new Map(prev)
            next.set(cookbookId, { ...prior, ...patch, updated_at: new Date().toISOString() })
            return next
        })

        try {
            const { error } = await supabase
                .from('cookbooks')
                .update({ ...patch, updated_at: new Date().toISOString() })
                .eq('id', cookbookId)
            if (error) throw error
        } catch (e) {
            console.error('Failed to update cookbook:', e.message)
            setCookbookMap(prev => {
                const next = new Map(prev)
                next.set(cookbookId, prior)
                return next
            })
        }
    }, [userId, cookbookMap])

    const deleteCookbook = useCallback(async (cookbookId) => {
        if (!userId || !cookbookId) return
        const prior = cookbookMap.get(cookbookId)
        if (!prior) return

        setCookbookMap(prev => {
            const next = new Map(prev)
            next.delete(cookbookId)
            return next
        })

        try {
            const { error } = await supabase
                .from('cookbooks')
                .delete()
                .eq('id', cookbookId)
            if (error) throw error
        } catch (e) {
            console.error('Failed to delete cookbook:', e.message)
            setCookbookMap(prev => {
                const next = new Map(prev)
                next.set(cookbookId, prior)
                return next
            })
        }
    }, [userId, cookbookMap])

    const addRecipeToCookbook = useCallback(async (cookbookId, recipeId) => {
        if (!userId || !cookbookId || !recipeId) return
        const cookbook = cookbookMap.get(cookbookId)
        if (!cookbook || cookbook.recipeIds.has(recipeId)) return

        setCookbookMap(prev => {
            const next = new Map(prev)
            const updated = { ...cookbook, recipeIds: new Set(cookbook.recipeIds) }
            updated.recipeIds.add(recipeId)
            next.set(cookbookId, updated)
            return next
        })

        try {
            // position defaults to 0 server-side; client-side ordering ties
            // break by added_at, so leaving position unset is fine for the
            // "Add to cookbook" use case. Drag-to-reorder on the cookbook
            // page will write explicit positions later.
            const { error } = await supabase
                .from('cookbook_recipes')
                .insert({ cookbook_id: cookbookId, recipe_id: recipeId })
            if (error) throw error
        } catch (e) {
            console.error('Failed to add recipe to cookbook:', e.message)
            setCookbookMap(prev => {
                const next = new Map(prev)
                const reverted = { ...cookbook, recipeIds: new Set(cookbook.recipeIds) }
                reverted.recipeIds.delete(recipeId)
                next.set(cookbookId, reverted)
                return next
            })
        }
    }, [userId, cookbookMap])

    const removeRecipeFromCookbook = useCallback(async (cookbookId, recipeId) => {
        if (!userId || !cookbookId || !recipeId) return
        const cookbook = cookbookMap.get(cookbookId)
        if (!cookbook || !cookbook.recipeIds.has(recipeId)) return

        setCookbookMap(prev => {
            const next = new Map(prev)
            const updated = { ...cookbook, recipeIds: new Set(cookbook.recipeIds) }
            updated.recipeIds.delete(recipeId)
            next.set(cookbookId, updated)
            return next
        })

        try {
            const { error } = await supabase
                .from('cookbook_recipes')
                .delete()
                .eq('cookbook_id', cookbookId)
                .eq('recipe_id', recipeId)
            if (error) throw error
        } catch (e) {
            console.error('Failed to remove recipe from cookbook:', e.message)
            setCookbookMap(prev => {
                const next = new Map(prev)
                const reverted = { ...cookbook, recipeIds: new Set(cookbook.recipeIds) }
                reverted.recipeIds.add(recipeId)
                next.set(cookbookId, reverted)
                return next
            })
        }
    }, [userId, cookbookMap])

    return {
        cookbooks,
        getCookbookRecipeIds,
        isRecipeInCookbook,
        createCookbook,
        updateCookbook,
        deleteCookbook,
        addRecipeToCookbook,
        removeRecipeFromCookbook,
        loading,
    }
}

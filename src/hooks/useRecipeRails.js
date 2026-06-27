import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Stage 17a — fetches two recommendation rails for the current recipe:
// "More from this author" and "Similar tags". Both are public-only and
// exclude the current recipe. Each rail is independently empty-state-
// hidden by <RecipeRail>, so the hook itself makes no visibility call.
//
// Scope chosen as per-recipe (mounted from RecipeDetail) rather than the
// App-level bulk pattern of useLikes/useFavorites — rails are scoped to
// a single recipe at a time and the data isn't shared with other views,
// so the per-recipe useComments shape is the right precedent.
export default function useRecipeRails(recipe) {
    const [authorRecipes, setAuthorRecipes] = useState([])
    const [similarRecipes, setSimilarRecipes] = useState([])
    const [loading, setLoading] = useState(true)

    const recipeId = recipe?.id
    const authorId = recipe?.author_id
    // Stable string for the tags dep so useEffect doesn't re-fire on identity
    // changes to the array. recipe.tags is rebuilt on every parent render.
    const tagsKey = (recipe?.tags || []).join(',')

    useEffect(() => {
        if (!recipeId) return
        let cancelled = false
        setLoading(true)

        async function run() {
            // Author rail — RLS already filters to public-or-own; the explicit
            // is_public=true keeps the rail public-facing regardless of viewer
            // (the author shouldn't see their own privates surfaced here either —
            // they have the profile page for that).
            const authorPromise = authorId
                ? supabase
                    .from('recipes')
                    .select('id, title, description, image_url, tags, is_public')
                    .eq('author_id', authorId)
                    .eq('is_public', true)
                    .neq('id', recipeId)
                    .order('created_at', { ascending: false })
                    .limit(6)
                : Promise.resolve({ data: [], error: null })

            // Similar-tags rail — Postgres doesn't have a simple
            // "array intersection length" operator usable in ORDER BY, so we
            // pull up to 20 candidates via `overlaps` (the && operator) and
            // rank by intersection size in JS. At current corpus size the
            // 20-row ceiling is plenty; a future SQL upgrade path (ts_vector
            // or a precomputed similarity score) is in DATABASE_DECISIONS.md
            // if the corpus grows past it.
            const tags = (recipe?.tags || []).filter(Boolean)
            const similarPromise = tags.length > 0
                ? supabase
                    .from('recipes')
                    .select('id, title, description, image_url, tags, is_public')
                    .eq('is_public', true)
                    .neq('id', recipeId)
                    .overlaps('tags', tags)
                    .limit(20)
                : Promise.resolve({ data: [], error: null })

            const [authorRes, similarRes] = await Promise.all([authorPromise, similarPromise])
            if (cancelled) return

            if (authorRes.error) {
                console.error('useRecipeRails author error:', authorRes.error.message)
            }
            if (similarRes.error) {
                console.error('useRecipeRails similar error:', similarRes.error.message)
            }

            const ranked = (similarRes.data || [])
                .map(r => ({
                    recipe: r,
                    overlap: (r.tags || []).filter(t => tags.includes(t)).length,
                }))
                .sort((a, b) => b.overlap - a.overlap)
                .slice(0, 6)
                .map(x => x.recipe)

            setAuthorRecipes(authorRes.data || [])
            setSimilarRecipes(ranked)
            setLoading(false)
        }

        run()
        return () => { cancelled = true }
        // `tagsKey` is the stable serialization of `recipe?.tags`; depending on
        // the array directly would re-run on every identity change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recipeId, authorId, tagsKey])

    return { authorRecipes, similarRecipes, loading }
}

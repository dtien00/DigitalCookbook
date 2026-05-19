import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import RecipeCard from './RecipeCard'

// Shows the current user's bookmarked recipes, sorted by when they
// were saved. Mounts a fresh fetch each time the user navigates here.
//
// Unbookmarking from inside this view: we filter the displayed list
// against `isFavorited` from the shared App-level useFavorites state,
// so a card disappears immediately when the user toggles it off
// (optimistic). If the toggle fails server-side it rolls back and the
// card reappears.
export default function MyBookmarks({ session, onBack, onRecipeClick, isFavorited, onToggleFavorite }) {
    const [recipes, setRecipes] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let active = true
        ;(async () => {
            try {
                setLoading(true)
                const { data, error } = await supabase
                    .from('favorites')
                    .select('created_at, recipe:recipes(*)')
                    .eq('user_id', session.user.id)
                    .order('created_at', { ascending: false })

                if (!active) return
                if (error) throw error
                // Defensive: filter null recipes in case a referenced recipe
                // was deleted between favorite-insert and now (FK cascade
                // would normally clean it up, but the join may briefly return
                // null during the window).
                setRecipes(data?.map(d => d.recipe).filter(Boolean) || [])
            } catch (error) {
                console.error('Error fetching bookmarks:', error.message)
                if (active) setRecipes([])
            } finally {
                if (active) setLoading(false)
            }
        })()
        return () => { active = false }
    }, [session.user.id])

    // Hide cards the user unbookmarked while on this view. The fetched
    // list is the source of truth for *which* recipes; isFavorited gates
    // visibility.
    const displayedRecipes = recipes.filter(r => isFavorited(r.id))

    return (
        <div className="max-w-7xl mx-auto px-5 py-5">
            <header className="flex justify-between items-center mb-10">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-md transition-colors"
                    >
                        ← Back
                    </button>
                    <h1 className="text-2xl font-semibold text-gray-900">My Bookmarks</h1>
                </div>
                <span className="text-gray-500 text-sm">
                    {!loading && `${displayedRecipes.length} saved`}
                </span>
            </header>

            {loading ? (
                <p className="text-gray-500">Loading bookmarks...</p>
            ) : displayedRecipes.length === 0 ? (
                <div className="text-center py-16">
                    <p className="text-gray-700 text-lg mb-2">No bookmarks yet.</p>
                    <p className="text-gray-500">Save recipes you love by tapping the bookmark icon on any card.</p>
                </div>
            ) : (
                <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4">
                    {displayedRecipes.map(recipe => (
                        <RecipeCard
                            key={recipe.id}
                            recipe={recipe}
                            onClick={() => onRecipeClick(recipe)}
                            favorited={isFavorited(recipe.id)}
                            onToggleFavorite={() => onToggleFavorite(recipe.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

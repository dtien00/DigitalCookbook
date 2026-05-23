import { useState, useEffect } from 'react'
import { useParams, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import RecipeCard from './RecipeCard'

// Read-only author profile at /profile/:id. Sibling to /profile (the
// self-edit view in Profile.jsx); routed separately so this component
// stays free of any edit affordances or password-change forms — RLS would
// reject the writes regardless, but hiding the controls keeps the UX
// honest. Viewing your own id redirects to /profile so there's a single
// canonical surface for editing.
//
// Recipe visibility piggybacks on the existing RLS policy on `recipes`
// (`is_public OR auth.uid() = author_id`), so:
//   - viewing another author shows only their public recipes
//   - viewing yourself (before the redirect lands) would show public +
//     private, but the redirect fires first
// No new policies needed.
export default function AuthorProfile({
    session,
    isFavorited,
    onToggleFavorite,
    likeCount,
    userLiked,
    onToggleLike,
}) {
    const { id } = useParams()
    const navigate = useNavigate()

    const [profile, setProfile] = useState(null)
    const [recipes, setRecipes] = useState([])
    const [fetchState, setFetchState] = useState('loading') // 'loading' | 'idle' | 'notfound'

    useEffect(() => {
        let cancelled = false
        setFetchState('loading')

        async function load() {
            const [{ data: profileData, error: profileError }, { data: recipeData, error: recipeError }] = await Promise.all([
                supabase
                    .from('profiles')
                    .select('id, username, full_name, bio, avatar_url')
                    .eq('id', id)
                    .maybeSingle(),
                supabase
                    .from('recipes')
                    .select('*')
                    .eq('author_id', id)
                    .order('created_at', { ascending: false }),
            ])

            if (cancelled) return

            if (profileError || !profileData) {
                setFetchState('notfound')
                setProfile(null)
                setRecipes([])
                return
            }
            if (recipeError) console.error('Error fetching author recipes:', recipeError.message)

            setProfile(profileData)
            setRecipes(recipeData || [])
            setFetchState('idle')
        }

        load()
        return () => { cancelled = true }
    }, [id])

    // Viewing your own id → bounce to the self-edit route. Checked AFTER
    // useParams resolves; session may be null for anonymous viewers, in
    // which case the comparison is trivially false.
    if (session?.user.id === id) return <Navigate to="/profile" replace />

    if (fetchState === 'loading') {
        return (
            <div className="paper-grain min-h-screen flex items-center justify-center">
                <p className="font-display italic text-rose" role="status">Loading profile…</p>
            </div>
        )
    }

    if (fetchState === 'notfound') {
        return (
            <div className="paper-grain min-h-screen">
                <div className="max-w-3xl mx-auto px-5 py-16 text-center">
                    <p className="text-2xl text-tan mb-4">✦</p>
                    <p className="font-display text-xl text-ink mb-2">Author not found</p>
                    <p className="font-display italic text-rose mb-6">The link may be incorrect, or this account no longer exists.</p>
                    <button
                        onClick={() => navigate('/')}
                        className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors"
                    >
                        ← Back to recipes
                    </button>
                </div>
            </div>
        )
    }

    const displayName = profile.username?.trim() || profile.full_name?.trim() || 'Anonymous chef'
    const subtitle = profile.username && profile.full_name?.trim() && profile.full_name.trim() !== profile.username.trim()
        ? profile.full_name.trim()
        : null

    return (
        <div className="paper-grain min-h-screen">
            <div className="max-w-5xl mx-auto px-5 py-8">
                <div className="flex justify-between items-center mb-6">
                    <button
                        onClick={() => navigate('/')}
                        className="px-4 py-2.5 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors"
                    >
                        ← Back to List
                    </button>
                </div>

                <header className="text-center mb-10 pb-8 border-b border-paper-shade">
                    {profile.avatar_url ? (
                        <img
                            src={profile.avatar_url}
                            alt=""
                            loading="lazy"
                            className="w-24 h-24 rounded-full mx-auto mb-4 object-cover border-2 border-paper-shade"
                        />
                    ) : (
                        <div
                            aria-hidden="true"
                            className="w-24 h-24 rounded-full mx-auto mb-4 bg-tan-soft text-ink font-display text-3xl font-semibold flex items-center justify-center"
                        >
                            {displayName.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <h1 className="font-display text-3xl font-semibold text-ink m-0">{displayName}</h1>
                    {subtitle && (
                        <p className="font-display italic text-ink/60 mt-1">{subtitle}</p>
                    )}
                    {profile.bio && (
                        <p className="font-serif text-ink/80 mt-4 max-w-xl mx-auto leading-relaxed">{profile.bio}</p>
                    )}
                </header>

                <section>
                    <h2 className="font-display text-xl font-semibold text-ink mb-4">
                        Recipes ({recipes.length})
                    </h2>
                    {recipes.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-2xl text-tan mb-3">✦</p>
                            <p className="font-display text-lg text-ink mb-1">No public recipes yet.</p>
                            <p className="font-display italic text-rose">{displayName} hasn't shared anything you can see.</p>
                        </div>
                    ) : (
                        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4">
                            {recipes.map(recipe => (
                                <RecipeCard
                                    key={recipe.id}
                                    recipe={recipe}
                                    onClick={() => navigate(`/recipe/${recipe.id}`)}
                                    favorited={isFavorited ? isFavorited(recipe.id) : false}
                                    onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(recipe.id) : undefined}
                                    liked={userLiked ? userLiked(recipe.id) : false}
                                    likeCount={likeCount ? likeCount(recipe.id) : 0}
                                    onToggleLike={onToggleLike ? () => onToggleLike(recipe.id) : undefined}
                                />
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    )
}

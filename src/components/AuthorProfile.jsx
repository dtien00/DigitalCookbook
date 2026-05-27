import { useState, useEffect, useRef } from 'react'
import { useParams, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import RecipeCard from './RecipeCard'
import ProfileBookSpread from './ProfileBookSpread'
import RecipesCarousel from './RecipesCarousel'

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
    isFollowing,
    getNotifyPref,
    onToggleFollow,
    onSetNotifyPref,
}) {
    const { id } = useParams()
    const navigate = useNavigate()

    const [profile, setProfile] = useState(null)
    const [recipes, setRecipes] = useState([])
    const [fetchState, setFetchState] = useState('loading') // 'loading' | 'idle' | 'notfound'

    // Measure the left page's intrinsic content (avatar + identity +
    // bio + follow controls) so the recipes carousel on the right page
    // can cap to match — keeps the book spread visually rectangular
    // even when the author has many public recipes (Stage 14 item 2
    // follow-up). ResizeObserver re-fires on bio/identity reflow.
    const leftContentRef = useRef(null)
    const [leftContentHeight, setLeftContentHeight] = useState(null)

    useEffect(() => {
        const el = leftContentRef.current
        if (!el || typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(entries => {
            const next = entries[0]?.contentRect.height
            if (next) setLeftContentHeight(next)
        })
        observer.observe(el)
        return () => observer.disconnect()
    }, [profile])

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
        <ProfileBookSpread
            header={
                <header className="flex items-center gap-4 flex-wrap">
                    <button
                        onClick={() => navigate('/')}
                        className="px-4 py-2.5 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors"
                    >
                        ← Back to List
                    </button>
                </header>
            }
            leftPage={
                <div
                    ref={leftContentRef}
                    className="text-center flex flex-col items-center gap-3"
                    /* Match the fixed-height envelope used by <ProfileTabs>
                       on /profile and <FollowingPhonebook> on
                       /profile/following so the right-page carousel reads
                       the same maxHeight and produces the same 2×2 layout
                       across all three book surfaces. Without this floor,
                       AuthorProfile's intrinsic content (avatar + bio +
                       follow controls) is ~300px — below the 520px
                       cards-per-page threshold — so the carousel drops to
                       2 cards per page here while Profile shows 4. */
                    style={{ minHeight: 'min(75vh, 700px)' }}
                >
                    {profile.avatar_url ? (
                        <img
                            src={profile.avatar_url}
                            alt=""
                            loading="lazy"
                            className="w-24 h-24 rounded-full object-cover border-2 border-paper-shade"
                        />
                    ) : (
                        <div
                            aria-hidden="true"
                            className="w-24 h-24 rounded-full bg-tan-soft text-ink font-display text-3xl font-semibold flex items-center justify-center"
                        >
                            {displayName.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div>
                        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink m-0">{displayName}</h1>
                        {subtitle && (
                            <p className="font-display italic text-ink/60 mt-1">{subtitle}</p>
                        )}
                    </div>
                    {profile.bio && (
                        <p className="font-serif text-ink/80 mt-2 leading-relaxed">{profile.bio}</p>
                    )}

                    {/* Follow control. Hidden when viewing your own profile
                        (the self-id redirect at the top of the component
                        already covers this for signed-in users, but the
                        guard belongs here too for clarity). Anonymous click
                        is routed by App's wrapper to open the Auth overlay.
                        Notify toggle only renders when following — opt-in
                        for new-recipe pings (Stage 11 in-app notifications). */}
                    {onToggleFollow && session?.user.id !== profile.id && (
                        <div className="mt-4 flex flex-col items-center gap-2 w-full">
                            {isFollowing?.(profile.id) ? (
                                <>
                                    {/* Following status + explicit Unfollow. Two distinct
                                        controls: "Following" reads as the current state
                                        (paper-shade, neutral, with a checkmark glyph) and
                                        "Unfollow" reads as the action (rose-tinted,
                                        destructive). Splitting them avoids the discoverability
                                        gap where a single "Following" button silently
                                        toggled off on click. */}
                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                        <span
                                            aria-label={`Currently following ${displayName}`}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-paper-shade text-ink font-semibold rounded-full border border-paper-shade min-h-[44px]"
                                        >
                                            <svg aria-hidden="true" viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="3 8 7 12 13 4" />
                                            </svg>
                                            Following
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => onToggleFollow(profile.id)}
                                            aria-label={`Unfollow ${displayName}`}
                                            className="px-4 py-2 bg-rose-dark hover:bg-rose text-paper font-semibold rounded-full transition-colors min-h-[44px]"
                                        >
                                            Unfollow
                                        </button>
                                    </div>
                                    <label className="inline-flex items-start gap-2 mt-1 text-sm text-ink/70 font-serif cursor-pointer select-none text-left">
                                        <input
                                            type="checkbox"
                                            checked={getNotifyPref?.(profile.id) ?? false}
                                            onChange={(e) => onSetNotifyPref?.(profile.id, e.target.checked)}
                                            className="accent-rust w-4 h-4 cursor-pointer mt-0.5"
                                        />
                                        <span>Notify me when {displayName} posts a new recipe</span>
                                    </label>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => onToggleFollow(profile.id)}
                                    className="px-5 py-2 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-full transition-colors min-h-[44px]"
                                >
                                    Follow
                                </button>
                            )}
                        </div>
                    )}
                </div>
            }
            rightPage={
                <section className="min-w-0">
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
                        <RecipesCarousel
                            recipes={recipes}
                            maxHeight={leftContentHeight}
                            renderRecipe={(recipe) => (
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
                            )}
                        />
                    )}
                </section>
            }
        />
    )
}

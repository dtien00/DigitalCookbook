import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import ProfileBookSpread from './ProfileBookSpread'
import RecipesCarousel from './RecipesCarousel'
import RecipeCard from './RecipeCard'

// Stage 14 item 5 — the phonebook book. A second book-spread surface
// (parallel to /profile and /profile/:id) for browsing the people the
// signed-in user follows.
//
//   Left page  = bookmark-ribbon list of followed authors. Clicking a
//                bookmark selects that author; the active bookmark
//                pushes out from the spine, mirroring how a real book
//                bookmark protrudes when in use.
//   Right page = the selected author's public recipes, in the same
//                <RecipesCarousel> the rest of the profile uses, so
//                paging chrome / wheel-snap / swipe gestures behave
//                identically to /profile and /profile/:id.
//
// Why a separate route and not the in-tab Following list from item 4:
// the followed-authors set is conceptually its own "book", not a
// section of the user's own profile. Splitting it off lets the
// recipe-carousel device be reused as the right-page payload (the
// in-tab list couldn't host one without nesting a carousel inside a
// fixed-height tab panel).
//
// Anonymous viewers can't follow anyone, so anonymous landings here
// redirect to / from App's route guard. That keeps this component
// free of an "if anonymous" branch.
//
// Per-row notify pref is intentionally NOT exposed in the bookmark
// list — bookmarks should read like a phone-book directory, one item
// per author with minimal chrome. Notify toggles still live on the
// author's own /profile/:id page and on the Following tab inside
// /profile, both reachable in one click from here.
export default function FollowingPhonebook({
    session,
    isFollowing,
    onUnfollow,
    isFavorited,
    onToggleFavorite,
    likeCount,
    userLiked,
    seedCounts,
    onToggleLike,
}) {
    const navigate = useNavigate()

    const [followedAuthors, setFollowedAuthors] = useState([])
    const [followingLoading, setFollowingLoading] = useState(true)
    const [selectedId, setSelectedId] = useState(null)
    const [recipes, setRecipes] = useState([])
    const [recipesLoading, setRecipesLoading] = useState(false)

    // Mirror the height-coupling pattern from Profile / AuthorProfile so
    // the right-page carousel caps to the left-page bookmark column and
    // the spread stays a stable rectangle. ResizeObserver re-fires when
    // the bookmark list grows or the loading/empty state swaps.
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
    }, [])

    // Fetch followed-author profile rows once on mount. Source of truth for
    // which rows render is the central useFollowing state (isFollowing
    // prop) — the local list is the profile-data sidecar so we can show
    // avatars + names without a second query per row. Mirrors the pattern
    // in Profile.jsx's FollowingTab.
    useEffect(() => {
        if (!session?.user.id) return
        let cancelled = false
        setFollowingLoading(true)
        supabase
            .from('follows')
            .select('following_id, created_at, following:profiles!following_id(id, username, full_name, avatar_url)')
            .eq('follower_id', session.user.id)
            .order('created_at', { ascending: false })
            .then(({ data, error }) => {
                if (cancelled) return
                if (error) {
                    console.error('Error fetching followed authors:', error.message)
                    setFollowedAuthors([])
                } else {
                    setFollowedAuthors(
                        (data || [])
                            .filter(row => row.following)
                            .map(row => ({
                                id: row.following.id,
                                username: row.following.username,
                                full_name: row.following.full_name,
                                avatar_url: row.following.avatar_url,
                            }))
                    )
                }
                setFollowingLoading(false)
            })
        return () => { cancelled = true }
    }, [session?.user.id])

    // Visible list filters through the central useFollowing state so an
    // optimistic unfollow elsewhere in the app reflects here without a
    // refetch, and a rollback puts the row back in place.
    const visibleAuthors = useMemo(
        () => followedAuthors.filter(a => isFollowing?.(a.id) ?? true),
        [followedAuthors, isFollowing]
    )

    // Default selection: first bookmark in the (most-recently-followed-first)
    // list. Re-evaluates if the currently selected author is unfollowed.
    useEffect(() => {
        if (visibleAuthors.length === 0) {
            setSelectedId(null)
            return
        }
        const stillExists = selectedId && visibleAuthors.some(a => a.id === selectedId)
        if (!stillExists) setSelectedId(visibleAuthors[0].id)
    }, [visibleAuthors, selectedId])

    // Fetch the selected author's public recipes. RLS auto-filters: an
    // author's private recipes never reach a different viewer, so a plain
    // `eq('author_id', id)` returns exactly the visible set.
    useEffect(() => {
        if (!selectedId) {
            setRecipes([])
            return
        }
        let cancelled = false
        setRecipesLoading(true)
        supabase
            // View → rows carry `like_count` to seed useLikes (§1.2).
            .from('recipes_with_counts')
            .select('*')
            .eq('author_id', selectedId)
            .order('created_at', { ascending: false })
            .then(({ data, error }) => {
                if (cancelled) return
                if (error) {
                    console.error('Error fetching author recipes:', error.message)
                    setRecipes([])
                } else {
                    setRecipes(data || [])
                    seedCounts?.(data || [])
                }
                setRecipesLoading(false)
            })
        return () => { cancelled = true }
    }, [selectedId])

    const selectedAuthor = visibleAuthors.find(a => a.id === selectedId) || null
    const selectedDisplayName = selectedAuthor
        ? (selectedAuthor.username?.trim() || selectedAuthor.full_name?.trim() || 'Anonymous chef')
        : null

    return (
        <ProfileBookSpread
            header={
                <header className="flex items-center gap-4 flex-wrap">
                    <button
                        onClick={() => navigate('/profile')}
                        className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors"
                    >
                        ← Back to Profile
                    </button>
                    <h1 className="font-display text-2xl sm:text-3xl text-ink m-0">Following</h1>
                </header>
            }
            leftPage={
                <div ref={leftContentRef} className="phonebook-bookmarks">
                    <h2 className="font-display text-xl text-ink mb-4">
                        Phonebook ({visibleAuthors.length})
                    </h2>
                    {followingLoading ? (
                        <p className="font-display italic text-rose" role="status">Loading…</p>
                    ) : visibleAuthors.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-2xl text-tan mb-3">✦</p>
                            <p className="font-display text-lg text-ink mb-1">Your phonebook is empty.</p>
                            <p className="font-display italic text-rose">
                                Open any recipe and tap the author's name to visit their profile.
                            </p>
                        </div>
                    ) : (
                        <ul
                            className="phonebook-bookmark-list"
                            role="tablist"
                            aria-label="Followed authors"
                        >
                            {visibleAuthors.map(author => {
                                const displayName = author.username?.trim() || author.full_name?.trim() || 'Anonymous chef'
                                const isActive = author.id === selectedId
                                return (
                                    <li key={author.id}>
                                        <button
                                            type="button"
                                            role="tab"
                                            aria-selected={isActive}
                                            onClick={() => setSelectedId(author.id)}
                                            className={'phonebook-bookmark' + (isActive ? ' is-current' : '')}
                                        >
                                            {author.avatar_url ? (
                                                <img
                                                    src={author.avatar_url}
                                                    alt=""
                                                    loading="lazy"
                                                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                                                />
                                            ) : (
                                                <span
                                                    aria-hidden="true"
                                                    className="w-10 h-10 rounded-full bg-tan-soft text-ink font-display font-semibold flex items-center justify-center flex-shrink-0"
                                                >
                                                    {displayName.charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                            <span className="phonebook-bookmark-name">{displayName}</span>
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            }
            rightPage={
                <section className="min-w-0">
                    {!selectedAuthor ? (
                        <div className="text-center py-12">
                            <p className="text-2xl text-tan mb-3">✦</p>
                            <p className="font-display text-lg text-ink mb-1">No author selected.</p>
                            <p className="font-display italic text-rose">Pick a bookmark to see their recipes.</p>
                        </div>
                    ) : (
                        <>
                            <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                <h2 className="font-display text-xl text-ink m-0">
                                    {selectedDisplayName}'s Recipes ({recipes.length})
                                </h2>
                                <div className="flex gap-2 flex-shrink-0">
                                    <Link
                                        to={`/profile/${selectedAuthor.id}`}
                                        className="px-3 py-2 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-medium rounded-md transition-colors"
                                    >
                                        View profile →
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => onUnfollow?.(selectedAuthor.id)}
                                        aria-label={`Unfollow ${selectedDisplayName}`}
                                        className="px-3 py-2 bg-rose-dark hover:bg-rose text-paper text-sm font-semibold rounded-md transition-colors"
                                    >
                                        Unfollow
                                    </button>
                                </div>
                            </header>
                            {recipesLoading ? (
                                <p className="font-display italic text-rose" role="status">Loading recipes…</p>
                            ) : recipes.length === 0 ? (
                                <div className="text-center py-12">
                                    <p className="text-2xl text-tan mb-3">✦</p>
                                    <p className="font-display text-lg text-ink mb-1">No public recipes yet.</p>
                                    <p className="font-display italic text-rose">
                                        {selectedDisplayName} hasn't shared anything you can see.
                                    </p>
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
                        </>
                    )}
                </section>
            }
        />
    )
}

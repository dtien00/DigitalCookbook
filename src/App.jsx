import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import './App.css'
import { supabase } from './lib/supabaseClient'
import { useFavorites } from './hooks/useFavorites'
import { useLikes } from './hooks/useLikes'
import { useAdmin } from './hooks/useAdmin'
import { useFollowing } from './hooks/useFollowing'
import { useNotifications } from './hooks/useNotifications'
import { useFridgeBasket } from './hooks/useFridgeBasket'
import Auth from './components/Auth'
import CreateRecipe from './components/CreateRecipe'
import RecipeDetail from './components/RecipeDetail'
import Profile from './components/Profile'
import AuthorProfile from './components/AuthorProfile'
import MyBookmarks from './components/MyBookmarks'
import RecipeCard from './components/RecipeCard'
import { SkeletonCard } from './components/Skeleton'
import EnvBanner from './components/EnvBanner'
import FridgeBasket from './components/FridgeBasket'
import NotificationsBell from './components/NotificationsBell'

// Number of recipes to fetch per infinity-scroll page. 20 balances request
// overhead against initial-paint speed on phone. Lower it for visible
// testing when seed data has < 20 recipes.
const PAGE_SIZE = 20

function App() {
    const navigate = useNavigate()

    const [session, setSession] = useState(null)
    const [recipes, setRecipes] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')

    // Sort metric for the home grid. Drives the server-side `.order()` clause
    // in fetchRecipes, so changing it must reset pagination to page 0 — see
    // the useEffect below. v1 ships date-based sorts only (newest/oldest);
    // popularity-based sorts (most-liked, most-bookmarked) need migration
    // 014's counter columns to avoid client-side aggregation that can't see
    // unloaded pages.
    const [sortMode, setSortMode] = useState('newest')

    // Auth STAYS as overlay state — not a route — so its slide-in motion
    // (fixed inset-0 z-50, 450ms ease-out from translate-x-full) can layer
    // over any underlying route without disturbing the address bar.
    // Documented in refs/COSMETICS.md → "Routing".
    const [showAuth, setShowAuth] = useState(false)

    // Grid density toggle. `doubled` flips between the library-size-adaptive
    // default and a 2x-denser variant of the same tier at every breakpoint —
    // e.g. tier 3 goes from 1/2/3/3/4 (base/sm/md/lg/xl) to 2/4/6/6/8.
    // `scrolled` controls visibility of the floating density toggle AND the
    // floating scroll-to-top button — both hidden at the top of the page,
    // both fade in after the user scrolls past the action row.
    const [doubled, setDoubled] = useState(false)
    const [scrolled, setScrolled] = useState(false)

    // Tag chip row collapse state. Collapsed shows the most-used tags only;
    // expanded shows the full list. Threshold below.
    const [tagsExpanded, setTagsExpanded] = useState(false)

    // Profile dropdown menu open/closed state.
    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef(null)

    // Infinity-scroll pagination state.
    // - totalCount: full row count from Supabase (respects RLS). Drives the
    //   density tier so the column layout doesn't reflow as more pages load.
    // - hasMore: true while the last fetch returned a full page (PAGE_SIZE
    //   rows). The sentinel near the bottom of the grid stops triggering
    //   once we know we've reached the end.
    // - loadingMore: gates the IntersectionObserver from double-firing while
    //   a fetch is already in flight.
    const [hasMore, setHasMore] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [totalCount, setTotalCount] = useState(0)
    const sentinelRef = useRef(null)
    const pageRef = useRef(0)

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 80)
        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    // Close the profile dropdown on outside click or Escape.
    useEffect(() => {
        if (!menuOpen) return
        const onPointerDown = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
        }
        const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('pointerdown', onPointerDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [menuOpen])

    const { isFavorited, toggleFavorite, refetch: refetchFavorites } = useFavorites(session?.user.id)
    const { likeCount, userLiked, toggleLike, refetch: refetchLikes } = useLikes(session?.user.id)
    const { isAdmin } = useAdmin(session?.user.id)
    const { isFollowing, getNotifyPref, toggleFollow, setNotifyPref } = useFollowing(session?.user.id)
    const { notifications, unreadCount, markRead, markAllRead } = useNotifications(session?.user.id)

    // Fridge basket — persistent ingredient list (localStorage). Lives at the
    // App level so the modal can mount above any route and so basket state
    // survives route changes. Filter coupling lands in a follow-up Stage 10
    // item; for now the basket is purely additive.
    const { basket, addIngredient, removeIngredient, clearBasket } = useFridgeBasket()
    const [basketOpen, setBasketOpen] = useState(false)
    const basketTriggerRef = useRef(null)

    useEffect(() => {
        // Check initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
        })

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session)
            if (event === 'PASSWORD_RECOVERY') {
                navigate('/profile')
            }
            // Close the auth view once a session is established
            if (session) {
                setShowAuth(false)
            }
            // On sign-out specifically, route back to home so re-login
            // always lands on a clean grid, not a stale sub-page. Gated
            // on `event === 'SIGNED_OUT'` rather than `!session` because
            // onAuthStateChange ALSO fires `INITIAL_SESSION` with a null
            // session on every page load for anonymous users — without
            // the event check, every deep link (e.g. /recipe/:id pasted
            // into a fresh tab) would bounce to / immediately on mount.
            if (event === 'SIGNED_OUT') {
                navigate('/')
                setMenuOpen(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [navigate])

    // Fetch recipes for everyone, including anonymous visitors.
    // RLS filters: `is_public OR auth.uid() = author_id`, so anon users
    // see only public recipes; logged-in users see public + their own.
    // Refetch on session OR sort change so:
    //   - private recipes appear/disappear with session
    //   - the order flips correctly when the user switches sort
    // Both cases reset pagination back to page 0 — appending a page from
    // the new sort onto cached rows from the old sort would mix two
    // orderings into one visually indistinguishable list.
    useEffect(() => {
        pageRef.current = 0
        setHasMore(true)
        fetchRecipes({ page: 0, append: false, sort: sortMode })
    }, [session, sortMode])

    // Infinity scroll: an IntersectionObserver watches a sentinel placed
    // below the grid. When the sentinel scrolls into the viewport (with
    // 200px of look-ahead) and we know more rows exist, fetch the next
    // page and append. `loadingMore` guards against the observer firing
    // again before the in-flight request completes.
    useEffect(() => {
        const el = sentinelRef.current
        if (!el) return
        const obs = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
                fetchRecipes({ page: pageRef.current + 1, append: true, sort: sortMode })
            }
        }, { rootMargin: '200px' })
        obs.observe(el)
        return () => obs.disconnect()
    }, [hasMore, loading, loadingMore, sortMode])

    async function fetchRecipes({ page = 0, append = false, sort = 'newest' } = {}) {
        try {
            if (append) setLoadingMore(true)
            else setLoading(true)

            const from = page * PAGE_SIZE
            const to = from + PAGE_SIZE - 1

            // Sort metric → `.order()` clause. v1: date-based only.
            // 'newest' is the existing default (created_at DESC); 'oldest'
            // flips the direction. Popularity-based sorts (most-liked,
            // most-bookmarked) are deferred until migration 014 adds the
            // counter columns — without them, sort-by-likes would require
            // client-side aggregation that can't see unloaded pages.
            const ascending = sort === 'oldest'

            // `count: 'exact'` returns the full visible row count alongside
            // the page. Respected by RLS, so anon users get only the public
            // count. Used to size the column tier so layout doesn't reflow
            // as more pages load.
            //
            // Embed `ingredients(name)` so the fridge-basket filter (Stage
            // 10) can token-match against each recipe's ingredients without
            // an N+1 fetch per card. PostgREST infers the relationship from
            // the ingredients.recipe_id FK; the count remains the parent
            // (recipes) row count, not the joined-row count. Ingredient
            // visibility piggybacks on the recipe RLS — the embedded rows
            // for a public recipe are returned to anonymous viewers too.
            const { data, error, count } = await supabase
                .from('recipes')
                .select('*, ingredients(name), author:profiles!author_id(id, username, full_name, avatar_url)', { count: 'exact' })
                .order('created_at', { ascending })
                .order('id', { ascending })
                .range(from, to)

            if (error) throw error
            const newRows = data || []
            setRecipes(prev => append ? [...prev, ...newRows] : newRows)
            setHasMore(newRows.length === PAGE_SIZE)
            if (typeof count === 'number') setTotalCount(count)
            pageRef.current = page
        } catch (error) {
            console.error('Error fetching recipes:', error.message)
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut()
        // "AuthSessionMissingError" means the JWT already expired and Supabase
        // cleared it from localStorage before we called signOut — treat it as a
        // successful logout. Any other error is unexpected and worth surfacing.
        if (error && error.name !== 'AuthSessionMissingError') {
            toast.error('Sign-out failed: ' + error.message)
            return
        }
        // Force-clear React state in case onAuthStateChange doesn't fire
        // (it won't if the session was already missing on Supabase's side).
        setSession(null)
        navigate('/')
        setMenuOpen(false)
    }

    const handleEditRecipe = (recipe) => {
        navigate(`/recipe/${recipe.id}/edit`)
    }

    const handleRecipeDeleted = () => {
        navigate('/')
        fetchRecipes({ page: 0, append: false })
    }

    const handleRecipeClick = (recipe) => {
        navigate(`/recipe/${recipe.id}`)
    }

    // Bookmark click handler — anonymous users get the sign-in CTA, signed-in users toggle.
    const handleBookmarkClick = (recipeId) => {
        if (!session) {
            setShowAuth(true)
            return
        }
        toggleFavorite(recipeId)
    }

    // Like click handler — same anonymous-prompt-vs-toggle dispatch as bookmarks.
    const handleLikeClick = (recipeId) => {
        if (!session) {
            setShowAuth(true)
            return
        }
        toggleLike(recipeId)
    }

    // Bundled "shared" props for the home view + recipe detail wrapper.
    // Defined once so each <Route> JSX is short and changes to the shape
    // (e.g. adding a new handler) only need one update, not five.
    const homeViewProps = {
        session, recipes, loading, totalCount, hasMore, loadingMore,
        searchTerm, setSearchTerm,
        sortMode, setSortMode,
        doubled, setDoubled, scrolled,
        tagsExpanded, setTagsExpanded,
        menuOpen, setMenuOpen, menuRef,
        sentinelRef,
        isFavorited, likeCount, userLiked,
        basket,
        basketTriggerRef,
        notifications, unreadCount, markRead, markAllRead,
        onOpenBasket: () => setBasketOpen(true),
        onRecipeClick: handleRecipeClick,
        onBookmarkClick: handleBookmarkClick,
        onLikeClick: handleLikeClick,
        onLogout: handleLogout,
        onSignIn: () => setShowAuth(true),
    }

    const recipeDetailProps = {
        session, recipes, isAdmin,
        isFavorited, likeCount, userLiked,
        refetchLikes, refetchFavorites,
        onEditRecipe: handleEditRecipe,
        onRecipeDeleted: handleRecipeDeleted,
        onBookmarkClick: handleBookmarkClick,
        onLikeClick: handleLikeClick,
        onRequireAuth: () => setShowAuth(true),
    }

    const handleCreateComplete = () => {
        navigate('/')
        fetchRecipes({ page: 0, append: false })
    }

    return (
        <>
            <EnvBanner />
            <Routes>
                <Route path="/" element={<HomeView {...homeViewProps} />} />
                <Route path="/recipe/:id" element={<RecipeDetailRoute {...recipeDetailProps} />} />
                <Route
                    path="/recipe/:id/edit"
                    element={
                        session
                            ? <EditRecipeRoute recipes={recipes} session={session} onComplete={handleCreateComplete} />
                            : <Navigate to="/" replace />
                    }
                />
                <Route
                    path="/new"
                    element={
                        session
                            ? <CreateRecipe userId={session.user.id} onComplete={handleCreateComplete} />
                            : <Navigate to="/" replace />
                    }
                />
                <Route
                    path="/profile"
                    element={
                        session
                            ? <Profile
                                session={session}
                                onBack={() => navigate('/')}
                                onRecipeClick={handleRecipeClick}
                                isFavorited={isFavorited}
                                onToggleFavorite={handleBookmarkClick}
                                likeCount={likeCount}
                                userLiked={userLiked}
                                onToggleLike={handleLikeClick}
                                isFollowing={isFollowing}
                                getNotifyPref={getNotifyPref}
                                onUnfollow={toggleFollow}
                                onSetNotifyPref={setNotifyPref}
                            />
                            : <Navigate to="/" replace />
                    }
                />
                <Route
                    path="/profile/:id"
                    element={
                        <AuthorProfile
                            session={session}
                            isFavorited={isFavorited}
                            onToggleFavorite={handleBookmarkClick}
                            likeCount={likeCount}
                            userLiked={userLiked}
                            onToggleLike={handleLikeClick}
                            isFollowing={isFollowing}
                            getNotifyPref={getNotifyPref}
                            onToggleFollow={(authorId) => {
                                if (!session) { setShowAuth(true); return }
                                toggleFollow(authorId)
                            }}
                            onSetNotifyPref={setNotifyPref}
                        />
                    }
                />
                <Route
                    path="/bookmarks"
                    element={
                        session
                            ? <MyBookmarks
                                session={session}
                                onBack={() => navigate('/')}
                                onRecipeClick={handleRecipeClick}
                                isFavorited={isFavorited}
                                onToggleFavorite={handleBookmarkClick}
                                likeCount={likeCount}
                                userLiked={userLiked}
                                onToggleLike={handleLikeClick}
                            />
                            : <Navigate to="/" replace />
                    }
                />
                {/* Unknown route → home. Keeps the URL bar from displaying a 404
                    that the app can't render. Replaces in history so the back
                    button doesn't trap the user on the bad URL. */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <div
                aria-hidden={!showAuth}
                className={`fixed inset-0 z-50 transition-transform duration-[450ms] ease-out ${showAuth ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
            >
                <Auth onBack={() => setShowAuth(false)} />
            </div>
            <FridgeBasket
                isOpen={basketOpen}
                onClose={() => setBasketOpen(false)}
                basket={basket}
                onAdd={addIngredient}
                onRemove={removeIngredient}
                onClear={clearBasket}
                openerRef={basketTriggerRef}
                // Live preview of how many loaded recipes the current basket
                // narrows to. Scoped to basket-only (ignores the active
                // search) so the modal stays conceptually about the fridge
                // rather than mirroring the home view's combined filters.
                // Counts against the loaded set, same scope as the filter
                // itself — documented in the modal copy.
                matchCount={basket.length === 0
                    ? recipes.length
                    : recipes.filter(r => recipeMatchesBasket(r, basket)).length}
                loadedCount={recipes.length}
            />
        </>
    )
}

// Home grid view. Extracted from App's previous renderMainView() and pinned
// here OUTSIDE App so the component identity is stable across App re-renders
// — React diffs <Route element> by component type; an inline-defined function
// would be a new type each render, causing unmount/remount churn that would
// wipe local state like search input, scroll position, and tag-row expansion.
function HomeView({
    session, recipes, loading, totalCount, hasMore, loadingMore,
    searchTerm, setSearchTerm,
    sortMode, setSortMode,
    doubled, setDoubled, scrolled,
    tagsExpanded, setTagsExpanded,
    menuOpen, setMenuOpen, menuRef,
    sentinelRef,
    isFavorited, likeCount, userLiked,
    basket, basketTriggerRef, onOpenBasket,
    notifications, unreadCount, markRead, markAllRead,
    onRecipeClick, onBookmarkClick, onLikeClick,
    onLogout, onSignIn,
}) {
    const navigate = useNavigate()

    // Swipe-left-to-resume-last-recipe (Stage 9). Mirrors the swipe-right
    // gesture on RecipeDetail (same 80px / <40px thresholds, same
    // touchAction: 'pan-y' contract). Reads `lastViewedRecipeId` from
    // sessionStorage on touchstart so a recipe viewed seconds ago is
    // resumable even if HomeView mounted earlier. No-ops when the key is
    // absent (fresh tab or never opened a recipe) — the visual peek is
    // suppressed in that case so the user doesn't see an unexplained
    // translateX with no follow-through.
    const [swipeX, setSwipeX] = useState(0)
    const homeTouchRef = useRef({ startX: 0, startY: 0, lastX: 0, lastY: 0, tracking: false, resumeId: null })

    const handleHomeTouchStart = (e) => {
        if (e.touches.length !== 1) return
        const t = e.touches[0]
        homeTouchRef.current = {
            startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastY: t.clientY,
            tracking: true,
            resumeId: sessionStorage.getItem('lastViewedRecipeId'),
        }
    }

    const handleHomeTouchMove = (e) => {
        if (!homeTouchRef.current.tracking || e.touches.length !== 1) return
        const t = e.touches[0]
        homeTouchRef.current.lastX = t.clientX
        homeTouchRef.current.lastY = t.clientY
        const dx = t.clientX - homeTouchRef.current.startX
        const dy = Math.abs(t.clientY - homeTouchRef.current.startY)
        if (dy > 40 && dy > Math.abs(dx)) {
            homeTouchRef.current.tracking = false
            setSwipeX(0)
            return
        }
        // Only follow leftward motion, and only if there's a recipe to resume.
        if (dx < -10 && homeTouchRef.current.resumeId) {
            setSwipeX(Math.max(dx, -200))
        }
    }

    const handleHomeTouchEnd = () => {
        if (!homeTouchRef.current.tracking) {
            setSwipeX(0)
            return
        }
        const dx = homeTouchRef.current.lastX - homeTouchRef.current.startX
        const dy = Math.abs(homeTouchRef.current.lastY - homeTouchRef.current.startY)
        const { resumeId } = homeTouchRef.current
        homeTouchRef.current.tracking = false
        if (dx <= -80 && dy < 40 && resumeId) {
            navigate(`/recipe/${resumeId}`)
        } else {
            setSwipeX(0)
        }
    }

    // Search supports two modes:
    //   - tag mode: any comma in the input → split, trim, lowercase the
    //     tokens; recipes must include EVERY token in their tags array
    //     (AND match). Empty tokens (e.g. trailing comma) are dropped, so
    //     "italian," with one token still works as a single-tag filter.
    //   - text mode: no comma → existing substring match on title /
    //     description, case-insensitive.
    // Whitespace is trimmed around every token so "  italian , pasta  "
    // behaves identically to "italian,pasta".
    const { mode: searchMode, tokens: searchTokens } = parseSearch(searchTerm)

    // Two filters compose with AND semantics (recipe must pass BOTH):
    //   - search filter (parseSearch result over tags/title/description)
    //   - fridge-basket filter (token-match basket against ingredients)
    // Either is a no-op when its input is empty. Putting them in one
    // .filter() pass means a single iteration over the recipe array
    // regardless of how many filters are active.
    const basketActive = basket.length > 0
    const filteredRecipes = recipes.filter(recipe => {
        // Search side.
        if (searchMode !== 'none') {
            if (searchMode === 'tag') {
                const recipeTagsLower = (recipe.tags || []).map(t => t.toLowerCase())
                if (!searchTokens.every(token => recipeTagsLower.includes(token))) return false
            } else {
                const q = searchTokens[0]
                let textHit = false
                if (searchMode === 'hybrid') {
                    const recipeTagsLower = (recipe.tags || []).map(t => t.toLowerCase())
                    if (recipeTagsLower.includes(q)) textHit = true
                }
                if (!textHit) {
                    textHit = recipe.title.toLowerCase().includes(q) ||
                        (recipe.description?.toLowerCase().includes(q) ?? false)
                }
                if (!textHit) return false
            }
        }
        // Basket side.
        if (basketActive && !recipeMatchesBasket(recipe, basket)) return false
        return true
    })

    // Tags from currently loaded recipes, sorted by frequency desc with
    // alphabetical tiebreak. Frequency-sort surfaces the most actionable
    // chips first; alphabetical tiebreak keeps the order stable across
    // re-renders (objects with identical counts would otherwise jitter).
    // Limitation: tags that only exist on unloaded pages won't appear
    // until the user scrolls — acceptable for the current corpus size.
    const tagCounts = new Map()
    recipes.forEach(r => (r.tags || []).forEach(t => {
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1)
    }))
    const availableTags = Array.from(tagCounts.keys()).sort((a, b) => {
        const diff = tagCounts.get(b) - tagCounts.get(a)
        return diff !== 0 ? diff : a.localeCompare(b)
    })

    // Hybrid mode is also "tag-active" for chip display purposes: the
    // single token IS being matched against tags (alongside title/desc),
    // so the corresponding chip should render in its active state and
    // clicking it should deactivate the filter.
    const activeTags = (searchMode === 'tag' || searchMode === 'hybrid')
        ? new Set(searchTokens)
        : new Set()

    // Collapsed chip row shows the top N by frequency. Any currently
    // active tags (from a typed comma-list or prior chip clicks) are
    // pinned into view even if they'd otherwise be hidden, so a filter
    // never appears to "vanish" from the row.
    const TAG_CHIP_LIMIT = 12
    const overLimit = availableTags.length > TAG_CHIP_LIMIT
    const visibleTags = (tagsExpanded || !overLimit)
        ? availableTags
        : (() => {
            const top = availableTags.slice(0, TAG_CHIP_LIMIT)
            const topSet = new Set(top.map(t => t.toLowerCase()))
            const pinned = availableTags.filter(t =>
                activeTags.has(t.toLowerCase()) && !topSet.has(t.toLowerCase())
            )
            return [...top, ...pinned]
        })()

    const toggleTagFilter = (tag) => {
        const tagLower = tag.toLowerCase()
        const current = new Set(activeTags)
        if (current.has(tagLower)) current.delete(tagLower)
        else current.add(tagLower)
        const arr = Array.from(current)
        if (arr.length === 0) setSearchTerm('')
        // Trailing comma on a single tag forces tag-mode parsing rather
        // than falling back to text mode (since text mode would substring-
        // match titles/descriptions, not the tags array).
        else if (arr.length === 1) setSearchTerm(arr[0] + ',')
        else setSearchTerm(arr.join(', '))
    }

    // Density scales with the user's full library size (totalCount from
    // Supabase), not the loaded subset, so the column count stays stable
    // as infinity scroll appends more pages. Two parallel ladders: the
    // default tiering (xl:columns-5 floor) and a 2x-denser variant
    // exposed via the floating toggle. Doubled values are literal class
    // names so Tailwind's content scanner picks them up at build time.
    const gridColumnsClass = doubled ? (
        totalCount <= 3  ? 'columns-2 md:columns-4 xl:columns-4' :
        totalCount <= 8  ? 'columns-2 sm:columns-4 lg:columns-6 xl:columns-6' :
        totalCount <= 20 ? 'columns-2 sm:columns-4 md:columns-6 xl:columns-8' :
                           'columns-4 md:columns-6 lg:columns-8 xl:columns-10'
    ) : (
        totalCount <= 3  ? 'columns-1 md:columns-2 xl:columns-2' :
        totalCount <= 8  ? 'columns-1 sm:columns-2 lg:columns-3 xl:columns-3' :
        totalCount <= 20 ? 'columns-1 sm:columns-2 md:columns-3 xl:columns-4' :
                           'columns-2 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5'
    )

    // Icon for the density toggle — reused by both the inline and floating
    // copies of the button. Previews the destination state: 2×2 grid means
    // "tap to densify", two wide bars means "tap to return to default".
    const densityIcon = !doubled ? (
        <svg className="w-5 h-5 stroke-ink fill-none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4"  y="4"  width="7" height="7" rx="1" />
            <rect x="13" y="4"  width="7" height="7" rx="1" />
            <rect x="4"  y="13" width="7" height="7" rx="1" />
            <rect x="13" y="13" width="7" height="7" rx="1" />
        </svg>
    ) : (
        <svg className="w-5 h-5 stroke-ink fill-none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4"  y="4" width="7" height="16" rx="1" />
            <rect x="13" y="4" width="7" height="16" rx="1" />
        </svg>
    )
    const densityAriaLabel = doubled ? 'Show fewer columns' : 'Show more columns'

    return (
        <div
            className="paper-grain min-h-screen"
            onTouchStart={handleHomeTouchStart}
            onTouchMove={handleHomeTouchMove}
            onTouchEnd={handleHomeTouchEnd}
            onTouchCancel={handleHomeTouchEnd}
            style={{
                transform: swipeX < 0 ? `translateX(${swipeX}px)` : undefined,
                transition: swipeX < 0 ? 'none' : 'transform 200ms ease-out',
                touchAction: 'pan-y',
            }}
        >
        {/* Density toggle. Rendered in two places that share state and
            visual treatment: an inline copy in the action row below
            (always visible at the top of the page, sits in normal flow),
            and a floating copy that fades in once the user has scrolled
            past the inline one. Both flip between the default library-size
            tiering and a 2x-denser variant of the same tier. The icon
            previews the destination state. */}
        <button
            type="button"
            onClick={() => setDoubled(d => !d)}
            aria-label={densityAriaLabel}
            aria-pressed={doubled}
            aria-hidden={!scrolled}
            tabIndex={scrolled ? 0 : -1}
            className={`fixed top-4 left-4 z-40 w-12 h-12 rounded-full bg-paper-shade/90 backdrop-blur-sm shadow-md flex items-center justify-center transition-opacity duration-300 ${scrolled ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
            {densityIcon}
        </button>

        {/* Scroll-to-top button. Mirrors the density toggle on the
            right edge. Same scroll-trigger as the toggle so the two
            appear and disappear together. */}
        <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Scroll to top"
            aria-hidden={!scrolled}
            tabIndex={scrolled ? 0 : -1}
            className={`fixed top-4 right-4 z-40 w-12 h-12 rounded-full bg-paper-shade/90 backdrop-blur-sm shadow-md flex items-center justify-center transition-opacity duration-300 ${scrolled ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
            <svg className="w-5 h-5 stroke-ink fill-none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="18 15 12 9 6 15" />
            </svg>
        </button>
        <div className="max-w-7xl mx-auto px-5 py-5">
            <header className="flex justify-between items-center mb-10 pb-6 border-b border-paper-shade gap-3">
                <h1 className="font-display text-base sm:text-2xl md:text-3xl font-semibold text-ink tracking-tight min-w-0 truncate">
                    {session ? `${session.user.email}'s Cookbook` : 'Digital Cookbook'}
                </h1>
                <div className="flex gap-3 flex-shrink-0 items-center">
                    {session && (
                        <NotificationsBell
                            notifications={notifications}
                            unreadCount={unreadCount}
                            markRead={markRead}
                            markAllRead={markAllRead}
                        />
                    )}
                    {session ? (
                        // Single "Profile" trigger that expands into a dropdown
                        // containing My Profile, Bookmarks, and Log out. Collapsed
                        // by default; closes on outside click or Escape.
                        <div className="relative" ref={menuRef}>
                            <button
                                type="button"
                                onClick={() => setMenuOpen(o => !o)}
                                aria-haspopup="menu"
                                aria-expanded={menuOpen}
                                className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors flex items-center gap-1.5"
                            >
                                Profile
                                <svg
                                    className={`w-4 h-4 stroke-ink fill-none transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}
                                    viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </button>

                            {menuOpen && (
                                <div
                                    role="menu"
                                    // Stop pointerdown from bubbling to the document
                                    // outside-click handler — prevents a race on desktop
                                    // where the handler could close the menu before the
                                    // button's click event fires.
                                    onPointerDown={e => e.stopPropagation()}
                                    className="absolute right-0 mt-1 w-44 bg-white border border-paper-shade rounded-md shadow-md overflow-hidden z-50"
                                >
                                    <button
                                        role="menuitem"
                                        onClick={() => { navigate('/profile'); setMenuOpen(false) }}
                                        className="w-full text-left px-4 py-2.5 text-ink font-medium hover:bg-paper-shade transition-colors"
                                    >
                                        My Profile
                                    </button>
                                    <button
                                        role="menuitem"
                                        onClick={() => { navigate('/bookmarks'); setMenuOpen(false) }}
                                        className="w-full text-left px-4 py-2.5 text-ink font-medium hover:bg-paper-shade transition-colors"
                                    >
                                        Bookmarks
                                    </button>
                                    <div className="border-t border-paper-shade" aria-hidden="true" />
                                    <button
                                        role="menuitem"
                                        onClick={async () => { await onLogout(); setMenuOpen(false) }}
                                        className="w-full text-left px-4 py-2.5 text-rose font-medium hover:bg-paper-shade transition-colors"
                                    >
                                        Log out
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button onClick={onSignIn} className="px-5 py-2.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors">Sign In</button>
                    )}
                </div>
            </header>

            <div className="flex flex-wrap gap-3 items-center mb-8">
                {/* Inline density toggle — same control as the floating copy
                    above. Lives in document flow so it's always reachable at
                    the top of the page; scrolls off naturally as the user
                    scrolls down, at which point the floating copy takes over. */}
                <button
                    type="button"
                    onClick={() => setDoubled(d => !d)}
                    aria-label={densityAriaLabel}
                    aria-pressed={doubled}
                    className="flex-shrink-0 w-12 h-12 rounded-full bg-paper-shade/90 backdrop-blur-sm shadow-md flex items-center justify-center hover:bg-paper-shade transition-colors"
                >
                    {densityIcon}
                </button>
                <div className="flex-1 min-w-[180px] relative">
                    <input
                        type="text"
                        placeholder="Search recipes — or tag1, tag2 for tag filter…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-3 pr-11 border border-paper-shade rounded-full text-base bg-white/70 text-ink placeholder:text-rose/60 shadow-sm focus:outline-none focus:ring-2 focus:ring-rust/40 focus:border-rust"
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            onClick={() => setSearchTerm('')}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-paper-shade hover:bg-tan/40 text-ink flex items-center justify-center transition-colors"
                        >
                            <svg aria-hidden="true" viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M4 4l8 8M12 4l-8 8" />
                            </svg>
                        </button>
                    )}
                </div>
                {/* Sort dropdown. Native <select> so mobile gets the OS
                    picker for free; styled with palette tokens so it reads
                    as part of the rustic-paper system rather than browser
                    chrome. Changing the value triggers a refetch from page
                    0 via the sortMode useEffect in App — see the comment
                    on fetchRecipes for the ordering+pagination interaction.
                    v1 ships date-based sorts only; popularity-based sorts
                    are deferred to a v2 sub-stage with migration 014. */}
                <label className="flex-shrink-0 relative">
                    <span className="sr-only">Sort recipes</span>
                    <select
                        value={sortMode}
                        onChange={(e) => setSortMode(e.target.value)}
                        aria-label="Sort recipes"
                        className="appearance-none pl-4 pr-9 py-2.5 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rust/40 min-h-[44px]"
                    >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                    </select>
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 stroke-ink fill-none pointer-events-none"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    >
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </label>
                {session && (
                    <button onClick={() => navigate('/new')} className="px-5 py-2.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors flex-shrink-0">+ New Recipe</button>
                )}
            </div>

            {/* Filter row — tag chips on the left, fridge basket trigger on
                the right. Always renders on the home view so the fridge
                button has a stable home; the chip group inside is hidden
                when no tags exist on loaded recipes.

                Chips and fridge button live in sibling flex cells so the
                button stays anchored right even when chips wrap to multiple
                lines (justify-between on the row + chip group flex-grows). */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
                {availableTags.length > 0 ? (
                    <div className="flex flex-wrap gap-2 items-center flex-1 min-w-0" role="group" aria-label="Filter by tag">
                        {visibleTags.map(tag => {
                            const isActive = activeTags.has(tag.toLowerCase())
                            return (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => toggleTagFilter(tag)}
                                    aria-pressed={isActive}
                                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                                        isActive
                                            ? 'bg-rust text-paper hover:bg-rust-dark'
                                            : 'bg-tan-soft text-ink hover:bg-tan/40'
                                    }`}
                                >
                                    {tag}
                                </button>
                            )
                        })}
                        {overLimit && (
                            <button
                                type="button"
                                onClick={() => setTagsExpanded(e => !e)}
                                aria-expanded={tagsExpanded}
                                className="px-3 py-1 text-xs font-medium rounded-full bg-paper-shade hover:bg-tan/40 text-ink transition-colors"
                            >
                                {tagsExpanded
                                    ? 'Show less'
                                    : `+${availableTags.length - TAG_CHIP_LIMIT} more`}
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 min-w-0" />
                )}
                {/* Fridge basket trigger. Count badge appears when the basket
                    has items — quiet rust dot in the top-right corner. The
                    ref is forwarded from App so the modal can restore focus
                    here on close. */}
                <button
                    ref={basketTriggerRef}
                    type="button"
                    onClick={onOpenBasket}
                    aria-label={basket.length === 0
                        ? 'Open fridge basket'
                        : `Open fridge basket (${basket.length} ingredient${basket.length === 1 ? '' : 's'})`}
                    aria-haspopup="dialog"
                    className="relative flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink rounded-full text-sm font-medium transition-colors min-h-[44px]"
                >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="3" width="14" height="18" rx="2" />
                        <line x1="5" y1="11" x2="19" y2="11" />
                        <line x1="9" y1="7" x2="9" y2="8" />
                        <line x1="9" y1="15" x2="9" y2="16" />
                    </svg>
                    <span>Fridge</span>
                    {basket.length > 0 && (
                        <span
                            aria-hidden="true"
                            className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-rust text-paper text-xs font-semibold flex items-center justify-center"
                        >
                            {basket.length}
                        </span>
                    )}
                </button>
            </div>

            {loading ? (
                <div className={`${gridColumnsClass} gap-4 mt-6`} role="status" aria-label="Loading recipes">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <SkeletonCard key={i} index={i} />
                    ))}
                </div>
            ) : filteredRecipes.length === 0 ? (
                <EmptyGridState
                    searchTerm={searchTerm}
                    basketActive={basketActive}
                    hasAnyRecipes={totalCount > 0}
                    session={session}
                    onClearSearch={() => setSearchTerm('')}
                    onOpenBasket={onOpenBasket}
                    onSignIn={onSignIn}
                    onCreate={() => navigate('/new')}
                />
            ) : (
                <>
                    <div className={`${gridColumnsClass} gap-4 mt-6`}>
                        {filteredRecipes.map(recipe => (
                            <RecipeCard
                                key={recipe.id}
                                recipe={recipe}
                                onClick={() => onRecipeClick(recipe)}
                                favorited={isFavorited(recipe.id)}
                                onToggleFavorite={() => onBookmarkClick(recipe.id)}
                                liked={userLiked(recipe.id)}
                                likeCount={likeCount(recipe.id)}
                                onToggleLike={() => onLikeClick(recipe.id)}
                            />
                        ))}
                    </div>

                    {/* Infinity-scroll sentinel + indicators. The sentinel
                        triggers the next page fetch as it approaches the
                        viewport. When we know we've reached the end
                        (hasMore=false AND we've loaded more than one
                        page), show a quiet ✦ marker. Sentinel skipped
                        whenever any client-side filter is active (search
                        OR basket) since "more recipes" don't necessarily
                        match the filter and the apparent infinite scroll
                        would look broken if the next page returned zero
                        new visible cards. */}
                    {!searchTerm && !basketActive && hasMore && (
                        <div ref={sentinelRef} aria-hidden="true" className="h-1 w-full" />
                    )}
                    {loadingMore && (
                        <p className="text-center font-display italic text-rose py-6" role="status">
                            Loading more recipes…
                        </p>
                    )}
                    {!searchTerm && !basketActive && !hasMore && recipes.length > PAGE_SIZE && (
                        <p aria-hidden="true" className="text-center text-tan text-xl py-6">✦</p>
                    )}
                </>
                )}
            </div>
        </div>
    )
}

// RecipeDetail route wrapper. URL is /recipe/:id; the recipe lookup is a
// two-tier cascade:
//   1. Cache hit — find by id in the parent's `recipes` array (already
//      paginated into memory). Most navigations come from clicking a card
//      in the grid, so the cache will hit ~100% of the time.
//   2. Cache miss — fetch the recipe by id directly. This is the deep-link
//      path: a user pastes /recipe/<uuid> into a fresh tab before any
//      pagination has loaded that recipe, or the recipe sits past the
//      currently-loaded page count.
// RLS handles visibility automatically — private recipes belonging to other
// users return no row, which we surface as a "not found" empty state.
function RecipeDetailRoute({
    session, recipes, isAdmin,
    isFavorited, likeCount, userLiked,
    refetchLikes, refetchFavorites,
    onEditRecipe, onRecipeDeleted, onBookmarkClick, onLikeClick, onRequireAuth,
}) {
    const { id } = useParams()
    const navigate = useNavigate()
    const [fetchedRecipe, setFetchedRecipe] = useState(null)
    const [fetchState, setFetchState] = useState('idle') // 'idle' | 'loading' | 'notfound'

    const cached = recipes.find(r => r.id === id)
    const recipe = cached || fetchedRecipe

    // Remember the last recipe we successfully landed on so a left-swipe
    // from the home grid can resume to it (Stage 9). sessionStorage scope
    // matches the kitchen-session lifetime — survives back-button hops,
    // resets when the tab closes.
    useEffect(() => {
        if (recipe?.id) sessionStorage.setItem('lastViewedRecipeId', recipe.id)
    }, [recipe?.id])

    useEffect(() => {
        if (cached) {
            setFetchState('idle')
            setFetchedRecipe(null)
            return
        }
        let cancelled = false
        setFetchState('loading')
        supabase
            .from('recipes')
            .select('*, author:profiles!author_id(id, username, full_name, avatar_url)')
            .eq('id', id)
            .maybeSingle()
            .then(({ data, error }) => {
                if (cancelled) return
                if (error || !data) {
                    setFetchState('notfound')
                    setFetchedRecipe(null)
                } else {
                    setFetchState('idle')
                    setFetchedRecipe(data)
                }
            })
        return () => { cancelled = true }
    }, [id, cached])

    if (!recipe && fetchState === 'loading') {
        return (
            <div className="paper-grain min-h-screen flex items-center justify-center">
                <p className="font-display italic text-rose" role="status">Loading recipe…</p>
            </div>
        )
    }

    if (!recipe && fetchState === 'notfound') {
        return (
            <div className="paper-grain min-h-screen">
                <div className="recipe-detail-container">
                    <div className="text-center py-16">
                        <p className="text-2xl text-tan mb-4">✦</p>
                        <p className="font-display text-xl text-ink mb-2">Recipe not found</p>
                        <p className="font-display italic text-rose mb-6">The link may be incorrect, or the recipe is private.</p>
                        <button
                            onClick={() => navigate('/')}
                            className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors"
                        >
                            ← Back to recipes
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (!recipe) return null

    return (
        <RecipeDetail
            recipe={recipe}
            userId={session?.user.id}
            isAdmin={isAdmin}
            onBack={() => navigate('/')}
            onEdit={onEditRecipe}
            onDelete={onRecipeDeleted}
            favorited={isFavorited(recipe.id)}
            onToggleFavorite={() => onBookmarkClick(recipe.id)}
            liked={userLiked(recipe.id)}
            likeCount={likeCount(recipe.id)}
            onToggleLike={() => onLikeClick(recipe.id)}
            refetchLikes={refetchLikes}
            refetchFavorites={refetchFavorites}
            onRequireAuth={onRequireAuth}
        />
    )
}

// Edit-recipe route wrapper. Same cache-then-fetch cascade as
// RecipeDetailRoute, plus an author-only guard: only the recipe's author
// can edit, so anyone else who lands on /recipe/:id/edit gets bounced to
// the read-only detail view. The Route-level `session` guard above this
// component handles the anonymous case.
function EditRecipeRoute({ recipes, session, onComplete }) {
    const { id } = useParams()
    const [fetchedRecipe, setFetchedRecipe] = useState(null)
    const [fetchState, setFetchState] = useState('idle')

    const cached = recipes.find(r => r.id === id)
    const recipe = cached || fetchedRecipe

    useEffect(() => {
        if (cached) {
            setFetchState('idle')
            setFetchedRecipe(null)
            return
        }
        let cancelled = false
        setFetchState('loading')
        supabase.from('recipes').select('*').eq('id', id).maybeSingle().then(({ data, error }) => {
            if (cancelled) return
            if (error || !data) {
                setFetchState('notfound')
                setFetchedRecipe(null)
            } else {
                setFetchState('idle')
                setFetchedRecipe(data)
            }
        })
        return () => { cancelled = true }
    }, [id, cached])

    if (!recipe && fetchState === 'loading') {
        return (
            <div className="paper-grain min-h-screen flex items-center justify-center">
                <p className="font-display italic text-rose" role="status">Loading recipe…</p>
            </div>
        )
    }

    if (!recipe) return <Navigate to="/" replace />
    if (recipe.author_id !== session.user.id) return <Navigate to={`/recipe/${id}`} replace />

    return <CreateRecipe userId={session.user.id} recipeToEdit={recipe} onComplete={onComplete} />
}

// Distinct empty states for the home grid:
//   - fridge basket filter matches nothing (offer to edit the basket)
//   - search returned nothing (offer to clear)
//   - no recipes exist at all, viewer is signed in (offer to create)
//   - no recipes exist at all, viewer is anonymous (offer to sign in)
// Each carries the same ornamental layout — centered, generous padding,
// the rustic ✦ glyph as a small visual anchor — so empty space reads
// as intentional rather than broken. Basket branch wins over search when
// both are active and yield nothing — opening the fridge is the cheaper
// fix (one click) vs retyping the search.
function EmptyGridState({ searchTerm, basketActive, hasAnyRecipes, session, onClearSearch, onOpenBasket, onSignIn, onCreate }) {
    if (basketActive && hasAnyRecipes) {
        return (
            <div className="text-center py-16">
                <p className="text-2xl text-tan mb-4">✦</p>
                <p className="font-display text-xl text-ink mb-2">Nothing in your fridge matches.</p>
                <p className="font-display italic text-rose mb-6">Add more ingredients, or open the fridge to clear it.</p>
                <button
                    onClick={onOpenBasket}
                    className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors"
                >
                    Open fridge
                </button>
            </div>
        )
    }

    if (searchTerm && hasAnyRecipes) {
        return (
            <div className="text-center py-16">
                <p className="text-2xl text-tan mb-4">✦</p>
                <p className="font-display text-xl text-ink mb-2">No recipes match "{searchTerm}"</p>
                <p className="font-display italic text-rose mb-6">Try a different word, or browse the full collection.</p>
                <button
                    onClick={onClearSearch}
                    className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors"
                >
                    Clear search
                </button>
            </div>
        )
    }

    if (session) {
        return (
            <div className="text-center py-16">
                <p className="text-2xl text-tan mb-4">✦</p>
                <p className="font-display text-xl text-ink mb-2">Your cookbook is empty.</p>
                <p className="font-display italic text-rose mb-6">Add your first recipe to get started.</p>
                <button
                    onClick={onCreate}
                    className="px-5 py-2.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors"
                >
                    + New Recipe
                </button>
            </div>
        )
    }

    return (
        <div className="text-center py-16">
            <p className="text-2xl text-tan mb-4">✦</p>
            <p className="font-display text-xl text-ink mb-2">No public recipes yet.</p>
            <p className="font-display italic text-rose mb-6">Sign in to start your own cookbook.</p>
            <button
                onClick={onSignIn}
                className="px-5 py-2.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors"
            >
                Sign In
            </button>
        </div>
    )
}

// Parses the search input into one of four modes:
//   - none: empty / whitespace-only input
//   - tag: comma present in raw input → split, trim, lowercase each token;
//     empty tokens dropped so "italian," still parses as one tag
//   - hybrid: single token with no whitespace → match against tags exactly
//     OR substring-match title/description. Catches the common case where
//     a user types one word ("vegetarian") and wants both tag-matches and
//     recipes whose title/description happens to contain the word.
//   - text: multi-word input (has whitespace, no comma) → substring match
//     on title/description only, since tags are normalized to single words
//     and an exact tag match against a multi-word query would never hit.
// Splitting on the *raw* string (not the trimmed one) is intentional so a
// lone comma still triggers tag mode; the empty-token filter then yields
// an empty array → no match, which is the right behavior for "just a comma".
function parseSearch(raw) {
    if (!raw || !raw.trim()) return { mode: 'none', tokens: [] }
    if (raw.includes(',')) {
        const tokens = raw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
        if (tokens.length === 0) return { mode: 'none', tokens: [] }
        return { mode: 'tag', tokens }
    }
    const trimmed = raw.trim().toLowerCase()
    if (!/\s/.test(trimmed)) return { mode: 'hybrid', tokens: [trimmed] }
    return { mode: 'text', tokens: [trimmed] }
}

// Lowercase word-boundary tokenize. "Cherry Tomatoes!" → ["cherry", "tomatoes"].
// Used by the fridge-basket matcher — splitting on /\W+/ is the v1 false-
// positive killer ("egg" in the basket matches "2 eggs" in a recipe but
// NOT "eggplant", because eggplant tokenizes to ["eggplant"] which doesn't
// contain the standalone token "egg"). Pure helper, no React dependency.
function tokenizeIngredient(s) {
    if (!s) return []
    return s.toLowerCase().split(/\W+/).filter(Boolean)
}

// True iff every basket entry's tokens all appear in the recipe's combined
// ingredient-name token set. Multi-word basket entries ("olive oil") split
// into ["olive", "oil"] and BOTH must appear — so "olive oil" in the basket
// matches a recipe ingredient like "extra-virgin olive oil" but NOT a
// recipe that only has "olives".
//
// Empty basket trivially passes — caller should still check basket.length
// before deciding whether to filter, to skip the per-recipe token-set
// build for the common no-basket case.
//
// Pure function so the filter strategy is swappable. When this moves
// server-side (likely a `tsvector` column on ingredients + a single SQL
// query with all basket tokens), this helper disappears and the call site
// changes to a server query — the basket hook's API stays unchanged.
function recipeMatchesBasket(recipe, basket) {
    if (basket.length === 0) return true
    const recipeTokens = new Set()
    ;(recipe.ingredients || []).forEach(ing => {
        tokenizeIngredient(ing.name).forEach(t => recipeTokens.add(t))
    })
    return basket.every(basketItem => {
        const itemTokens = tokenizeIngredient(basketItem)
        return itemTokens.length > 0 && itemTokens.every(t => recipeTokens.has(t))
    })
}

export default App

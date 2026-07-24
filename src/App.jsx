import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from './lib/supabaseClient'
import { useFavorites } from './hooks/useFavorites'
import { useLikes } from './hooks/useLikes'
import { useAdmin } from './hooks/useAdmin'
import { useOnboarding } from './hooks/useOnboarding'
import { useMfa } from './hooks/useMfa'
import { useFollowing } from './hooks/useFollowing'
import { useNotifications } from './hooks/useNotifications'
import { useReports } from './hooks/useReports'
import { useFridgeBasket } from './hooks/useFridgeBasket'
import { useShoppingList } from './hooks/useShoppingList'
import { useRecipeHistory } from './hooks/useRecipeHistory'
import { useBackdrop } from './hooks/useBackdrop'
import { useCookbooks } from './hooks/useCookbooks'
import { useTimers } from './hooks/useTimers'
import ErrorBoundary from './components/ErrorBoundary'
import Auth from './components/Auth'
import RecipeDetail from './components/RecipeDetail'
import RecipeCard from './components/RecipeCard'
import { SkeletonCard } from './components/Skeleton'
import EnvBanner from './components/EnvBanner'
import FridgeBasket from './components/FridgeBasket'
import NotificationsBell from './components/NotificationsBell'
import AddToPlanModal from './components/AddToPlanModal'
import OnboardingTour from './components/OnboardingTour'
import TimerWidget from './components/TimerWidget'
import TimerSetSheet from './components/TimerSetSheet'
import RecipeHistory from './components/RecipeHistory'
import { addRecipeToPlan } from './hooks/useMealPlan'

// Route-only views are code-split (FABLE.md §1.1): each becomes its own
// chunk fetched on first navigation, keeping the entry bundle to what the
// two real entry paths (home grid, /recipe/:id deep link) actually need.
// RecipeDetail and the App-level overlays (Auth, FridgeBasket, timers)
// stay eager — they're either an entry path or must render instantly.
const CreateRecipe = lazy(() => import('./components/CreateRecipe'))
const Profile = lazy(() => import('./components/Profile'))
const AuthorProfile = lazy(() => import('./components/AuthorProfile'))
const AdminReports = lazy(() => import('./components/AdminReports'))
const CookbookDetail = lazy(() => import('./components/CookbookDetail'))
const FollowingPhonebook = lazy(() => import('./components/FollowingPhonebook'))
const MyBookmarks = lazy(() => import('./components/MyBookmarks'))
const ShoppingList = lazy(() => import('./components/ShoppingList'))
const MealPlan = lazy(() => import('./components/MealPlan'))

// Suspense fallback for lazy routes — mirrors the RecipeDetailRoute
// loading treatment so a chunk fetch reads as a normal page load.
function RouteLoading() {
    return (
        <div className="paper-grain min-h-screen flex items-center justify-center">
            <p className="font-display italic text-rose" role="status">Loading…</p>
        </div>
    )
}

// Number of recipes to fetch per infinity-scroll page. 20 balances request
// overhead against initial-paint speed on phone. Lower it for visible
// testing when seed data has < 20 recipes.
const PAGE_SIZE = 20

// Sort picker model. Each metric (date, likes) has independent on/off
// AND independent direction, so all four (A,B) × (~A,~B) × (A,~B) ×
// (~A,B) combinations are reachable. When both are on, ordering is
// composed: likes is primary (popularity is the dominant signal when
// the user has asked for it), date is the tiebreaker. When neither is
// on, fetchRecipes falls back to date-desc so the grid is never
// nondeterministic. The shape: { date: { on, dir }, likes: { on, dir } }
// — see fetchRecipes for the ordering composition logic.
const ClockIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15 14" />
    </svg>
)
const HeartIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" />
    </svg>
)
const SORT_METRICS = [
    {
        key: 'date',
        label: 'Date',
        Icon: ClockIcon,
        column: 'created_at',
        labels: { desc: 'Newest first', asc: 'Oldest first' },
    },
    {
        key: 'likes',
        label: 'Likes',
        Icon: HeartIcon,
        column: 'like_count',
        labels: { desc: 'Most liked', asc: 'Least liked' },
    },
]
const DEFAULT_SORT_CONFIG = {
    date: { on: true, dir: 'desc' },
    likes: { on: false, dir: 'desc' },
}

function App() {
    const navigate = useNavigate()
    const location = useLocation()

    const [session, setSession] = useState(null)
    // `sessionLoaded` flips true once supabase.auth.getSession() resolves.
    // Without this sentinel, protected routes that gate on `!session` would
    // navigate to '/' on the first render of a deep-link reload — before
    // the persisted session is restored from local storage.
    const [sessionLoaded, setSessionLoaded] = useState(false)
    const [recipes, setRecipes] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')

    // Sort config for the home grid. Per-metric on/off + direction so the
    // user can combine metrics (e.g. likes-desc primary + date-desc
    // tiebreaker) or disable all (fetchRecipes falls back to date-desc).
    // Drives fetchRecipes' ordering composition; changing it must reset
    // pagination to page 0, since appending a page from a different sort
    // onto cached rows would mix two orderings into one visually
    // indistinguishable list. v1: date-only. v2: adds likes via the
    // `recipes_with_counts` view (migration 014). Bookmarks-sort deferred
    // — `favorites` is private (own-only RLS), so a public bookmark-count
    // aggregate is its own privacy decision.
    const [sortConfig, setSortConfig] = useState(DEFAULT_SORT_CONFIG)

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

    // Sort picker open/closed state. Direction memory lives inside
    // sortConfig now (flipping a chevron while the metric is off still
    // updates its dir, just doesn't trigger a refetch on its own — the
    // refetch only fires when sortConfig changes meaningfully, which
    // toggling the chevron does either way).
    const [sortOpen, setSortOpen] = useState(false)
    const sortMenuRef = useRef(null)

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

    // Same close-on-outside-click + Escape pattern for the sort dropdown.
    useEffect(() => {
        if (!sortOpen) return
        const onPointerDown = (e) => {
            if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) setSortOpen(false)
        }
        const onKey = (e) => { if (e.key === 'Escape') setSortOpen(false) }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('pointerdown', onPointerDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [sortOpen])

    const { isFavorited, toggleFavorite, refetch: refetchFavorites } = useFavorites(session?.user.id)
    const { likeCount, userLiked, toggleLike, refetch: refetchLikes } = useLikes(session?.user.id)
    const { isAdmin, loading: adminLoading } = useAdmin(session?.user.id)
    // First-run onboarding tour (Stage M). Column-only gate — shows for
    // signed-in users who've never dismissed it. Rendered only on the home
    // route (below) so it greets new users on the grid, not mid-task.
    const { showTour, dismiss: dismissOnboarding } = useOnboarding(session?.user.id)
    const mfa = useMfa(session?.user.id)
    const { isFollowing, getNotifyPref, toggleFollow, setNotifyPref } = useFollowing(session?.user.id)
    const { notifications, unreadCount, markRead, markAllRead } = useNotifications(session?.user.id)
    const { submitReport } = useReports(session)

    // Fridge basket — persistent ingredient list (localStorage). Lives at the
    // App level so the modal can mount above any route and so basket state
    // survives route changes. Filter coupling lands in a follow-up Stage 10
    // item; for now the basket is purely additive.
    const { basket, addIngredient, removeIngredient, clearBasket } = useFridgeBasket()

    // Shopping list (Stage N+2a) — cumulative cross-recipe "what to buy" list,
    // also localStorage-backed. App-level for the same reasons as the basket:
    // the count badge in the header stays live as recipes are sent to it, and
    // the /shopping-list page reads the same in-memory instance via props.
    const {
        items: shoppingItems,
        addRecipe: addToShoppingList,
        removeItem: removeShoppingItem,
        removeRecipe: removeShoppingRecipe,
        recentlyRemoved: shoppingRecentlyRemoved,
        restoreRemoved: restoreShoppingRemoved,
        dismissRemoved: dismissShoppingRemoved,
        clearList: clearShoppingList,
    } = useShoppingList()

    // Recipe history (Recipe History) — recently-viewed breadcrumbs, App-level
    // so the count badge on the home FAB stays live and the drawer can overlay
    // any route. sessionStorage-backed (browsing-session lifetime), fed by the
    // RecipeDetailRoute view effect below. See useRecipeHistory for why entries
    // are snapshots, not ids.
    const { history: recipeHistory, pushRecipe: pushRecipeHistory, clearHistory: clearRecipeHistory } = useRecipeHistory()
    const [historyOpen, setHistoryOpen] = useState(false)
    const historyTriggerRef = useRef(null)

    // Cooking-mode timer (Stage 19) — App-level so a running timer survives the
    // CookingMode <-> RecipeDetail boundary and route changes, and the floating
    // <TimerWidget> overlays any surface. The set sheet is opened from the
    // CookingMode header, the RecipeDetail "Timer" button, and the widget itself.
    const {
        timers,
        startTimer,
        pauseTimer,
        resumeTimer,
        resetTimer,
        addMinute: addTimerMinute,
        dismissTimer,
    } = useTimers()
    const [timerSheetOpen, setTimerSheetOpen] = useState(false)

    // Backdrop preference — written to data-backdrop on <html> by the hook
    // so the .paper-grain treatment swaps via CSS at every consumer surface
    // without per-component plumbing. Lives at App level (single source of
    // truth) and is passed into Profile so the Appearance tab can change it.
    const { backdrop, chooseBackdrop } = useBackdrop()

    // Cookbooks (Stage 14 item 1) — own cookbooks + recipe-membership.
    // Lives at App level so the future "Add to cookbook…" picker on
    // RecipeDetail and the Cookbook shelf on Profile share one source
    // of truth. Anonymous viewers get an empty list + no-op mutators.
    const cookbooksApi = useCookbooks(session?.user.id)

    const [basketOpen, setBasketOpen] = useState(false)
    const basketTriggerRef = useRef(null)

    // Recipe pending an "Add to plan" cell choice (home-card affordance), or
    // null when the modal is closed.
    const [addToPlanRecipe, setAddToPlanRecipe] = useState(null)

    useEffect(() => {
        // Check initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setSessionLoaded(true)
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
        fetchRecipes({ page: 0, append: false, config: sortConfig })
    }, [session, sortConfig])

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
                fetchRecipes({ page: pageRef.current + 1, append: true, config: sortConfig })
            }
        }, { rootMargin: '200px' })
        obs.observe(el)
        return () => obs.disconnect()
    }, [hasMore, loading, loadingMore, sortConfig])

    async function fetchRecipes({ page = 0, append = false, config = DEFAULT_SORT_CONFIG } = {}) {
        try {
            if (append) setLoadingMore(true)
            else setLoading(true)

            const from = page * PAGE_SIZE
            const to = from + PAGE_SIZE - 1

            // Sort config → table source + composed `.order()` clauses.
            //
            // Source selection: if `likes.on`, query the
            // `recipes_with_counts` view (migration 014) which exposes
            // `like_count` for ordering. Otherwise query `recipes` directly.
            // The view uses security_invoker so the recipes RLS still
            // filters; embedded relations resolve through the view because
            // PostgREST detects the inherited FKs (recipes.id →
            // ingredients.recipe_id, recipes.author_id → profiles.id).
            //
            // Ordering composition (priority order):
            //   1. likes  (if on) — primary when both are on, since
            //      popularity is the dominant signal once the user has
            //      asked for it.
            //   2. date   (if on)
            //   3. created_at DESC as an implicit fallback if neither is on
            //   4. id DESC as the final tiebreaker, always applied — keeps
            //      pagination deterministic when many rows share the same
            //      key (common at like_count = 0). Without it, Postgres is
            //      free to reorder ties between pages, leading to repeats
            //      or skips.
            //
            // `count: 'exact'` returns the full visible row count alongside
            // the page (respected by RLS so anon users get only the public
            // count). Used to size the column tier so layout doesn't reflow
            // as more pages load. Embed `ingredients(name)` so the
            // fridge-basket filter (Stage 10) can token-match without N+1.
            const source = config.likes.on ? 'recipes_with_counts' : 'recipes'

            let query = supabase
                .from(source)
                .select('*, ingredients(name), author:profiles!author_id(id, username, full_name, avatar_url)', { count: 'exact' })

            if (config.likes.on) {
                query = query.order('like_count', { ascending: config.likes.dir === 'asc' })
            }
            if (config.date.on) {
                query = query.order('created_at', { ascending: config.date.dir === 'asc' })
            } else if (!config.likes.on) {
                // No metric on — fall back to date-desc so the grid is never
                // nondeterministic.
                query = query.order('created_at', { ascending: false })
            }
            query = query.order('id', { ascending: false })

            const { data, error, count } = await query.range(from, to)

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

    // Pick a recipe from the history drawer → close it and navigate.
    const handleHistorySelect = (recipeId) => {
        setHistoryOpen(false)
        navigate(`/recipe/${recipeId}`)
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });

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

    // "Add to plan" from a recipe card → open the day/meal picker. Only wired
    // for signed-in users (meal plans are private), so unlike bookmark/like it
    // needs no anonymous branch.
    const handleAddToPlanRequest = (recipe) => {
        setAddToPlanRecipe(recipe)
    }

    const handleAddToPlanConfirm = async (dateISO, slot) => {
        if (!addToPlanRecipe || !session) return
        const { error } = await addRecipeToPlan(session.user.id, dateISO, slot, addToPlanRecipe.id)
        if (error) toast.error('Could not add to plan: ' + error.message)
        else toast.success(`Added "${addToPlanRecipe.title}" to your plan`)
        setAddToPlanRecipe(null)
    }

    // Bundled "shared" props for the home view + recipe detail wrapper.
    // Defined once so each <Route> JSX is short and changes to the shape
    // (e.g. adding a new handler) only need one update, not five.
    const homeViewProps = {
        session, recipes, loading, totalCount, hasMore, loadingMore,
        searchTerm, setSearchTerm,
        sortConfig, setSortConfig,
        sortOpen, setSortOpen, sortMenuRef,
        doubled, setDoubled, scrolled,
        tagsExpanded, setTagsExpanded,
        menuOpen, setMenuOpen, menuRef,
        sentinelRef,
        isFavorited, likeCount, userLiked,
        basket,
        basketTriggerRef,
        notifications, unreadCount, markRead, markAllRead,
        shoppingCount: shoppingItems.length,
        historyCount: recipeHistory.length,
        historyTriggerRef,
        onOpenHistory: () => setHistoryOpen(true),
        onOpenBasket: () => setBasketOpen(true),
        onRecipeClick: handleRecipeClick,
        onBookmarkClick: handleBookmarkClick,
        onLikeClick: handleLikeClick,
        onLogout: handleLogout,
        onSignIn: () => setShowAuth(true),
        isAdmin,
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
        cookbooks: cookbooksApi.cookbooks,
        isRecipeInCookbook: cookbooksApi.isRecipeInCookbook,
        addRecipeToCookbook: cookbooksApi.addRecipeToCookbook,
        removeRecipeFromCookbook: cookbooksApi.removeRecipeFromCookbook,
        createCookbook: cookbooksApi.createCookbook,
        addToShoppingList,
        mfa,
        submitReport,
        onOpenTimerSheet: () => setTimerSheetOpen(true),
        onAddToPlan: session ? handleAddToPlanRequest : undefined,
        onStartTimer: startTimer,
        pushRecipeHistory,
    }

    const handleCreateComplete = () => {
        navigate('/')
        fetchRecipes({ page: 0, append: false })
    }

    return (
        <>
            <EnvBanner />
            {/* Route-level error boundary (FABLE.md §4.1): a render crash in
                any routed view shows a reload card instead of white-screening
                the whole app. Keyed by pathname inside, so navigating away
                from a crashed route recovers without a reload. */}
            <ErrorBoundary>
            <Suspense fallback={<RouteLoading />}>
            <Routes>
                <Route path="/" element={<HomeView {...homeViewProps} />} />
                <Route path="/recipe/:id" element={<RecipeDetailRoute {...recipeDetailProps} />} />
                <Route
                    path="/shopping-list"
                    element={
                        <ShoppingList
                            items={shoppingItems}
                            onRemove={removeShoppingItem}
                            onRemoveRecipe={removeShoppingRecipe}
                            recentlyRemoved={shoppingRecentlyRemoved}
                            onRestore={restoreShoppingRemoved}
                            onDismiss={dismissShoppingRemoved}
                            onClear={clearShoppingList}
                        />
                    }
                />
                <Route
                    path="/plan"
                    element={
                        session
                            ? <MealPlan
                                session={session}
                                onBack={() => navigate('/')}
                                onRecipeClick={handleRecipeClick}
                                addToShoppingList={addToShoppingList}
                                basket={basket}
                                onViewShoppingList={() => navigate('/shopping-list')}
                            />
                            : <Navigate to="/" replace />
                    }
                />
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
                                backdrop={backdrop}
                                onChooseBackdrop={chooseBackdrop}
                                cookbooks={cookbooksApi.cookbooks}
                                createCookbook={cookbooksApi.createCookbook}
                                deleteCookbook={cookbooksApi.deleteCookbook}
                                cookbooksLoading={cookbooksApi.loading}
                                isAdmin={isAdmin}
                                mfa={mfa}
                            />
                            : <Navigate to="/" replace />
                    }
                />
                <Route
                    path="/profile/following"
                    element={
                        session
                            ? <FollowingPhonebook
                                session={session}
                                isFollowing={isFollowing}
                                onUnfollow={toggleFollow}
                                isFavorited={isFavorited}
                                onToggleFavorite={handleBookmarkClick}
                                likeCount={likeCount}
                                userLiked={userLiked}
                                onToggleLike={handleLikeClick}
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
                            onRequireAuth={() => setShowAuth(true)}
                            submitReport={submitReport}
                        />
                    }
                />
                <Route
                    path="/cookbook/:id"
                    element={
                        <CookbookDetail
                            session={session}
                            cookbooks={cookbooksApi.cookbooks}
                            updateCookbook={cookbooksApi.updateCookbook}
                            deleteCookbook={cookbooksApi.deleteCookbook}
                            addRecipeToCookbook={cookbooksApi.addRecipeToCookbook}
                            removeRecipeFromCookbook={cookbooksApi.removeRecipeFromCookbook}
                            isFavorited={isFavorited}
                            onToggleFavorite={handleBookmarkClick}
                            likeCount={likeCount}
                            userLiked={userLiked}
                            onToggleLike={handleLikeClick}
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
                <Route
                    path="/admin/reports"
                    element={
                        <AdminReports
                            session={session}
                            sessionLoaded={sessionLoaded}
                            isAdmin={isAdmin}
                            adminLoading={adminLoading}
                            mfa={mfa}
                        />
                    }
                />
                {/* Unknown route → home. Keeps the URL bar from displaying a 404
                    that the app can't render. Replaces in history so the back
                    button doesn't trap the user on the bad URL. */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
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
            <RecipeHistory
                isOpen={historyOpen}
                onClose={() => setHistoryOpen(false)}
                history={recipeHistory}
                onClear={clearRecipeHistory}
                onSelect={handleHistorySelect}
                openerRef={historyTriggerRef}
            />
            {addToPlanRecipe && (
                <AddToPlanModal
                    recipe={addToPlanRecipe}
                    onClose={() => setAddToPlanRecipe(null)}
                    onAdd={handleAddToPlanConfirm}
                />
            )}
            {/* First-run onboarding tour. Home route only so it greets new
                users on the grid rather than interrupting a sub-page; the
                hook's column-only gate handles the "show once" logic. */}
            {showTour && location.pathname === '/' && (
                <OnboardingTour onDismiss={dismissOnboarding} />
            )}
            {/* Cooking-mode timer (Stage 19) — floating stack + quick-set sheet.
                Both portal to <body>; the widget renders nothing when there are
                no timers, so it's inert on every other surface. */}
            <TimerWidget
                timers={timers}
                onPause={pauseTimer}
                onResume={resumeTimer}
                onReset={resetTimer}
                onAddMinute={addTimerMinute}
                onDismiss={dismissTimer}
                onAddTimer={() => setTimerSheetOpen(true)}
            />
            <TimerSetSheet
                open={timerSheetOpen}
                onClose={() => setTimerSheetOpen(false)}
                onStart={startTimer}
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
    sortConfig, setSortConfig,
    sortOpen, setSortOpen, sortMenuRef,
    doubled, setDoubled, scrolled,
    tagsExpanded, setTagsExpanded,
    menuOpen, setMenuOpen, menuRef,
    sentinelRef,
    isFavorited, likeCount, userLiked,
    basket, basketTriggerRef, onOpenBasket,
    shoppingCount,
    historyCount, historyTriggerRef, onOpenHistory,
    notifications, unreadCount, markRead, markAllRead,
    onRecipeClick, onBookmarkClick, onLikeClick,
    onLogout, onSignIn,
    isAdmin,
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

        {/* Fridge button. Mirrors density toggle on the left edge.
            Same scroll-trigger so all appear and disappear together.
            */}
        <button
            ref={basketTriggerRef}
            type="button"
            onClick={onOpenBasket}
            aria-label={basket.length === 0
                ? 'Open fridge basket'
                : `Open fridge basket (${basket.length} ingredient${basket.length === 1 ? '' : 's'})`}
            aria-haspopup="dialog"
            aria-hidden={!scrolled}
            className={`fixed top-18 left-4 z-40 w-12 h-12 rounded-full bg-paper-shade/90 backdrop-blur-sm shadow-md flex items-center justify-center transition-opacity duration-300 ${scrolled ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="3" width="14" height="18" rx="2" />
                <line x1="5" y1="11" x2="19" y2="11" />
                <line x1="9" y1="7" x2="9" y2="8" />
                <line x1="9" y1="15" x2="9" y2="16" />
            </svg>
            {/* <span>Fridge</span> */}
            {basket.length > 0 && (
                <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-rust text-paper text-xs font-semibold flex items-center justify-center"
                >
                    {basket.length}
                </span>
            )}
        </button>

        {/* Shopping list button. Mirrors density toggle on the left edge.
            Same scroll-trigger so all appear and disappear together.
            */}
        <button
            type="button"
            onClick={() => navigate('/shopping-list')}
            aria-label={shoppingCount > 0
                ? `Open shopping list (${shoppingCount} item${shoppingCount === 1 ? '' : 's'})`
                : 'Open shopping list'}
            aria-hidden={!scrolled}
            className={`fixed top-32 left-4 z-40 w-12 h-12 rounded-full bg-paper-shade/90 backdrop-blur-sm shadow-md flex items-center justify-center transition-opacity duration-300 ${scrolled ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            
            {shoppingCount > 0 && (
                <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-rust text-paper text-xs font-semibold flex items-center justify-center"
                >
                    {shoppingCount}
                </span>
            )}
        </button>

        {/* Recipe history button. Fourth in the left-edge FAB stack, below
            the shopping list. Same scroll-trigger + treatment so the stack
            appears and disappears together. Opens the recently-viewed drawer. */}
        <button
            ref={historyTriggerRef}
            type="button"
            onClick={onOpenHistory}
            aria-label={historyCount > 0
                ? `Open recently viewed (${historyCount} recipe${historyCount === 1 ? '' : 's'})`
                : 'Open recently viewed'}
            aria-haspopup="dialog"
            aria-hidden={!scrolled}
            className={`fixed top-46 left-4 z-40 w-12 h-12 rounded-full bg-paper-shade/90 backdrop-blur-sm shadow-md flex items-center justify-center transition-opacity duration-300 ${scrolled ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
            {/* Rewind clock — a clock face with a counterclockwise arrow —
                distinct from the plain clock used by the Date sort chip. */}
            <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v5h5" />
                <path d="M3.05 13a9 9 0 1 0 2.6-6.36L3 8" />
                <polyline points="12 8 12 12 15 14" />
            </svg>
            {historyCount > 0 && (
                <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-rust text-paper text-xs font-semibold flex items-center justify-center"
                >
                    {historyCount}
                </span>
            )}
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
                                    <button
                                        role="menuitem"
                                        onClick={() => { navigate('/plan'); setMenuOpen(false) }}
                                        className="w-full text-left px-4 py-2.5 text-ink font-medium hover:bg-paper-shade transition-colors"
                                    >
                                        Meal Plan
                                    </button>
                                    {isAdmin && (
                                        <button
                                            role="menuitem"
                                            onClick={() => { navigate('/admin/reports'); setMenuOpen(false) }}
                                            className="w-full text-left px-4 py-2.5 text-rose-dark font-medium hover:bg-paper-shade transition-colors"
                                        >
                                            Reports
                                        </button>
                                    )}
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
                {/* Sort picker (Stage 13 v2). Custom dropdown — two metric
                    rows (date, likes), each with independent on/off and
                    direction so all four (A,B) × (~A,~B) combinations are
                    reachable. Trigger always reads "Sort"; the active
                    metrics are shown by the left-side toggles inside the
                    menu. Each row has:
                      - Left: a switch-style toggle. Clicking it (or the row
                        body) flips this metric's on/off state — both can
                        be on at once.
                      - Right: a chevron that flips this metric's direction.
                        Flipping while off still updates the remembered
                        direction; it just doesn't change the rendered
                        order until the metric is toggled on.
                    fetchRecipes composes ordering from the live sortConfig
                    (see its comment for priority + source-table rules).
                    Native <select> was replaced because per-row toggle +
                    chevron isn't expressible in <select>/<option>. */}
                {(() => {
                    const toggleMetric = (key) => {
                        setSortConfig(prev => ({
                            ...prev,
                            [key]: { ...prev[key], on: !prev[key].on },
                        }))
                    }
                    const flipDir = (key) => {
                        setSortConfig(prev => ({
                            ...prev,
                            [key]: { ...prev[key], dir: prev[key].dir === 'desc' ? 'asc' : 'desc' },
                        }))
                    }
                    return (
                        <div ref={sortMenuRef} className="flex-shrink-0 relative">
                            <button
                                type="button"
                                onClick={() => setSortOpen(o => !o)}
                                aria-haspopup="menu"
                                aria-expanded={sortOpen}
                                aria-label="Sort recipes"
                                className="pl-3 pr-3 py-2.5 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rust/40 min-h-[44px] flex items-center gap-2"
                            >
                                {/* <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-down-wide-narrow-icon lucide-arrow-down-wide-narrow"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M11 4h10"/><path d="M11 8h7"/><path d="M11 12h4"/></svg> */}
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-list-sort-descending-icon lucide-list-sort-descending"><path d="M15 12H3"/><path d="M3 5h18"/><path d="M9 19H3"/></svg>
                                <svg aria-hidden="true" viewBox="0 0 24 24" className={`w-4 h-4 stroke-ink fill-none transition-transform ${sortOpen ? 'rotate-180' : ''}`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </button>
                            {sortOpen && (
                                <div role="menu" className="absolute right-0 top-full mt-2 z-40 w-64 bg-paper border border-paper-shade rounded-md shadow-lg overflow-hidden">
                                    {SORT_METRICS.map(m => {
                                        const { on, dir } = sortConfig[m.key]
                                        return (
                                            <div key={m.key} className="flex items-stretch border-b border-paper-shade last:border-b-0">
                                                <button
                                                    type="button"
                                                    role="menuitemcheckbox"
                                                    aria-checked={on}
                                                    onClick={() => toggleMetric(m.key)}
                                                    className={`flex-1 flex items-center gap-3 px-3 py-2.5 text-left text-ink transition-colors ${on ? 'bg-tan/30 font-semibold' : 'hover:bg-paper-shade'}`}
                                                >
                                                    {/* Left toggle — switch-style control. Visual
                                                        indicator only (aria-hidden); the parent
                                                        button carries role/aria-checked for a11y.
                                                        Clicking the parent toggles this metric's
                                                        on/off state independently of the other
                                                        metric. */}
                                                    <span
                                                        aria-hidden="true"
                                                        className={`relative inline-block w-9 h-5 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-rust' : 'bg-paper-shade border border-ink/20'}`}
                                                    >
                                                        <span
                                                            className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${on ? 'left-[18px] bg-paper' : 'left-0.5 bg-ink/30'}`}
                                                        />
                                                    </span>
                                                    <m.Icon className="w-4 h-4" />
                                                    <span>{m.labels[dir]}</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => flipDir(m.key)}
                                                    aria-label={`Flip ${m.label} direction (currently ${dir === 'desc' ? 'descending' : 'ascending'})`}
                                                    className="px-3 hover:bg-tan/40 text-ink flex items-center justify-center border-l border-paper-shade transition-colors"
                                                >
                                                    <svg aria-hidden="true" viewBox="0 0 24 24" className={`w-4 h-4 stroke-ink fill-none transition-transform ${dir === 'asc' ? 'rotate-180' : ''}`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="6 9 12 15 18 9" />
                                                    </svg>
                                                </button>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })()}
                {session && (
                    
                    <button onClick={() => navigate('/new')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-notebook-pen-icon lucide-notebook-pen">
                            <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/>
                            <path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/>
                            <path d="M2 18h4"/>
                            <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>
                        </svg>
                        New Recipe
                    </button>
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
                {/* Shopping list trigger — mirrors the Fridge button. Navigates
                    to the cumulative /shopping-list page; rust count badge when
                    the list has items. Visible to everyone (no-auth feature). */}
                <button
                    type="button"
                    onClick={() => navigate('/shopping-list')}
                    aria-label={shoppingCount > 0
                        ? `Open shopping list (${shoppingCount} item${shoppingCount === 1 ? '' : 's'})`
                        : 'Open shopping list'}
                    className="relative flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink rounded-full text-sm font-medium transition-colors min-h-[44px]"
                >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="21" r="1" />
                        <circle cx="20" cy="21" r="1" />
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                    </svg>
                    <span>List</span>
                    {shoppingCount > 0 && (
                        <span
                            aria-hidden="true"
                            className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-rust text-paper text-xs font-semibold flex items-center justify-center"
                        >
                            {shoppingCount}
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
    cookbooks, isRecipeInCookbook, addRecipeToCookbook, removeRecipeFromCookbook, createCookbook,
    addToShoppingList,
    mfa, submitReport,
    onOpenTimerSheet, onStartTimer, onAddToPlan,
    pushRecipeHistory,
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
        if (recipe?.id) {
            sessionStorage.setItem('lastViewedRecipeId', recipe.id)
            // Also record the view in the Recipe History breadcrumb list. We
            // pass the whole recipe so the hook can snapshot title/image/tags
            // for the drawer — the object is in hand here whether it came from
            // the grid cache or the deep-link fetch.
            pushRecipeHistory(recipe)
        }
        // recipe.id is the meaningful change signal; pushRecipeHistory is a
        // stable useCallback so it doesn't need to be a dep.
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            onAddToPlan={onAddToPlan ? () => onAddToPlan(recipe) : undefined}
            refetchLikes={refetchLikes}
            refetchFavorites={refetchFavorites}
            onRequireAuth={onRequireAuth}
            session={session}
            cookbooks={cookbooks}
            isRecipeInCookbook={isRecipeInCookbook}
            addRecipeToCookbook={addRecipeToCookbook}
            removeRecipeFromCookbook={removeRecipeFromCookbook}
            createCookbook={createCookbook}
            addToShoppingList={addToShoppingList}
            mfa={mfa}
            submitReport={submitReport}
            onOpenTimerSheet={onOpenTimerSheet}
            onStartTimer={onStartTimer}
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

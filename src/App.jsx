import { useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'
import './App.css'
import { supabase } from './lib/supabaseClient'
import { useFavorites } from './hooks/useFavorites'
import { useLikes } from './hooks/useLikes'
import Auth from './components/Auth'
import CreateRecipe from './components/CreateRecipe'
import RecipeDetail from './components/RecipeDetail'
import Profile from './components/Profile'
import MyBookmarks from './components/MyBookmarks'
import RecipeCard from './components/RecipeCard'
import { SkeletonCard } from './components/Skeleton'

// Number of recipes to fetch per infinity-scroll page. 20 balances request
// overhead against initial-paint speed on phone. Lower it for visible
// testing when seed data has < 20 recipes.
const PAGE_SIZE = 20

function App() {
    const [session, setSession] = useState(null)
    const [recipes, setRecipes] = useState([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [showProfile, setShowProfile] = useState(false)
    const [showBookmarks, setShowBookmarks] = useState(false)
    const [showAuth, setShowAuth] = useState(false)
    const [selectedRecipe, setSelectedRecipe] = useState(null)
    const [editingRecipe, setEditingRecipe] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')

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

    const { isFavorited, toggleFavorite } = useFavorites(session?.user.id)
    const { likeCount, userLiked, toggleLike } = useLikes(session?.user.id)

    useEffect(() => {
        // Check initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
        })

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session)
            if (event === 'PASSWORD_RECOVERY') {
                setShowProfile(true)
            }
            // Close the auth view once a session is established
            if (session) {
                setShowAuth(false)
            }
            // On sign-out (including token expiry), reset all view state so
            // re-login always returns to the home grid, not a stale sub-page.
            if (!session) {
                setShowProfile(false)
                setShowBookmarks(false)
                setShowCreate(false)
                setMenuOpen(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    // Fetch recipes for everyone, including anonymous visitors.
    // RLS filters: `is_public OR auth.uid() = author_id`, so anon users
    // see only public recipes; logged-in users see public + their own.
    // Refetch on session change so private recipes appear/disappear —
    // resets pagination back to page 0.
    useEffect(() => {
        pageRef.current = 0
        setHasMore(true)
        fetchRecipes({ page: 0, append: false })
    }, [session])

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
                fetchRecipes({ page: pageRef.current + 1, append: true })
            }
        }, { rootMargin: '200px' })
        obs.observe(el)
        return () => obs.disconnect()
    }, [hasMore, loading, loadingMore])

    async function fetchRecipes({ page = 0, append = false } = {}) {
        try {
            if (append) setLoadingMore(true)
            else setLoading(true)

            const from = page * PAGE_SIZE
            const to = from + PAGE_SIZE - 1

            // `count: 'exact'` returns the full visible row count alongside
            // the page. Respected by RLS, so anon users get only the public
            // count. Used to size the column tier so layout doesn't reflow
            // as more pages load.
            const { data, error, count } = await supabase
                .from('recipes')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
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
        setShowProfile(false)
        setShowBookmarks(false)
        setShowCreate(false)
        setMenuOpen(false)
    }

    const handleEditRecipe = (recipe) => {
        setEditingRecipe(recipe)
        setShowCreate(true)
        setSelectedRecipe(null)
        setShowProfile(false)
        setShowBookmarks(false)
    }

    const handleRecipeDeleted = () => {
        setSelectedRecipe(null)
        fetchRecipes()
    }

    const handleRecipeClick = (recipe) => {
        setSelectedRecipe(recipe)
        setShowProfile(false)
        setShowCreate(false)
        setShowBookmarks(false)
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

    // Build the main content first; Auth is then layered as a fixed-position
    // overlay sibling so it can slide in/out over whatever's currently shown.
    // Auth was previously an early-return that wholesale replaced the view —
    // an overlay keeps the underlying page rendered behind it during the slide.
    const renderMainView = () => {
        if (showProfile && session) {
            return <Profile
                session={session}
                onBack={() => setShowProfile(false)}
                onRecipeClick={handleRecipeClick}
                isFavorited={isFavorited}
                onToggleFavorite={handleBookmarkClick}
                likeCount={likeCount}
                userLiked={userLiked}
                onToggleLike={handleLikeClick}
            />
        }

        if (showBookmarks && session) {
            return <MyBookmarks
                session={session}
                onBack={() => setShowBookmarks(false)}
                onRecipeClick={handleRecipeClick}
                isFavorited={isFavorited}
                onToggleFavorite={handleBookmarkClick}
                likeCount={likeCount}
                userLiked={userLiked}
                onToggleLike={handleLikeClick}
            />
        }

        if (showCreate && session) {
            return <CreateRecipe
                userId={session.user.id}
                recipeToEdit={editingRecipe}
                onComplete={() => {
                    setShowCreate(false)
                    setEditingRecipe(null)
                    fetchRecipes()
                }}
            />
        }

        if (selectedRecipe) {
            return <RecipeDetail
                recipe={selectedRecipe}
                userId={session?.user.id}
                onBack={() => setSelectedRecipe(null)}
                onEdit={handleEditRecipe}
                onDelete={handleRecipeDeleted}
                favorited={isFavorited(selectedRecipe.id)}
                onToggleFavorite={() => handleBookmarkClick(selectedRecipe.id)}
                liked={userLiked(selectedRecipe.id)}
                likeCount={likeCount(selectedRecipe.id)}
                onToggleLike={() => handleLikeClick(selectedRecipe.id)}
                onRequireAuth={() => setShowAuth(true)}
            />
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

        const filteredRecipes = recipes.filter(recipe => {
            if (searchMode === 'none') return true
            if (searchMode === 'tag') {
                const recipeTagsLower = (recipe.tags || []).map(t => t.toLowerCase())
                return searchTokens.every(token => recipeTagsLower.includes(token))
            }
            const q = searchTokens[0]
            if (searchMode === 'hybrid') {
                const recipeTagsLower = (recipe.tags || []).map(t => t.toLowerCase())
                if (recipeTagsLower.includes(q)) return true
            }
            return recipe.title.toLowerCase().includes(q) ||
                recipe.description?.toLowerCase().includes(q)
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
            <div className="paper-grain min-h-screen">
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
                    <div className="flex gap-3 flex-shrink-0">
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
                                            onClick={() => { setShowProfile(true); setMenuOpen(false) }}
                                            className="w-full text-left px-4 py-2.5 text-ink font-medium hover:bg-paper-shade transition-colors"
                                        >
                                            My Profile
                                        </button>
                                        <button
                                            role="menuitem"
                                            onClick={() => { setShowBookmarks(true); setMenuOpen(false) }}
                                            className="w-full text-left px-4 py-2.5 text-ink font-medium hover:bg-paper-shade transition-colors"
                                        >
                                            Bookmarks
                                        </button>
                                        <div className="border-t border-paper-shade" aria-hidden="true" />
                                        <button
                                            role="menuitem"
                                            onClick={async () => { await handleLogout(); setMenuOpen(false) }}
                                            className="w-full text-left px-4 py-2.5 text-rose font-medium hover:bg-paper-shade transition-colors"
                                        >
                                            Log out
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <button onClick={() => setShowAuth(true)} className="px-5 py-2.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors">Sign In</button>
                        )}
                    </div>
                </header>

                <div className="flex gap-3 items-center mb-8">
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
                    <div className="flex-1 min-w-0 relative">
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
                    {session && (
                        <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors flex-shrink-0">+ New Recipe</button>
                    )}
                </div>

                {/* Tag chip row — discoverability layer over the tag-mode
                    search syntax. Each chip toggles its tag into the search
                    input as a comma-separated token; the chip's active state
                    is derived from the input so typed and clicked filters
                    stay visually in sync. Hidden when no tags exist on the
                    loaded recipes. */}
                {availableTags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6 items-center" role="group" aria-label="Filter by tag">
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
                )}

                {loading ? (
                    <div className={`${gridColumnsClass} gap-4 mt-6`} role="status" aria-label="Loading recipes">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <SkeletonCard key={i} index={i} />
                        ))}
                    </div>
                ) : filteredRecipes.length === 0 ? (
                    <EmptyGridState
                        searchTerm={searchTerm}
                        hasAnyRecipes={totalCount > 0}
                        session={session}
                        onClearSearch={() => setSearchTerm('')}
                        onSignIn={() => setShowAuth(true)}
                        onCreate={() => setShowCreate(true)}
                    />
                ) : (
                    <>
                        <div className={`${gridColumnsClass} gap-4 mt-6`}>
                            {filteredRecipes.map(recipe => (
                                <RecipeCard
                                    key={recipe.id}
                                    recipe={recipe}
                                    onClick={() => handleRecipeClick(recipe)}
                                    favorited={isFavorited(recipe.id)}
                                    onToggleFavorite={() => handleBookmarkClick(recipe.id)}
                                    liked={userLiked(recipe.id)}
                                    likeCount={likeCount(recipe.id)}
                                    onToggleLike={() => handleLikeClick(recipe.id)}
                                />
                            ))}
                        </div>

                        {/* Infinity-scroll sentinel + indicators. The sentinel
                            triggers the next page fetch as it approaches the
                            viewport. When we know we've reached the end
                            (hasMore=false AND we've loaded more than one
                            page), show a quiet ✦ marker. Sentinel skipped
                            during search-filtering since the filter is
                            client-side and "more recipes" don't necessarily
                            match the search anyway. */}
                        {!searchTerm && hasMore && (
                            <div ref={sentinelRef} aria-hidden="true" className="h-1 w-full" />
                        )}
                        {loadingMore && (
                            <p className="text-center font-display italic text-rose py-6" role="status">
                                Loading more recipes…
                            </p>
                        )}
                        {!searchTerm && !hasMore && recipes.length > PAGE_SIZE && (
                            <p aria-hidden="true" className="text-center text-tan text-xl py-6">✦</p>
                        )}
                    </>
                    )}
                </div>
            </div>
        )
    }

    return (
        <>
            {renderMainView()}
            <div
                aria-hidden={!showAuth}
                className={`fixed inset-0 z-50 transition-transform duration-[450ms] ease-out ${showAuth ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
            >
                <Auth onBack={() => setShowAuth(false)} />
            </div>
        </>
    )
}

// Three distinct empty states for the home grid:
//   - search returned nothing (offer to clear)
//   - no recipes exist at all, viewer is signed in (offer to create)
//   - no recipes exist at all, viewer is anonymous (offer to sign in)
// Each carries the same ornamental layout — centered, generous padding,
// the rustic ✦ glyph as a small visual anchor — so empty space reads
// as intentional rather than broken.
function EmptyGridState({ searchTerm, hasAnyRecipes, session, onClearSearch, onSignIn, onCreate }) {
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

export default App

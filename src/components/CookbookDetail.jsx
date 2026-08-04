import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'
import RecipeCard from './RecipeCard'
import ProfileBookSpread from './ProfileBookSpread'
import RecipesCarousel from './RecipesCarousel'

// Stage 14 item 1 — public cookbook page at /cookbook/:id.
//
// Sibling pattern to /profile/:id (AuthorProfile): anyone can view a
// public cookbook; the cookbook's owner additionally gets inline edit
// + delete affordances. RLS does the actual gating — private cookbooks
// belonging to other users return no row, which we surface as a
// "not found" empty state.
//
// Cache strategy: if the signed-in user owns the cookbook, the parent
// `useCookbooks` hook already has it in memory — use that as the cache.
// Otherwise (someone else's public cookbook, or a deep link before the
// user's own cookbooks have loaded), fetch by id with an embedded join
// to cookbook_recipes → recipes → ingredients + author. Single round-trip.
export default function CookbookDetail({
    session,
    cookbooks,           // signed-in user's own cookbooks (from useCookbooks)
    updateCookbook,
    deleteCookbook,
    removeRecipeFromCookbook,
    isFavorited,
    onToggleFavorite,
    likeCount,
    userLiked,
    fetchCounts,
    onToggleLike,
}) {
    const { id } = useParams()
    const navigate = useNavigate()

    const cachedOwn = cookbooks?.find(c => c.id === id) || null
    const [fetched, setFetched] = useState(null)
    const [fetchedRecipes, setFetchedRecipes] = useState(null)
    const [fetchState, setFetchState] = useState(cachedOwn ? 'idle' : 'loading') // 'loading' | 'idle' | 'notfound'

    const cookbook = cachedOwn || fetched
    const isOwner = !!cookbook && session?.user.id === cookbook.owner_id

    // For the carousel height envelope — keep the spread visually
    // rectangular regardless of cookbook size, same pattern as
    // AuthorProfile / ProfileTabs / FollowingPhonebook.
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
    }, [cookbook])

    // Fetch path: only runs when the cookbook isn't in the owner's cache.
    // For the owner, we still need to fetch the contained recipes (the
    // cache only has recipe IDs — not the full recipe rows). For a
    // non-owner, we fetch both cookbook metadata + recipes in one query
    // via PostgREST embed.
    useEffect(() => {
        let cancelled = false

        async function load() {
            setFetchState('loading')

            if (cachedOwn) {
                // Owner case — fetch only the contained recipes.
                const { data, error } = await supabase
                    .from('cookbook_recipes')
                    .select('recipe_id, added_at, position, recipes(*, ingredients(name), author:profiles!author_id(id, username, full_name, avatar_url))')
                    .eq('cookbook_id', id)
                    .order('position', { ascending: true })
                    .order('added_at', { ascending: false })
                if (cancelled) return
                if (error) {
                    console.error('Error fetching cookbook recipes:', error.message)
                    setFetchedRecipes([])
                } else {
                    const rows = (data || []).map(r => r.recipes).filter(Boolean)
                    setFetchedRecipes(rows)
                    // Embedded rows come from the `recipes` table (no
                    // `like_count`), so fetch counts for just these ids
                    // (§1.2 — bounded, not a full-table scan).
                    fetchCounts?.(rows.map(r => r.id))
                }
                setFetchState('idle')
                return
            }

            // Non-owner case — fetch cookbook + recipes in one query.
            const { data, error } = await supabase
                .from('cookbooks')
                .select('*, owner:profiles!owner_id(id, username, full_name, avatar_url), cookbook_recipes(recipe_id, position, added_at, recipes(*, ingredients(name), author:profiles!author_id(id, username, full_name, avatar_url)))')
                .eq('id', id)
                .maybeSingle()

            if (cancelled) return
            if (error || !data) {
                setFetchState('notfound')
                setFetched(null)
                setFetchedRecipes([])
                return
            }
            const { cookbook_recipes, ...cookbookRow } = data
            setFetched(cookbookRow)
            // Sort by position then added_at to match the owner-case query.
            const sorted = (cookbook_recipes || [])
                .slice()
                .sort((a, b) => (a.position - b.position) || (new Date(b.added_at) - new Date(a.added_at)))
                .map(r => r.recipes)
                .filter(Boolean)
            setFetchedRecipes(sorted)
            fetchCounts?.(sorted.map(r => r.id))
            setFetchState('idle')
        }

        load()
        return () => { cancelled = true }
        // Keyed on the stable `id`/`cachedOwn?.id`, not the whole `cachedOwn`
        // object — re-running on object identity churn would refetch needlessly.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, cachedOwn?.id])

    // ----- inline edit state (owner only) -----
    const [editingTitle, setEditingTitle] = useState(false)
    const [titleDraft, setTitleDraft] = useState('')
    const [editingDescription, setEditingDescription] = useState(false)
    const [descriptionDraft, setDescriptionDraft] = useState('')

    const startEditTitle = () => {
        if (!isOwner) return
        setTitleDraft(cookbook.title)
        setEditingTitle(true)
    }
    const commitTitle = async () => {
        const trimmed = titleDraft.trim()
        if (!trimmed || trimmed === cookbook.title) {
            setEditingTitle(false)
            return
        }
        try {
            await updateCookbook(cookbook.id, { title: trimmed })
            toast.success('Title updated')
        } catch (e) {
            toast.error('Could not update title: ' + (e.message || ''))
        }
        setEditingTitle(false)
    }

    const startEditDescription = () => {
        if (!isOwner) return
        setDescriptionDraft(cookbook.description || '')
        setEditingDescription(true)
    }
    const commitDescription = async () => {
        const trimmed = descriptionDraft.trim() || null
        if ((trimmed || '') === (cookbook.description || '')) {
            setEditingDescription(false)
            return
        }
        try {
            await updateCookbook(cookbook.id, { description: trimmed })
            toast.success('Description updated')
        } catch (e) {
            toast.error('Could not update description: ' + (e.message || ''))
        }
        setEditingDescription(false)
    }

    const togglePublic = async () => {
        if (!isOwner) return
        try {
            await updateCookbook(cookbook.id, { is_public: !cookbook.is_public })
            toast.success(cookbook.is_public ? 'Cookbook is now private' : 'Cookbook is now public')
        } catch (e) {
            toast.error('Could not update visibility: ' + (e.message || ''))
        }
    }

    const handleDelete = async () => {
        if (!isOwner) return
        if (!window.confirm(`Delete "${cookbook.title}"? Recipes stay in your library.`)) return
        try {
            await deleteCookbook(cookbook.id)
            toast.success('Cookbook deleted')
            navigate('/profile')
        } catch (e) {
            toast.error('Could not delete cookbook: ' + (e.message || ''))
        }
    }

    const handleRemoveRecipe = async (recipeId) => {
        if (!isOwner) return
        try {
            await removeRecipeFromCookbook(cookbook.id, recipeId)
            // Optimistic update on the local fetchedRecipes list so the
            // card disappears from the carousel immediately. The hook's
            // map is already updated optimistically by the mutator.
            setFetchedRecipes(prev => (prev || []).filter(r => r.id !== recipeId))
            toast.success('Removed from cookbook')
        } catch (e) {
            toast.error('Could not remove: ' + (e.message || ''))
        }
    }
    // ------------------------------------------

    if (fetchState === 'loading') {
        return (
            <div className="paper-grain min-h-screen flex items-center justify-center">
                <p className="font-display italic text-rose" role="status">Loading cookbook…</p>
            </div>
        )
    }

    if (fetchState === 'notfound' || !cookbook) {
        return (
            <div className="paper-grain min-h-screen">
                <div className="max-w-3xl mx-auto px-5 py-16 text-center">
                    <p className="text-2xl text-tan mb-4">✦</p>
                    <p className="font-display text-xl text-ink mb-2">Cookbook not found</p>
                    <p className="font-display italic text-rose mb-6">The link may be incorrect, or this cookbook is private.</p>
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

    const recipes = fetchedRecipes || []
    const owner = cookbook.owner
    const ownerDisplayName = owner
        ? (owner.username?.trim() || owner.full_name?.trim() || 'Anonymous chef')
        : (isOwner ? (session.user.email?.split('@')[0] || 'You') : null)

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
                    className="flex flex-col gap-4 min-w-0"
                    style={{ minHeight: 'min(75vh, 700px)' }}
                >
                    {/* Title — click to edit when owner. */}
                    {editingTitle ? (
                        <input
                            autoFocus
                            type="text"
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            onBlur={commitTitle}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); commitTitle() }
                                if (e.key === 'Escape') { setEditingTitle(false) }
                            }}
                            maxLength={80}
                            className="font-display text-2xl sm:text-3xl font-semibold text-ink bg-paper border border-rust rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-rust/40"
                        />
                    ) : (
                        <h1
                            onClick={isOwner ? startEditTitle : undefined}
                            className={
                                'font-display text-2xl sm:text-3xl font-semibold text-ink m-0 '
                                + (isOwner ? 'cursor-pointer hover:bg-paper-shade/50 px-1 -mx-1 rounded transition-colors' : '')
                            }
                            title={isOwner ? 'Click to edit' : undefined}
                        >
                            {cookbook.title}
                        </h1>
                    )}

                    {/* Description — click to edit when owner; renders an
                        italic placeholder for owners with no description yet. */}
                    {editingDescription ? (
                        <textarea
                            autoFocus
                            value={descriptionDraft}
                            onChange={(e) => setDescriptionDraft(e.target.value)}
                            onBlur={commitDescription}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') { setEditingDescription(false) }
                            }}
                            rows={3}
                            maxLength={240}
                            className="font-serif text-ink bg-paper border border-rust rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rust/40"
                        />
                    ) : cookbook.description ? (
                        <p
                            onClick={isOwner ? startEditDescription : undefined}
                            className={
                                'font-serif italic text-ink/80 leading-relaxed '
                                + (isOwner ? 'cursor-pointer hover:bg-paper-shade/50 px-1 -mx-1 rounded transition-colors' : '')
                            }
                            title={isOwner ? 'Click to edit' : undefined}
                        >
                            {cookbook.description}
                        </p>
                    ) : isOwner ? (
                        <p
                            onClick={startEditDescription}
                            className="font-serif italic text-rose/60 cursor-pointer hover:bg-paper-shade/50 px-1 -mx-1 rounded transition-colors"
                        >
                            Add a description…
                        </p>
                    ) : null}

                    {/* Owner byline — links to /profile/:id when we know
                        who the owner is. For the owner viewing their own,
                        falls back to "by you". */}
                    <p className="font-serif text-ink/60 text-sm">
                        by{' '}
                        {owner && !isOwner ? (
                            <a
                                href={`/profile/${owner.id}`}
                                onClick={(e) => { e.preventDefault(); navigate(`/profile/${owner.id}`) }}
                                className="text-rust hover:underline"
                            >
                                {ownerDisplayName}
                            </a>
                        ) : (
                            <span>{isOwner ? 'you' : ownerDisplayName}</span>
                        )}
                    </p>

                    {/* Owner controls. Pinned to the bottom of the left
                        page via mt-auto so they don't fight the title /
                        description for visual priority. */}
                    {isOwner && (
                        <div className="mt-auto pt-6 border-t border-paper-shade flex flex-col gap-3">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <span className="relative inline-block w-10 h-6">
                                    <input
                                        type="checkbox"
                                        checked={cookbook.is_public}
                                        onChange={togglePublic}
                                        className="sr-only peer"
                                    />
                                    <span className="absolute inset-0 rounded-full bg-paper-shade peer-checked:bg-rust transition-colors" />
                                    <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-paper peer-checked:left-4 transition-all" />
                                </span>
                                <span className="font-serif text-sm text-ink">
                                    {cookbook.is_public
                                        ? 'Public — anyone can browse this cookbook'
                                        : 'Private — only you can see this cookbook'}
                                </span>
                            </label>

                            <button
                                type="button"
                                onClick={handleDelete}
                                className="self-start px-4 py-2 bg-rose-dark hover:bg-rose text-paper font-semibold rounded-md transition-colors"
                            >
                                Delete cookbook
                            </button>
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
                            <p className="font-display text-lg text-ink mb-1">No recipes here yet.</p>
                            <p className="font-display italic text-rose">
                                {isOwner
                                    ? 'Open any recipe and tap "Cookbook" to add it here.'
                                    : "This cookbook is still being curated."}
                            </p>
                        </div>
                    ) : (
                        <RecipesCarousel
                            recipes={recipes}
                            maxHeight={leftContentHeight}
                            renderRecipe={(recipe) => (
                                <div key={recipe.id} className="relative">
                                    <RecipeCard
                                        recipe={recipe}
                                        onClick={() => navigate(`/recipe/${recipe.id}`)}
                                        favorited={isFavorited ? isFavorited(recipe.id) : false}
                                        onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(recipe.id) : undefined}
                                        liked={userLiked ? userLiked(recipe.id) : false}
                                        likeCount={likeCount ? likeCount(recipe.id) : 0}
                                        onToggleLike={onToggleLike ? () => onToggleLike(recipe.id) : undefined}
                                    />
                                    {isOwner && (
                                        // Owner-only "Remove from cookbook" — icon-only
                                        // circle at top-center. Tucked between the like
                                        // (top-left) and bookmark (top-right) overlays so
                                        // the three sit on the same horizontal line as
                                        // matching circular controls without colliding
                                        // with the title gradient at the bottom of the card.
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleRemoveRecipe(recipe.id)
                                            }}
                                            aria-label={`Remove ${recipe.title} from cookbook`}
                                            title="Remove from cookbook"
                                            className="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-9 h-9 rounded-full bg-paper-shade/90 hover:bg-rose-dark hover:text-paper text-rose-dark backdrop-blur-sm shadow-md flex items-center justify-center transition-colors"
                                        >
                                            <svg aria-hidden="true" viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                                <path d="M4 4l8 8M12 4l-8 8" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            )}
                        />
                    )}
                </section>
            }
        />
    )
}

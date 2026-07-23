import { useState, useEffect, useRef, lazy, Suspense, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'
import BookmarkButton from './BookmarkButton'
import LikeButton from './LikeButton'
import AddToPlanButton from './AddToPlanButton'
import ShareButton from './ShareButton'
import AddToCookbookButton from './AddToCookbookButton'
import ExportIngredientsButton from './ExportIngredientsButton'
import SendToShoppingListButton from './SendToShoppingListButton'
import ReportButton from './ReportButton'
import Comments from './Comments'
import RecipeRail from './RecipeRail'
import Skeleton from './Skeleton'
import MfaChallengeGate from './MfaChallengeGate'
import Lightbox from './Lightbox'
import useRecipeRails from '../hooks/useRecipeRails'
import { useDragSort } from '../hooks/useDragSort'
import { arrayMove } from '../lib/dragSortCore'
import { groupIngredients, clampMoveToSection } from '../lib/ingredientSections'
import { scaleQuantity } from '../lib/scaleQuantity'
import { formatMs } from '../lib/parseDuration'
import DragHandleIcon from './DragHandleIcon'

// Code-split (FABLE.md §1.1): CookingMode is a full-screen surface used by
// a fraction of recipe views, so its chunk loads on the first "Start
// cooking" tap. The fullscreen request stays in handleStartCooking's
// user-gesture context, so lazy-mounting doesn't affect it.
const CookingMode = lazy(() => import('./CookingMode'))

export default function RecipeDetail({
    recipe,
    userId,
    isAdmin = false,
    onBack,
    onEdit,
    onDelete,
    favorited,
    onToggleFavorite,
    liked,
    likeCount = 0,
    onToggleLike,
    onAddToPlan,
    refetchLikes,
    refetchFavorites,
    onRequireAuth,
    session,
    cookbooks = [],
    isRecipeInCookbook,
    addRecipeToCookbook,
    removeRecipeFromCookbook,
    createCookbook,
    addToShoppingList,
    mfa,
    submitReport,
    onOpenTimerSheet,
    onStartTimer,
}) {
    const [ingredients, setIngredients] = useState([])
    const [steps, setSteps] = useState([])
    const [loading, setLoading] = useState(true)
    // Author-only drag reorder (ui-addons). Moves stay local — recorded by these
    // dirty flags — until the author taps "Save order", which writes the new
    // positions back to Supabase. Reset whenever a different recipe loads.
    const [ingredientsDirty, setIngredientsDirty] = useState(false)
    const [stepsDirty, setStepsDirty] = useState(false)
    const [savingOrder, setSavingOrder] = useState(false)
    const [targetServings, setTargetServings] = useState(recipe.servings || 1)
    // Stage 21 — per-section collapse, keyed by group position in the derived
    // run list. Local state only; resets per recipe, and expands for drags and
    // PDF capture (both need every row's real geometry/content).
    const [collapsedSections, setCollapsedSections] = useState(() => new Set())
    const [checkedIngredients, setCheckedIngredients] = useState(() => new Set())
    const [checkedSteps, setCheckedSteps] = useState(() => new Set())
    const [pdfLoading, setPdfLoading] = useState(false)
    const [cooking, setCooking] = useState(false)
    // Stage 15 item 1 — lightbox URL for an expanded step photo. Null = closed.
    const [lightboxUrl, setLightboxUrl] = useState(null)
    const [swipeX, setSwipeX] = useState(0)
    const touchRef = useRef({ startX: 0, startY: 0, lastX: 0, lastY: 0, tracking: false })
    // Tracks whether cooking-mode entry was the source of the current
    // fullscreen state, so handleExitCooking doesn't yank the user out of
    // a fullscreen they were already in for some other reason.
    const fullscreenRequestedRef = useRef(false)

    // Stage 15 — landscape on mobile is where cooking mode benefits most
    // from extra vertical space, so request fullscreen on entry. Must run
    // synchronously inside this click handler — the Fullscreen API requires
    // an active user-gesture context and a useEffect on mount of CookingMode
    // would no longer qualify. iOS Safari doesn't support requestFullscreen
    // on non-video elements; .catch swallows that and any user denial.
    const handleStartCooking = () => {
        if (
            window.matchMedia('(orientation: landscape)').matches &&
            !document.fullscreenElement &&
            document.documentElement.requestFullscreen
        ) {
            document.documentElement.requestFullscreen()
                .then(() => { fullscreenRequestedRef.current = true })
                .catch(() => {})
        }
        setCooking(true)
    }

    const handleExitCooking = () => {
        if (fullscreenRequestedRef.current && document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {})
        }
        fullscreenRequestedRef.current = false
        setCooking(false)
    }

    const stepPhotoUrl = (path) => {
        if (!path) return null
        return supabase.storage.from('recipe-steps').getPublicUrl(path).data.publicUrl
    }

    // Stage 14 item 1 — body layout toggle. "sheet" = single-column scroll
    // (the original layout); "spread" = two-page book layout with ingredients
    // on the left page and steps on the right, reusing the .book-spread /
    // .book-page vocabulary from ProfileBookSpread. SessionStorage scope so
    // the preference travels across recipes inside the same kitchen session
    // but resets when the tab closes.
    const [layout, setLayout] = useState(() => {
        if (typeof window === 'undefined') return 'sheet'
        return sessionStorage.getItem('cookbook.recipeDetailLayout') === 'spread' ? 'spread' : 'sheet'
    })

    useEffect(() => {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('cookbook.recipeDetailLayout', layout)
        }
    }, [layout])

    const isAuthor = userId === recipe.author_id
    const baseServings = recipe.servings || 1
    const multiplier = targetServings / baseServings

    // Stage 17a — recommendation rails ("More from this author" / "Similar
    // recipes"). Fired in parallel with the ingredients/steps fetch above;
    // each rail self-hides when empty so no parent gating needed.
    const { authorRecipes, similarRecipes } = useRecipeRails(recipe)
    const authorName = recipe.author?.username?.trim() || recipe.author?.full_name?.trim()
    const authorRailTitle = authorName ? `More from ${authorName}` : 'More from this author'

    useEffect(() => {
        fetchRecipeDetails()
        setCheckedIngredients(new Set())
        setCheckedSteps(new Set())
        setCollapsedSections(new Set())
        setIngredientsDirty(false)
        setStepsDirty(false)
        // Re-run only when the recipe changes; `fetchRecipeDetails` is recreated
        // each render and is not a meaningful dependency.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recipe.id])

    function toggleChecked(setter, id) {
        setter(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    async function fetchRecipeDetails() {
        try {
            setLoading(true)

            // Fetch ingredients
            const { data: ingData, error: ingError } = await supabase
                .from('ingredients')
                .select('*')
                .eq('recipe_id', recipe.id)
                .order('order_index', { ascending: true })

            if (ingError) throw ingError

            // Fetch steps
            const { data: stepData, error: stepError } = await supabase
                .from('steps')
                .select('*')
                .eq('recipe_id', recipe.id)
                .order('step_number', { ascending: true })

            if (stepError) throw stepError

            setIngredients(ingData || [])
            setSteps(stepData || [])
        } catch (error) {
            console.error('Error fetching recipe details:', error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this recipe?')) {
            try {
                const { error } = await supabase
                    .from('recipes')
                    .delete()
                    .eq('id', recipe.id)

                if (error) throw error
                onDelete()
            } catch (error) {
                toast.error('Error deleting recipe: ' + error.message)
            }
        }
    }

    // Admin moderation actions. Each is gated by `isAdmin` in the UI but
    // also re-checked server-side: the admin-override RLS policies in
    // migration 008 only allow these DELETEs when `public.is_admin()`
    // returns true for the caller, and `admin_delete_user` raises if not.
    const handleAdminDeleteRecipe = async () => {
        if (!window.confirm(`Admin: delete "${recipe.title}"? This cannot be undone.`)) return
        try {
            const { error } = await supabase.from('recipes').delete().eq('id', recipe.id)
            if (error) throw error
            toast.success('Recipe deleted')
            onDelete()
        } catch (error) {
            toast.error('Could not delete recipe: ' + error.message)
        }
    }

    const handleResetLikes = async () => {
        if (!window.confirm(`Admin: reset all likes on "${recipe.title}"?`)) return
        try {
            const { error } = await supabase.from('likes').delete().eq('recipe_id', recipe.id)
            if (error) throw error
            await refetchLikes?.()
            toast.success('Likes reset')
        } catch (error) {
            toast.error('Could not reset likes: ' + error.message)
        }
    }

    const handleResetBookmarks = async () => {
        if (!window.confirm(`Admin: reset all bookmarks on "${recipe.title}"?`)) return
        try {
            const { error } = await supabase.from('favorites').delete().eq('recipe_id', recipe.id)
            if (error) throw error
            await refetchFavorites?.()
            toast.success('Bookmarks reset')
        } catch (error) {
            toast.error('Could not reset bookmarks: ' + error.message)
        }
    }

    // In-app PDF download. Library choice: html2pdf.js (wraps html2canvas +
    // jsPDF). Alternative considered: jsPDF alone — would require manually
    // parsing ingredient/step state and building the layout from scratch;
    // more code, no reuse of the print CSS. html2pdf.js captures the DOM
    // directly so the @media print layout work carries over automatically.
    // Dynamic import keeps the ~2.7 MB bundle off the initial load — it's
    // only fetched on first button click. ignoreElements mirrors the
    // .no-print contract so the PDF excludes the same chrome as browser
    // print (action row, servings ±, admin panel, comments). backgroundColor
    // matches --color-paper (#f2e9e4) so the output reads as a cookbook
    // page rather than a white office document. useCORS: true allows
    // Supabase Storage images (public CDN, permissive CORS) to render.
    const handleDownloadPdf = async () => {
        setPdfLoading(true)
        const toastId = toast.loading('Generating PDF…')
        try {
            // Stage 21 — html2pdf renders screen media, so a collapsed
            // ingredient section would vanish from the PDF; expand everything
            // and let React paint before capture. (Browser print instead uses
            // an @media print force-expand rule in index.css.)
            setCollapsedSections(new Set())
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            const { default: html2pdf } = await import('html2pdf.js')
            const element = document.querySelector('.recipe-detail-container')
            await html2pdf()
                .set({
                    filename: `${recipe.title}.pdf`,
                    margin: 10,
                    image: { type: 'jpeg', quality: 0.95 },
                    html2canvas: {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: '#f2e9e4',
                        ignoreElements: el => el.classList.contains('no-print'),
                    },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                })
                .from(element)
                .save()
            toast.dismiss(toastId)
            toast.success('Recipe saved as PDF')
        } catch (error) {
            toast.dismiss(toastId)
            toast.error('Could not generate PDF: ' + error.message)
        } finally {
            setPdfLoading(false)
        }
    }

    // Swipe-right-to-go-back (Stage 9). Thresholds tuned during impl:
    //   - 80px minimum horizontal travel — short enough to feel reachable with
    //     a thumb, long enough to dismiss accidental jitter.
    //   - 40px maximum vertical drift on commit — anything more reads as a
    //     diagonal scroll, not an intentional sideways gesture.
    //   - Tracking is abandoned mid-gesture if dy exceeds dx, so vertical
    //     scrolling is never hijacked. `touchAction: 'pan-y'` reinforces this
    //     by telling the browser horizontal pans are ours.
    //   - Multi-touch (pinch-zoom) is ignored to avoid spurious navigation.
    const handleTouchStart = (e) => {
        if (e.touches.length !== 1) return
        const t = e.touches[0]
        touchRef.current = { startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastY: t.clientY, tracking: true }
    }

    const handleTouchMove = (e) => {
        if (!touchRef.current.tracking || e.touches.length !== 1) return
        const t = e.touches[0]
        touchRef.current.lastX = t.clientX
        touchRef.current.lastY = t.clientY
        const dx = t.clientX - touchRef.current.startX
        const dy = Math.abs(t.clientY - touchRef.current.startY)
        if (dy > 40 && dy > Math.abs(dx)) {
            touchRef.current.tracking = false
            setSwipeX(0)
            return
        }
        if (dx > 10) setSwipeX(Math.min(dx, 200))
    }

    const handleTouchEnd = () => {
        if (!touchRef.current.tracking) {
            setSwipeX(0)
            return
        }
        const dx = touchRef.current.lastX - touchRef.current.startX
        const dy = Math.abs(touchRef.current.lastY - touchRef.current.startY)
        touchRef.current.tracking = false
        if (dx >= 80 && dy < 40) {
            onBack()
        } else {
            setSwipeX(0)
        }
    }

    const handleAdminDeleteAuthor = async () => {
        if (recipe.author_id === userId) {
            toast.error('Admins cannot delete their own account here.')
            return
        }
        if (!window.confirm('Admin: delete this recipe\'s author? All of their recipes, comments, likes, and bookmarks will be removed. This cannot be undone.')) return
        try {
            const { error } = await supabase.rpc('admin_delete_user', { target_id: recipe.author_id })
            if (error) throw error
            toast.success('User deleted')
            onDelete()
        } catch (error) {
            toast.error('Could not delete user: ' + error.message)
        }
    }

    // Live, local reorder — the dragged row follows the pointer; persistence is
    // deferred to handleSaveOrder. Steps carry a visible position (the <ol>
    // marker and the "Step N" timer label), so renumber step_number to match so
    // those stay correct before the save round-trips.
    const moveIngredient = (from, to) => {
        // Stage 21 — viewer drags are contained to the row's own section: the
        // drop target clamps at the group's edges, so a one-ingredient section
        // can't be dissolved by a stray drag. Restructuring across sections is
        // the editor's job. The clamped index is returned so useDragSort keeps
        // tracking the row where it actually landed.
        const target = clampMoveToSection(ingredients, from, to)
        if (target !== from) {
            setIngredients(prev => arrayMove(prev, from, target))
            setIngredientsDirty(true)
        }
        return target
    }
    const moveStep = (from, to) => {
        setSteps(prev => arrayMove(prev, from, to).map((s, i) => ({ ...s, step_number: i + 1 })))
        setStepsDirty(true)
    }

    const ingredientSort = useDragSort({ enabled: isAuthor, onMove: moveIngredient })
    const stepSort = useDragSort({ enabled: isAuthor, onMove: moveStep })

    // Stage 21 — a drag must see every row's real geometry; rows hidden by a
    // collapsed section report zero-rects and would corrupt the drop-target
    // math, so any ingredient drag starts by expanding all sections.
    const ingredientHandleProps = (idx) => {
        const props = ingredientSort.handleProps(idx)
        return {
            ...props,
            onPointerDown: (e) => {
                setCollapsedSections(new Set())
                props.onPointerDown(e)
            },
        }
    }

    const toggleSectionCollapsed = (groupIndex) => {
        setCollapsedSections(prev => {
            const next = new Set(prev)
            if (next.has(groupIndex)) next.delete(groupIndex)
            else next.add(groupIndex)
            return next
        })
    }

    // Persist the current order. Plain INTEGER columns with no UNIQUE constraint
    // (see migration 001) and the "Authors can manage …" RLS policies mean we can
    // overwrite positions row-by-row with no transient-collision risk.
    const handleSaveOrder = async () => {
        setSavingOrder(true)
        try {
            const writes = []
            if (ingredientsDirty) {
                ingredients.forEach((ing, i) => {
                    writes.push(supabase.from('ingredients').update({ order_index: i }).eq('id', ing.id))
                })
            }
            if (stepsDirty) {
                steps.forEach((step, i) => {
                    writes.push(supabase.from('steps').update({ step_number: i + 1 }).eq('id', step.id))
                })
            }
            const results = await Promise.all(writes)
            const failed = results.find(r => r.error)
            if (failed) throw failed.error
            setIngredientsDirty(false)
            setStepsDirty(false)
            toast.success('Order saved')
        } catch (error) {
            toast.error('Could not save order: ' + error.message)
        } finally {
            setSavingOrder(false)
        }
    }

    // Throw away local reordering by re-reading the saved order from the DB.
    const handleDiscardOrder = () => {
        fetchRecipeDetails()
        setIngredientsDirty(false)
        setStepsDirty(false)
    }

    const ingredientsSection = (
        <section>
            <h3>Ingredients</h3>
            {loading ? (
                <ul className="space-y-3" role="status" aria-label="Loading ingredients">
                    {['w-full', 'w-3/5', 'w-4/5', 'w-3/5'].map((w, i) => (
                        <Skeleton key={i} className={`h-4 ${w}`} />
                    ))}
                </ul>
            ) : (
                <ul ref={ingredientSort.listRef} className="ingredient-list list-none pl-0">
                    {/* Stage 21 — groups derive from contiguous runs of the
                        section label. Heading rows carry no data-sort-row, so
                        the drag machinery's rect indexes keep matching the
                        flat ingredients array; a recipe with no sections is
                        one null-section run and renders exactly as before. */}
                    {groupIngredients(ingredients).map((group, groupIndex) => {
                        const collapsed = collapsedSections.has(groupIndex)
                        return (
                            <Fragment key={`${group.startIndex}:${group.section ?? ''}`}>
                                {group.section && (
                                    <li className="mt-4 mb-2">
                                        <button
                                            type="button"
                                            onClick={() => toggleSectionCollapsed(groupIndex)}
                                            aria-expanded={!collapsed}
                                            className="w-full flex items-center gap-2 text-left font-display text-rust text-sm uppercase tracking-widest border-b border-tan/60 pb-1"
                                        >
                                            <svg
                                                viewBox="0 0 24 24"
                                                className={`no-print w-3.5 h-3.5 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                                                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                                            >
                                                <polyline points="6 9 12 15 18 9" />
                                            </svg>
                                            {group.section}
                                            {collapsed && (
                                                <span className="normal-case tracking-normal font-serif italic text-ink/50 text-xs">
                                                    ({group.items.length})
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                )}
                                {group.items.map((ing, offset) => {
                                    const idx = group.startIndex + offset
                                    const checked = checkedIngredients.has(ing.id)
                                    const dragging = ingredientSort.dragIndex === idx
                                    return (
                                        <li
                                            key={ing.id}
                                            data-sort-row
                                            className={`${dragging ? 'opacity-60' : ''} ${collapsed ? 'section-collapsed' : ''}`}
                                        >
                                            <div className="flex items-start gap-2">
                                                {isAuthor && (
                                                    <button
                                                        type="button"
                                                        {...ingredientHandleProps(idx)}
                                                        aria-label={`Drag to reorder ${ing.name}`}
                                                        title="Drag to reorder"
                                                        className="no-print mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-ink/35 hover:text-ink/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-rust rounded"
                                                    >
                                                        <DragHandleIcon />
                                                    </button>
                                                )}
                                                <label className="flex-1 flex items-start gap-3 cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleChecked(setCheckedIngredients, ing.id)}
                                                        className="accent-rust w-5 h-5 mt-0.5 shrink-0 cursor-pointer"
                                                    />
                                                    <span className={checked ? 'line-through text-ink/50' : ''}>
                                                        {scaleQuantity(ing.quantity, multiplier) || ""} {ing.unit} {ing.name}
                                                        {ing.notes && (
                                                            <span className="block italic text-ink/60 text-sm mt-0.5 font-serif">
                                                                {ing.notes}
                                                            </span>
                                                        )}
                                                    </span>
                                                </label>
                                            </div>
                                        </li>
                                    )
                                })}
                            </Fragment>
                        )
                    })}
                </ul>
            )}
            {!loading && ingredients.length > 0 && (
                <div className="no-print mt-4 flex flex-wrap gap-2">
                    <ExportIngredientsButton
                        recipeTitle={recipe.title}
                        ingredients={ingredients}
                        checkedIngredients={checkedIngredients}
                        multiplier={multiplier}
                    />
                    {addToShoppingList && (
                        <SendToShoppingListButton
                            recipeId={recipe.id}
                            recipeTitle={recipe.title}
                            ingredients={ingredients}
                            checkedIngredients={checkedIngredients}
                            multiplier={multiplier}
                            onAdd={addToShoppingList}
                        />
                    )}
                </div>
            )}
        </section>
    )

    const stepsSection = (
        <section>
            <h3>Steps</h3>
            {loading ? (
                <ol className="space-y-3" role="status" aria-label="Loading steps">
                    {['w-full', 'w-4/5', 'w-full', 'w-3/5', 'w-4/5'].map((w, i) => (
                        <Skeleton key={i} className={`h-4 ${w}`} />
                    ))}
                </ol>
            ) : (
                <ol ref={stepSort.listRef} className="step-list">
                    {steps.map((step, idx) => {
                        const checked = checkedSteps.has(step.id)
                        const photoUrl = stepPhotoUrl(step.photo_path)
                        const dragging = stepSort.dragIndex === idx
                        return (
                            <li key={step.id} data-sort-row className={dragging ? 'opacity-60' : ''}>
                                <div className="flex items-start gap-2">
                                    {isAuthor && (
                                        <button
                                            type="button"
                                            {...stepSort.handleProps(idx)}
                                            aria-label={`Drag to reorder step ${step.step_number}`}
                                            title="Drag to reorder"
                                            className="no-print mt-1 shrink-0 cursor-grab active:cursor-grabbing text-ink/35 hover:text-ink/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-rust rounded"
                                        >
                                            <DragHandleIcon />
                                        </button>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <label className="flex items-start gap-3 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleChecked(setCheckedSteps, step.id)}
                                                className="accent-rust w-5 h-5 mt-1 shrink-0 cursor-pointer"
                                            />
                                            <span className={checked ? 'line-through text-ink/50' : ''}>
                                                {step.instruction}
                                            </span>
                                        </label>
                                        {photoUrl && (
                                            <button
                                                type="button"
                                                onClick={() => setLightboxUrl(photoUrl)}
                                                aria-label={`Expand step photo`}
                                                className="no-print mt-2 ml-8 block rounded-md overflow-hidden border border-paper-shade hover:border-rust transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rust"
                                            >
                                                <img
                                                    src={photoUrl}
                                                    alt=""
                                                    loading="lazy"
                                                    className="w-32 h-32 object-cover block"
                                                />
                                            </button>
                                        )}
                                        {/* Stage 19 Phase 2 — one-tap preset timer for a
                                            step with an authored duration; usable while
                                            reading the recipe without entering cooking mode. */}
                                        {step.duration_seconds && onStartTimer && (
                                            <button
                                                type="button"
                                                onClick={() => onStartTimer({ durationMs: step.duration_seconds * 1000, label: `Step ${step.step_number}` })}
                                                className="no-print mt-2 ml-8 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-paper-shade text-ink hover:bg-tan/40 transition-colors text-sm font-medium"
                                            >
                                                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <circle cx="12" cy="13" r="8" />
                                                    <path d="M12 9v4l2 2" />
                                                    <path d="M9 2h6" />
                                                </svg>
                                                Start {formatMs(step.duration_seconds * 1000)} timer
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </li>
                        )
                    })}
                </ol>
            )}
        </section>
    )

    return (
        <div
            className="paper-grain min-h-screen"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            style={{
                transform: swipeX > 0 ? `translateX(${swipeX}px)` : undefined,
                transition: swipeX > 0 ? 'none' : 'transform 200ms ease-out',
                touchAction: 'pan-y',
            }}
        >
            <div className="recipe-detail-container">
                <div className="flex justify-between items-center mb-4 no-print">
                    <button onClick={onBack} className="px-4 py-2.5 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors">← Back to List</button>
                    <div className="flex items-center gap-3">
                        {onToggleLike && (
                            <LikeButton liked={liked} count={likeCount} onClick={onToggleLike} size="lg" />
                        )}
                        {onAddToPlan && (
                            <AddToPlanButton onClick={onAddToPlan} size="lg"/>
                        )}
                        {onToggleFavorite && (
                            <BookmarkButton favorited={favorited} onClick={onToggleFavorite} size="lg" />
                        )}
                        
                    </div>
                </div>

                <div className="recipe-detail-header">
                    {recipe.image_url && (
                        <img src={recipe.image_url} alt={`${recipe.title} cover image`} loading="lazy" className="detail-image" />
                    )}
                    {recipe.is_public === false && (
                        <div className="flex justify-center mb-2">
                            <span
                                aria-label="Private recipe"
                                className="inline-flex items-center gap-1 bg-ink/70 text-paper text-xs font-medium rounded-full px-2.5 py-1"
                            >
                                <svg aria-hidden="true" viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                                    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                                    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                                    <path d="m2 2 20 20" />
                                </svg>
                                Private
                            </span>
                        </div>
                    )}
                    <h1>{recipe.title}</h1>
                    {recipe.author_id && (
                        <p className="font-display italic text-ink/70 text-sm mt-1 mb-2">
                            by{' '}
                            <Link
                                to={`/profile/${recipe.author_id}`}
                                className="text-rust hover:text-rust-dark underline underline-offset-2 transition-colors"
                            >
                                {authorDisplayName(recipe.author)}
                            </Link>
                        </p>
                    )}
                    <p className="description">{recipe.description}</p>
                    {recipe.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 justify-center mt-4 mb-2">
                            {recipe.tags.map(tag => (
                                <span key={tag} className="px-2.5 py-1 bg-tan-soft text-ink text-xs font-medium rounded-full">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                    
                    <div className="flex justify-between">
                        <div className="recipe-meta flex items-center gap-2 flex-wrap">
                            <span>Servings:</span>
                            <button
                                onClick={() => setTargetServings(s => Math.max(1, s - 1))}
                                disabled={targetServings <= 1}
                                className="no-print w-8 h-8 rounded-full bg-paper-shade hover:bg-tan/40 text-ink font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                                aria-label="Decrease servings"
                            >−</button>
                            <span className="w-6 text-center font-semibold">{targetServings}</span>
                            <button
                                onClick={() => setTargetServings(s => Math.min(99, s + 1))}
                                disabled={targetServings >= 99}
                                className="no-print w-8 h-8 rounded-full bg-paper-shade hover:bg-tan/40 text-ink font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                                aria-label="Increase servings"
                            >+</button>
                            {targetServings !== baseServings && (
                                <button
                                    onClick={() => setTargetServings(baseServings)}
                                    className="no-print text-xs text-rose hover:underline underline-offset-2 ml-1 transition-colors"
                                >
                                    reset
                                </button>
                            )}
                        </div>
                        
                        <div className="flex items-center gap-3">
                            {recipe.is_public !== false && (
                                <ShareButton url={`${window.location.origin}/recipe/${recipe.id}`} />
                            )}
                            {isRecipeInCookbook && (
                                <AddToCookbookButton
                                    recipeId={recipe.id}
                                    session={session}
                                    cookbooks={cookbooks}
                                    isRecipeInCookbook={isRecipeInCookbook}
                                    addRecipeToCookbook={addRecipeToCookbook}
                                    removeRecipeFromCookbook={removeRecipeFromCookbook}
                                    createCookbook={createCookbook}
                                    onRequireAuth={onRequireAuth}
                                />
                            )}
                            <button
                                onClick={() => setLayout(l => l === 'spread' ? 'sheet' : 'spread')}
                                aria-label={layout === 'spread' ? 'Switch to single-sheet layout' : 'Switch to book-spread layout'}
                                aria-pressed={layout === 'spread'}
                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-medium rounded-md transition-colors"
                            >
                                {layout === 'spread' ? (
                                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <rect x="4" y="4" width="16" height="16" rx="1" />
                                        <line x1="4" y1="9" x2="20" y2="9" />
                                        <line x1="4" y1="15" x2="20" y2="15" />
                                    </svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M2 4h8a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H2z" />
                                        <path d="M22 4h-8a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h8z" />
                                    </svg>
                                )}
                                <span className="hidden sm:inline">{layout === 'spread' ? 'Sheet' : 'Book'}</span>
                            </button>
                            <button
                                onClick={handleDownloadPdf}
                                disabled={pdfLoading}
                                aria-label="Download recipe as PDF"
                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                <span className="hidden sm:inline">{pdfLoading ? 'Generating…' : 'PDF'}</span>
                            </button>
                            {/* Stage 16 item 1 — Report. Hidden on the author's own
                                recipe (no value in self-reporting) and on anonymous
                                viewers (the trigger routes through onRequireAuth so
                                anon CAN click, but the affordance is signed-in-only
                                to keep the action row uncluttered). Admins still see
                                it on others' recipes — they may want to flag a
                                report from a non-admin perspective for audit. */}
                            {!isAuthor && userId && submitReport && (
                                <ReportButton
                                    variant="icon"
                                    targetType="recipe"
                                    targetId={recipe.id}
                                    targetLabel={recipe.title}
                                    userId={userId}
                                    onRequireAuth={onRequireAuth}
                                    submitReport={submitReport}
                                />
                            )}
                        </div>
                    </div>
                </div>
                
                {isAuthor && (
                    <div className="author-actions no-print">
                        <button onClick={() => onEdit(recipe)} className="px-5 py-2.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors">Edit Recipe</button>
                        <button onClick={handleDelete} className="px-4 py-2.5 bg-rose-dark hover:bg-rose text-paper font-semibold rounded-md transition-colors">Delete Recipe</button>
                    </div>
                )}

                {isAdmin && (
                    <div className="mt-4 p-4 bg-paper-shade/60 border border-dashed border-rose-dark/40 rounded-md no-print">
                        <div className="flex items-center gap-2 mb-3">
                            <span aria-hidden="true" className="text-rose-dark">⚑</span>
                            <h3 className="font-display text-sm font-semibold text-ink m-0 uppercase tracking-wide">Admin moderation</h3>
                        </div>
                        {/* Stage 16 item 2 — gate admin tools on MFA. Three states:
                            (a) no factor enrolled → push to Security tab
                            (b) factor enrolled but session AAL1 → inline challenge
                            (c) AAL2 → render the buttons */}
                        {!mfa?.hasVerifiedFactor ? (
                            <p className="font-serif italic text-ink/80 text-sm m-0">
                                Enable two-factor authentication in your <Link to="/profile" className="underline hover:text-ink">profile Security tab</Link> to access admin tools.
                            </p>
                        ) : !mfa.isAal2 ? (
                            <MfaChallengeGate
                                factors={mfa.factors}
                                verifyCode={mfa.verifyCode}
                                hint="Verify with your authenticator app to unlock admin actions for this session."
                            />
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {!isAuthor && (
                                    <button
                                        onClick={handleAdminDeleteRecipe}
                                        className="px-3 py-2 bg-rose-dark hover:bg-rose text-paper text-sm font-semibold rounded-md transition-colors"
                                    >
                                        Delete recipe
                                    </button>
                                )}
                                <button
                                    onClick={handleResetLikes}
                                    className="px-3 py-2 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-semibold rounded-md border border-paper-shade transition-colors"
                                >
                                    Reset likes
                                </button>
                                <button
                                    onClick={handleResetBookmarks}
                                    className="px-3 py-2 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-semibold rounded-md border border-paper-shade transition-colors"
                                >
                                    Reset bookmarks
                                </button>
                                {!isAuthor && (
                                    <button
                                        onClick={handleAdminDeleteAuthor}
                                        className="px-3 py-2 bg-rose-dark hover:bg-rose text-paper text-sm font-semibold rounded-md transition-colors"
                                    >
                                        Delete author
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Stage 15 — Start cooking. Full-width prominent CTA above
                    the recipe content so it's reachable before the user has
                    to scroll past the meta row. Hidden during the initial
                    fetch and on recipes with no steps. */}
                {!loading && steps.length > 0 && (
                    <div className="no-print w-full mt-4 flex gap-2">
                        <button
                            onClick={handleStartCooking}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors"
                        >
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polygon points="6 4 20 12 6 20 6 4" />
                            </svg>
                            Start cooking
                        </button>
                        {/* Stage 19 — a timer is useful while reading the recipe
                            on this page too, not only inside cooking mode. */}
                        <button
                            onClick={onOpenTimerSheet}
                            aria-label="Set a timer"
                            className="inline-flex items-center justify-center gap-2 px-4 py-3.5 bg-paper-shade hover:bg-tan/40 text-ink font-semibold rounded-md transition-colors shrink-0"
                        >
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="12" cy="13" r="8" />
                                <path d="M12 9v4l2 2" />
                                <path d="M9 2h6" />
                            </svg>
                            <span className="hidden sm:inline">Timer</span>
                        </button>
                    </div>
                )}

                {/* ui-addons — author-only reorder save bar. Surfaces once a drag
                    has changed the local order; the moves don't touch the DB
                    until "Save order" is tapped. */}
                {isAuthor && (ingredientsDirty || stepsDirty) && (
                    <div className="no-print mt-4 flex flex-wrap items-center gap-3 rounded-md border border-tan bg-tan-soft/70 px-4 py-3">
                        <span className="flex-1 min-w-[12rem] text-sm font-medium text-ink/80">
                            You've changed the order of this recipe.
                        </span>
                        <button
                            onClick={handleDiscardOrder}
                            disabled={savingOrder}
                            className="px-3 py-2 text-sm font-medium text-ink rounded-md hover:bg-paper-shade transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Discard
                        </button>
                        <button
                            onClick={handleSaveOrder}
                            disabled={savingOrder}
                            className="px-4 py-2 text-sm font-semibold bg-rust hover:bg-rust-dark text-paper rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {savingOrder ? 'Saving…' : 'Save order'}
                        </button>
                    </div>
                )}

                {layout === 'spread' ? (
                    <div className="book-spread recipe-content-spread mt-4">
                        <section className="book-page book-page-left" aria-label="Ingredients">
                            {ingredientsSection}
                        </section>
                        <div className="book-spine" aria-hidden="true" />
                        <section className="book-page book-page-right" aria-label="Steps">
                            {stepsSection}
                        </section>
                    </div>
                ) : (
                    <div className="recipe-content">
                        {ingredientsSection}
                        <hr />
                        {stepsSection}
                    </div>
                )}

                <RecipeRail title={authorRailTitle} recipes={authorRecipes} />
                <RecipeRail title="Similar recipes" recipes={similarRecipes} />

                <div className="no-print mt-6">
                    <Comments
                        recipeId={recipe.id}
                        userId={userId}
                        isAdmin={isAdmin}
                        onRequireAuth={onRequireAuth}
                        submitReport={submitReport}
                    />
                </div>
            </div>
            {cooking && (
                <Suspense fallback={null}>
                <CookingMode
                    recipe={recipe}
                    steps={steps}
                    ingredients={ingredients}
                    multiplier={multiplier}
                    checkedIngredients={checkedIngredients}
                    setCheckedIngredients={setCheckedIngredients}
                    checkedSteps={checkedSteps}
                    setCheckedSteps={setCheckedSteps}
                    onExit={handleExitCooking}
                    onOpenTimerSheet={onOpenTimerSheet}
                    onStartTimer={onStartTimer}
                />
                </Suspense>
            )}
            <Lightbox url={lightboxUrl} ariaLabel="Step photo" onClose={() => setLightboxUrl(null)} />
        </div>
    )
}

// Fallback chain for the author byline: username → full_name → a generic
// label. Username is the chosen handle; full_name is the legal/display name
// the user typed during profile edit; if both are empty (new accounts that
// never visited Profile.jsx) the label keeps the byline non-empty rather
// than leaking the raw UUID.
function authorDisplayName(author) {
    if (!author) return 'Anonymous chef'
    return author.username?.trim() || author.full_name?.trim() || 'Anonymous chef'
}


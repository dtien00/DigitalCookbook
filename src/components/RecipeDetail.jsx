import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'
import BookmarkButton from './BookmarkButton'
import LikeButton from './LikeButton'
import ShareButton from './ShareButton'
import Comments from './Comments'
import Skeleton from './Skeleton'

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
    refetchLikes,
    refetchFavorites,
    onRequireAuth,
}) {
    const [ingredients, setIngredients] = useState([])
    const [steps, setSteps] = useState([])
    const [loading, setLoading] = useState(true)
    const [targetServings, setTargetServings] = useState(recipe.servings || 1)
    const [checkedIngredients, setCheckedIngredients] = useState(() => new Set())
    const [checkedSteps, setCheckedSteps] = useState(() => new Set())
    const [pdfLoading, setPdfLoading] = useState(false)

    const isAuthor = userId === recipe.author_id
    const baseServings = recipe.servings || 1
    const multiplier = targetServings / baseServings

    useEffect(() => {
        fetchRecipeDetails()
        setCheckedIngredients(new Set())
        setCheckedSteps(new Set())
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

    return (
        <div className="paper-grain min-h-screen">
            <div className="recipe-detail-container">
                <div className="flex justify-between items-center mb-4 no-print">
                    <button onClick={onBack} className="px-4 py-2.5 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors">← Back to List</button>
                    <div className="flex items-center gap-3">
                        {onToggleLike && (
                            <LikeButton liked={liked} count={likeCount} onClick={onToggleLike} size="lg" />
                        )}
                        {onToggleFavorite && (
                            <BookmarkButton favorited={favorited} onClick={onToggleFavorite} size="lg" />
                        )}
                        {recipe.is_public !== false && (
                            <ShareButton url={`${window.location.origin}/recipe/${recipe.id}`} />
                        )}
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
                                <svg aria-hidden="true" viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                                    <path d="M5 6V4.5a3 3 0 0 1 6 0V6h.5A1.5 1.5 0 0 1 13 7.5v5A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-5A1.5 1.5 0 0 1 4.5 6H5Zm1.5 0h3V4.5a1.5 1.5 0 0 0-3 0V6Z" />
                                </svg>
                                Private
                            </span>
                        </div>
                    )}
                    <h1>{recipe.title}</h1>
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
                    </div>
                )}

                <div className="recipe-content">
                    <section>
                        <h3>Ingredients</h3>
                        {loading ? (
                            <ul className="space-y-3" role="status" aria-label="Loading ingredients">
                                {['w-full', 'w-3/5', 'w-4/5', 'w-3/5'].map((w, i) => (
                                    <Skeleton key={i} className={`h-4 ${w}`} />
                                ))}
                            </ul>
                        ) : (
                            <ul className="ingredient-list list-none pl-0">
                                {ingredients.map(ing => {
                                    const checked = checkedIngredients.has(ing.id)
                                    return (
                                        <li key={ing.id}>
                                            <label className="flex items-start gap-3 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleChecked(setCheckedIngredients, ing.id)}
                                                    className="accent-rust w-5 h-5 mt-0.5 shrink-0 cursor-pointer"
                                                />
                                                <span className={checked ? 'line-through text-ink/50' : ''}>
                                                    {scaleQuantity(ing.quantity, multiplier)} {ing.unit} {ing.name}
                                                    {ing.notes && (
                                                        <span className="block italic text-ink/60 text-sm mt-0.5 font-serif">
                                                            {ing.notes}
                                                        </span>
                                                    )}
                                                </span>
                                            </label>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </section>

                    <hr />

                    <section>
                        <h3>Steps</h3>
                        {loading ? (
                            <ol className="space-y-3" role="status" aria-label="Loading steps">
                                {['w-full', 'w-4/5', 'w-full', 'w-3/5', 'w-4/5'].map((w, i) => (
                                    <Skeleton key={i} className={`h-4 ${w}`} />
                                ))}
                            </ol>
                        ) : (
                            <ol className="step-list">
                                {steps.map(step => {
                                    const checked = checkedSteps.has(step.id)
                                    return (
                                        <li key={step.id}>
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
                                        </li>
                                    )
                                })}
                            </ol>
                        )}
                    </section>

                    <div className="no-print">
                        <Comments
                            recipeId={recipe.id}
                            userId={userId}
                            isAdmin={isAdmin}
                            onRequireAuth={onRequireAuth}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

// Scale a numeric ingredient quantity by the current multiplier and render
// common fractions (½ ¼ ¾ ⅓ ⅔) so "0.5 cups" reads as "½ cups" after scaling.
// Quantities are stored as NUMERIC in Postgres so quantity is always a number or null.
function scaleQuantity(quantity, multiplier) {
    if (!quantity) return quantity
    const raw = parseFloat((quantity * multiplier).toFixed(2))
    const whole = Math.floor(raw)
    const decimal = parseFloat((raw - whole).toFixed(2))
    if (decimal === 0) return String(whole)
    const FRACS = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.67: '⅔' }
    const frac = FRACS[decimal]
    if (frac) return whole === 0 ? frac : `${whole} ${frac}`
    return String(raw)
}

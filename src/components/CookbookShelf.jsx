import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'

// Stage 14 item 1 — Cookbook shelf, rendered inside a Profile tab.
// Vertical list of the signed-in user's cookbooks. Each row is a
// mini-shelf entry — a small book swatch on the left, title +
// recipe count on the right, optional private chip.
//
// Click row → /cookbook/:id (route added in a follow-up task). For
// now the route may 404 → home; the click still feels right.
//
// "+ New cookbook" button at the top expands an inline form
// (title, description, public toggle). createCookbook is awaited so
// the new row appears before the form collapses.
//
// Delete is hidden behind a small ⋯ menu per row → "Delete" with
// a confirm — collections are easy to lose track of, and accidental
// deletion of a curated cookbook is more painful than a single
// recipe.
export default function CookbookShelf({
    cookbooks,
    createCookbook,
    deleteCookbook,
    loading,
}) {
    const navigate = useNavigate()
    const [creating, setCreating] = useState(false)
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [isPublic, setIsPublic] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const resetForm = () => {
        setTitle('')
        setDescription('')
        setIsPublic(false)
        setCreating(false)
    }

    const handleCreate = async (e) => {
        e.preventDefault()
        const trimmed = title.trim()
        if (!trimmed) {
            toast.error('Title is required')
            return
        }
        setSubmitting(true)
        try {
            await createCookbook({
                title: trimmed,
                description: description.trim() || null,
                is_public: isPublic,
            })
            toast.success('Cookbook created')
            resetForm()
        } catch (e) {
            toast.error('Could not create cookbook: ' + (e.message || 'unknown error'))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-xl text-ink">Cookbooks ({cookbooks.length})</h3>
                {!creating && (
                    <button
                        type="button"
                        onClick={() => setCreating(true)}
                        className="px-3 py-1.5 bg-rust hover:bg-rust-dark text-paper text-sm font-semibold rounded-md transition-colors"
                    >
                        + New
                    </button>
                )}
            </div>

            {creating && (
                <form
                    onSubmit={handleCreate}
                    className="mb-4 p-4 rounded-md border border-paper-shade bg-paper/60"
                >
                    <div className="form-group">
                        <label>Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Weeknight dinners"
                            autoFocus
                            maxLength={80}
                        />
                    </div>
                    <div className="form-group">
                        <label>Description (optional)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What ties these recipes together?"
                            rows={2}
                            maxLength={240}
                        />
                    </div>
                    <label className="flex items-center gap-2 mb-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isPublic}
                            onChange={(e) => setIsPublic(e.target.checked)}
                            className="accent-rust"
                        />
                        <span className="font-serif text-sm text-ink">
                            Public — anyone can browse this cookbook
                        </span>
                    </label>
                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={submitting || !title.trim()}
                            className="px-4 py-2 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? 'Creating…' : 'Create'}
                        </button>
                        <button
                            type="button"
                            onClick={resetForm}
                            disabled={submitting}
                            className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <p className="font-display italic text-rose text-center py-6" role="status">
                    Loading cookbooks…
                </p>
            ) : cookbooks.length === 0 && !creating ? (
                <div className="text-center py-12">
                    <p className="text-2xl text-tan mb-3">✦</p>
                    <p className="font-display text-lg text-ink mb-1">No cookbooks yet.</p>
                    <p className="font-serif italic text-rose mb-4">
                        Start your first collection — group recipes by theme, season, or whim.
                    </p>
                    <button
                        type="button"
                        onClick={() => setCreating(true)}
                        className="px-4 py-2 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors"
                    >
                        + New cookbook
                    </button>
                </div>
            ) : (
                <ul className="flex flex-col gap-2">
                    {cookbooks.map(cookbook => (
                        <CookbookShelfRow
                            key={cookbook.id}
                            cookbook={cookbook}
                            onOpen={() => navigate(`/cookbook/${cookbook.id}`)}
                            onDelete={async () => {
                                if (!window.confirm(`Delete "${cookbook.title}"? Recipes stay in your library.`)) return
                                try {
                                    await deleteCookbook(cookbook.id)
                                    toast.success('Cookbook deleted')
                                } catch (e) {
                                    toast.error('Could not delete: ' + (e.message || 'unknown error'))
                                }
                            }}
                        />
                    ))}
                </ul>
            )}
        </div>
    )
}

function CookbookShelfRow({ cookbook, onOpen, onDelete }) {
    const recipeCount = cookbook.recipeIds.size
    const hasCover = !!cookbook.cover_image_url

    return (
        <li>
            <div className="relative flex items-center gap-3 p-3 rounded-md border border-paper-shade bg-paper/40 hover:bg-paper-shade/40 transition-colors">
                <button
                    type="button"
                    onClick={onOpen}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    aria-label={`Open cookbook ${cookbook.title}`}
                >
                    {/* Mini-book thumbnail: leather spine + cover. Cover
                        shows the uploaded image when present; otherwise a
                        warm tan-soft surface with the first letter of the
                        title as a serif glyph — same fallback pattern as
                        the avatar chip elsewhere. */}
                    <span
                        aria-hidden="true"
                        className="relative flex-shrink-0 w-12 h-16 rounded-sm overflow-hidden shadow-sm"
                        style={{
                            background: hasCover ? undefined : 'linear-gradient(135deg, #d2bba0 0%, #b89a78 100%)',
                        }}
                    >
                        {hasCover && (
                            <img
                                src={cookbook.cover_image_url}
                                alt=""
                                className="absolute inset-0 w-full h-full object-cover"
                                loading="lazy"
                            />
                        )}
                        {!hasCover && (
                            <span className="absolute inset-0 flex items-center justify-center font-display text-xl text-ink/70">
                                {cookbook.title.charAt(0).toUpperCase()}
                            </span>
                        )}
                        <span
                            className="absolute left-0 top-0 bottom-0 w-1.5"
                            style={{ background: 'linear-gradient(90deg, #4a2c1a 0%, #6b3f25 100%)' }}
                        />
                    </span>
                    <span className="flex-1 min-w-0">
                        <span className="block font-display text-base text-ink truncate">
                            {cookbook.title}
                        </span>
                        <span className="block font-serif italic text-ink/60 text-sm">
                            {recipeCount} {recipeCount === 1 ? 'recipe' : 'recipes'}
                            {!cookbook.is_public && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-ink/10 not-italic">Private</span>}
                        </span>
                    </span>
                </button>
                <button
                    type="button"
                    onClick={onDelete}
                    aria-label={`Delete cookbook ${cookbook.title}`}
                    className="flex-shrink-0 w-9 h-9 rounded-md text-rose-dark/50 hover:text-rose-dark hover:bg-rose/10 flex items-center justify-center transition-colors"
                >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                    </svg>
                </button>
            </div>
        </li>
    )
}

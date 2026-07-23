import { useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'

// Stage 14 item 1 — "Add to cookbook…" affordance on RecipeDetail.
// Dropdown with a checkbox row per owned cookbook + an inline
// "+ New cookbook" creator. Independent from the bookmark button by
// design (bookmark = "remember this", cookbook = "organize this");
// confirmed at design call.
//
// Membership toggles are optimistic via the parent useCookbooks
// hook — clicking a row flips immediately and rolls back on error.
//
// Anonymous click goes through onRequireAuth (same pattern as the
// like/bookmark buttons), since RLS blocks the underlying writes
// and the dropdown would render an empty list with no usable affordance.
export default function AddToCookbookButton({
    recipeId,
    session,
    cookbooks,
    isRecipeInCookbook,
    addRecipeToCookbook,
    removeRecipeFromCookbook,
    createCookbook,
    onRequireAuth,
}) {
    const [open, setOpen] = useState(false)
    const [creating, setCreating] = useState(false)
    const [newTitle, setNewTitle] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const containerRef = useRef(null)
    const triggerRef = useRef(null)

    // Close on outside click or Escape.
    useEffect(() => {
        if (!open) return
        const onPointerDown = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false)
                setCreating(false)
            }
        }
        const onKey = (e) => {
            if (e.key === 'Escape') {
                setOpen(false)
                setCreating(false)
                triggerRef.current?.focus()
            }
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('pointerdown', onPointerDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    const handleTriggerClick = () => {
        if (!session) {
            onRequireAuth?.()
            return
        }
        setOpen(o => !o)
    }

    const handleToggleMembership = (cookbook) => {
        const inIt = isRecipeInCookbook(cookbook.id, recipeId)
        if (inIt) removeRecipeFromCookbook(cookbook.id, recipeId)
        else addRecipeToCookbook(cookbook.id, recipeId)
    }

    const handleCreateAndAdd = async (e) => {
        e.preventDefault()
        const trimmed = newTitle.trim()
        if (!trimmed) return
        setSubmitting(true)
        try {
            const created = await createCookbook({ title: trimmed })
            if (created) {
                await addRecipeToCookbook(created.id, recipeId)
                toast.success(`Added to "${created.title}"`)
            }
            setNewTitle('')
            setCreating(false)
        } catch (e) {
            toast.error('Could not create cookbook: ' + (e.message || 'unknown error'))
        } finally {
            setSubmitting(false)
        }
    }

    // How many cookbooks already contain this recipe — drives a small
    // count badge on the trigger so the user can tell at a glance that
    // they've curated this one without opening the menu.
    const memberCount = cookbooks.filter(c => c.recipeIds.has(recipeId)).length

    return (
        <div ref={containerRef} className="relative no-print">
            <button
                ref={triggerRef}
                type="button"
                onClick={handleTriggerClick}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={memberCount > 0
                    ? `Add to cookbook (in ${memberCount} of yours)`
                    : 'Add to cookbook'
                }
                className="relative inline-flex items-center gap-1.5 px-3 py-2 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-medium rounded-md transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-book-plus-icon lucide-book-plus">
                    <path d="M12 7v6"/>
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>
                    <path d="M9 10h6"/>
                </svg>
                <span className="hidden sm:inline">Cookbook</span>
                {memberCount > 0 && (
                    <span
                        aria-hidden="true"
                        className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rust text-paper text-[10px] font-semibold flex items-center justify-center"
                    >
                        {memberCount}
                    </span>
                )}
            </button>

            {open && session && (
                <div
                    role="menu"
                    onPointerDown={e => e.stopPropagation()}
                    className="absolute right-0 mt-2 w-72 max-h-[60vh] overflow-y-auto bg-paper border border-paper-shade rounded-md shadow-lg z-40"
                >
                    {cookbooks.length === 0 && !creating && (
                        <div className="p-4 text-center">
                            <p className="text-2xl text-tan mb-1">✦</p>
                            <p className="font-display text-sm text-ink mb-1">No cookbooks yet.</p>
                            <p className="font-serif italic text-xs text-rose mb-3">
                                Create one to organize this recipe.
                            </p>
                            <button
                                type="button"
                                onClick={() => setCreating(true)}
                                className="px-3 py-1.5 bg-rust hover:bg-rust-dark text-paper text-sm font-semibold rounded-md transition-colors"
                            >
                                + New cookbook
                            </button>
                        </div>
                    )}

                    {cookbooks.length > 0 && (
                        <ul className="py-1">
                            {cookbooks.map(cookbook => {
                                const inIt = isRecipeInCookbook(cookbook.id, recipeId)
                                return (
                                    <li key={cookbook.id}>
                                        <button
                                            type="button"
                                            role="menuitemcheckbox"
                                            aria-checked={inIt}
                                            onClick={() => handleToggleMembership(cookbook)}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-ink hover:bg-paper-shade transition-colors"
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                                                    inIt ? 'bg-rust border-rust' : 'border-ink/30 bg-paper'
                                                }`}
                                            >
                                                {inIt && (
                                                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 stroke-paper fill-none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="5 12 10 17 19 7" />
                                                    </svg>
                                                )}
                                            </span>
                                            <span className="flex-1 min-w-0">
                                                <span className="block font-medium text-sm truncate">{cookbook.title}</span>
                                                <span className="block font-serif italic text-xs text-ink/60">
                                                    {cookbook.recipeIds.size} {cookbook.recipeIds.size === 1 ? 'recipe' : 'recipes'}
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}

                    {!creating && cookbooks.length > 0 && (
                        <div className="border-t border-paper-shade">
                            <button
                                type="button"
                                onClick={() => setCreating(true)}
                                className="w-full text-left px-3 py-2.5 text-rust hover:bg-paper-shade text-sm font-semibold transition-colors"
                            >
                                + New cookbook
                            </button>
                        </div>
                    )}

                    {creating && (
                        <form
                            onSubmit={handleCreateAndAdd}
                            className="p-3 border-t border-paper-shade"
                        >
                            <label className="block font-serif italic text-xs text-ink/60 mb-1">
                                New cookbook
                            </label>
                            <input
                                type="text"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="e.g. Korean staples"
                                autoFocus
                                maxLength={80}
                                className="w-full px-3 py-2 border border-paper-shade rounded-md text-sm bg-white/70 text-ink focus:outline-none focus:ring-2 focus:ring-rust/40 focus:border-rust"
                            />
                            <div className="flex gap-2 mt-2">
                                <button
                                    type="submit"
                                    disabled={submitting || !newTitle.trim()}
                                    className="flex-1 px-3 py-1.5 bg-rust hover:bg-rust-dark text-paper text-sm font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {submitting ? 'Creating…' : 'Create + add'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setCreating(false); setNewTitle('') }}
                                    disabled={submitting}
                                    className="px-3 py-1.5 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-medium rounded-md transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            )}
        </div>
    )
}

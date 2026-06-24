import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'
import { useMealPlan } from '../hooks/useMealPlan'
import { toISODate, startOfWeek, addDays } from '../lib/week'

// Stage M+1 item 1 — the weekly meal-plan grid at /plan.
//
// Seven day columns (Mon–Sun) x three meal rows (Breakfast / Lunch /
// Dinner). Each cell holds at most one recipe; tapping an empty cell opens
// a picker of the user's bookmarked recipes, and a filled cell shows the
// title with a remove (x). Week navigation walks back/forward 7 days at a
// time; "This week" jumps home.
//
// This is the read-only-grid-first slice: the schema (migration 021), the
// fetch/add/remove hook, the route, and the layout. Drag-from-card and the
// "Build shopping list from plan" integration (item 2) layer on next.
//
// 'misc' is a valid slot in the schema but isn't surfaced as a row yet —
// reserved for a future "anything else this day" lane.
const SLOTS = [
    { key: 'breakfast', label: 'Breakfast' },
    { key: 'lunch', label: 'Lunch' },
    { key: 'dinner', label: 'Dinner' },
]
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Word-boundary tokens, lowercased. Mirrors the home-grid fridge matcher so
// "build from plan" subtracts fridge items the same way the basket filter
// reads them ("egg" won't match "eggplant"; "olive oil" matches
// "extra-virgin olive oil").
function tokenizeName(s) {
    return (s || '').toLowerCase().split(/\W+/).filter(Boolean)
}

// True if some Fridge Basket entry fully matches this ingredient name — every
// token of a basket entry appears in the ingredient's name tokens.
function inFridgeBasket(name, basket) {
    if (!basket || basket.length === 0) return false
    const nameTokens = new Set(tokenizeName(name))
    return basket.some(b => {
        const bt = tokenizeName(b)
        return bt.length > 0 && bt.every(t => nameTokens.has(t))
    })
}

export default function MealPlan({ session, onBack, onRecipeClick, addToShoppingList, basket = [], onViewShoppingList }) {
    const userId = session?.user.id
    const todayISO = toISODate(new Date())

    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))

    // The seven dates of the visible week, plus the ISO bounds the hook
    // queries between. Memoised so the hook's deps don't churn each render.
    const days = useMemo(
        () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
        [weekStart]
    )
    const weekStartISO = toISODate(days[0])
    const weekEndISO = toISODate(days[6])

    const { entries, getEntry, addEntry, removeEntry, loading } = useMealPlan(userId, weekStartISO, weekEndISO)

    // Bookmarked recipes feed the cell picker. Fetched once on mount (mirrors
    // MyBookmarks' query) so opening the picker is instant.
    const [bookmarks, setBookmarks] = useState([])
    const [bookmarksLoading, setBookmarksLoading] = useState(true)

    useEffect(() => {
        if (!userId) return
        let active = true
        ;(async () => {
            try {
                setBookmarksLoading(true)
                const { data, error } = await supabase
                    .from('favorites')
                    .select('created_at, recipe:recipes(id, title)')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                if (!active) return
                if (error) throw error
                setBookmarks((data || []).map(d => d.recipe).filter(Boolean))
            } catch (e) {
                console.error('Error fetching bookmarks for planner:', e.message)
                if (active) setBookmarks([])
            } finally {
                if (active) setBookmarksLoading(false)
            }
        })()
        return () => { active = false }
    }, [userId])

    // Picker target cell: { date, slot } or null when closed.
    const [picker, setPicker] = useState(null)

    // Drag-and-drop (desktop only — HTML5 DnD doesn't fire on touch, where
    // the tap-+ picker is the path). dragDataRef carries the recipe being
    // dragged: from the bookmark tray ({ recipe }) or from a filled cell
    // when relocating it ({ recipe, fromDate, fromSlot }). dragOverKey
    // highlights the cell currently under the pointer.
    const [dragOverKey, setDragOverKey] = useState(null)
    const dragDataRef = useRef(null)

    useEffect(() => {
        if (!picker) return
        const onKey = (e) => { if (e.key === 'Escape') setPicker(null) }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [picker])

    const monthDay = (d, opts) => d.toLocaleDateString(undefined, opts)
    const sameMonth = days[0].getMonth() === days[6].getMonth()
    const weekLabel = `${monthDay(days[0], { month: 'short', day: 'numeric' })} – ${monthDay(days[6], sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`

    const handlePick = (recipe) => {
        if (picker) addEntry(picker.date, picker.slot, recipe)
        setPicker(null)
    }

    // Item 2 — "Build shopping list from plan". Walks every recipe planned in
    // the visible week, fetches their ingredients, sums quantities across
    // repeated plannings (a recipe planned twice contributes 2x), subtracts
    // anything already in the Fridge Basket, and writes the result into the
    // Stage N+2a shopping list via addRecipe — one call per distinct recipe so
    // each lands as its own provenance source (N+2c). Quantities are the
    // recipe's authored amounts (for its own servings); there's no per-cell
    // serving target, so no extra scaling factor is applied. addRecipe REPLACES
    // a recipe's prior contribution, so re-building (or building after a manual
    // send) is idempotent rather than double-counting.
    const [building, setBuilding] = useState(false)
    const handleBuildShoppingList = async () => {
        const planned = new Map() // recipeId -> { title, count }
        for (const entry of entries.values()) {
            const r = entry.recipe
            if (!r?.id) continue
            const cur = planned.get(r.id)
            if (cur) cur.count += 1
            else planned.set(r.id, { title: r.title, count: 1 })
        }
        if (planned.size === 0) {
            toast('Add some recipes to your plan first')
            return
        }

        setBuilding(true)
        try {
            const { data, error } = await supabase
                .from('ingredients')
                .select('recipe_id, name, quantity, unit, notes')
                .in('recipe_id', Array.from(planned.keys()))
            if (error) throw error

            const byRecipe = new Map()
            for (const ing of data || []) {
                if (!byRecipe.has(ing.recipe_id)) byRecipe.set(ing.recipe_id, [])
                byRecipe.get(ing.recipe_id).push(ing)
            }

            let added = 0
            let subtracted = 0
            let recipesContributing = 0
            for (const [recipeId, meta] of planned) {
                const items = []
                for (const ing of byRecipe.get(recipeId) || []) {
                    if (inFridgeBasket(ing.name, basket)) { subtracted += 1; continue }
                    const qty = (typeof ing.quantity === 'number' && !Number.isNaN(ing.quantity))
                        ? parseFloat((ing.quantity * meta.count).toFixed(2))
                        : null
                    items.push({ name: ing.name, unit: ing.unit ?? null, quantity: qty, notes: ing.notes ?? null })
                }
                if (items.length > 0) {
                    addToShoppingList(recipeId, meta.title, items)
                    added += items.length
                    recipesContributing += 1
                }
            }

            if (added === 0) {
                toast('Everything those recipes need is already in your fridge')
                return
            }
            const itemNoun = added === 1 ? 'item' : 'items'
            const recipeNoun = recipesContributing === 1 ? 'recipe' : 'recipes'
            const sub = subtracted > 0 ? ` · ${subtracted} skipped (in your fridge)` : ''
            toast.success(`Added ${added} ${itemNoun} from ${recipesContributing} ${recipeNoun}${sub}`)
            onViewShoppingList?.()
        } catch (e) {
            console.error('Failed to build shopping list:', e.message)
            toast.error('Could not build shopping list: ' + e.message)
        } finally {
            setBuilding(false)
        }
    }

    // Begin dragging a chip out of the bookmark tray (a copy into the grid).
    const handleTrayDragStart = (e, recipe) => {
        dragDataRef.current = { recipe }
        e.dataTransfer.effectAllowed = 'copy'
        try { e.dataTransfer.setData('text/plain', recipe.title) } catch { /* IE guard, harmless */ }
    }

    // Begin dragging a filled cell (a move within the grid).
    const handleCellDragStart = (e, recipe, date, slot) => {
        dragDataRef.current = { recipe, fromDate: date, fromSlot: slot }
        e.dataTransfer.effectAllowed = 'move'
        try { e.dataTransfer.setData('text/plain', recipe.title) } catch { /* IE guard, harmless */ }
    }

    const handleCellDragOver = (e, key) => {
        e.preventDefault()
        setDragOverKey(key)
    }

    // Clear transient drag state when the gesture ends (drop or cancel).
    const handleDragEnd = () => {
        setDragOverKey(null)
        dragDataRef.current = null
    }

    const handleCellDrop = (e, date, slot) => {
        e.preventDefault()
        const data = dragDataRef.current
        setDragOverKey(null)
        dragDataRef.current = null
        if (!data?.recipe?.id) return
        // No-op when a filled cell is dropped back on itself.
        if (data.fromDate === date && data.fromSlot === slot) return
        // Drop replaces whatever was in the destination (upsert). When the
        // source was another cell, clear it too so the recipe MOVES rather
        // than duplicating.
        addEntry(date, slot, data.recipe)
        if (data.fromDate) removeEntry(data.fromDate, data.fromSlot)
    }

    return (
        <div className="paper-grain min-h-screen">
            <div className="max-w-7xl mx-auto px-5 py-5">
                <header className="flex justify-between items-center mb-8 gap-3 flex-wrap">
                    <div className="flex items-center gap-4 min-w-0">
                        <button
                            onClick={onBack}
                            className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors flex-shrink-0"
                        >
                            ← Back
                        </button>
                        <h1 className="font-display text-2xl md:text-3xl font-semibold text-ink tracking-tight truncate">
                            Meal Plan
                        </h1>
                    </div>
                    <button
                        onClick={handleBuildShoppingList}
                        disabled={building || entries.size === 0}
                        title={entries.size === 0 ? 'Plan some recipes this week first' : 'Sum this week’s ingredients into your shopping list'}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                    >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="9" cy="21" r="1" />
                            <circle cx="20" cy="21" r="1" />
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                        </svg>
                        {building ? 'Building…' : 'Build shopping list'}
                    </button>
                </header>

                {/* Week navigator */}
                <div className="flex items-center gap-3 mb-6">
                    <button
                        onClick={() => setWeekStart(w => addDays(w, -7))}
                        aria-label="Previous week"
                        className="w-10 h-10 rounded-full bg-paper-shade hover:bg-tan/40 text-ink flex items-center justify-center transition-colors"
                    >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5 stroke-ink fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <span className="font-display text-lg text-ink min-w-[120px] text-center">{weekLabel}</span>
                    <button
                        onClick={() => setWeekStart(w => addDays(w, 7))}
                        aria-label="Next week"
                        className="w-10 h-10 rounded-full bg-paper-shade hover:bg-tan/40 text-ink flex items-center justify-center transition-colors"
                    >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5 stroke-ink fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                    <button
                        onClick={() => setWeekStart(startOfWeek(new Date()))}
                        className="ml-1 px-3 py-1.5 text-sm rounded-full bg-tan-soft hover:bg-tan/40 text-ink transition-colors"
                    >
                        This week
                    </button>
                </div>

                {/* Bookmark tray — desktop drag source. Drag a chip into a
                    cell to plan it. Hidden on touch (md:) where HTML5 drag
                    doesn't fire; the tap-+ picker covers that path. */}
                <div className="hidden md:block mb-5">
                    <p className="text-xs text-rose mb-2">Drag a bookmark into the week — or tap any + below.</p>
                    {bookmarksLoading ? (
                        <p className="font-display italic text-rose text-sm">Loading bookmarks…</p>
                    ) : bookmarks.length === 0 ? (
                        <p className="font-display italic text-rose text-sm">Bookmark recipes you want to cook, then drag them here.</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {bookmarks.map(recipe => (
                                <span
                                    key={recipe.id}
                                    draggable
                                    onDragStart={(e) => handleTrayDragStart(e, recipe)}
                                    onDragEnd={handleDragEnd}
                                    title={`Drag "${recipe.title}" into a meal slot`}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-paper-shade hover:bg-tan/40 text-ink text-sm rounded-full cursor-grab active:cursor-grabbing select-none"
                                >
                                    <svg aria-hidden="true" viewBox="0 0 24 24" className="w-3.5 h-3.5 stroke-rose fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="6" r="0.5" /><circle cx="9" cy="12" r="0.5" /><circle cx="9" cy="18" r="0.5" /><circle cx="15" cy="6" r="0.5" /><circle cx="15" cy="12" r="0.5" /><circle cx="15" cy="18" r="0.5" /></svg>
                                    <span className="max-w-[160px] truncate">{recipe.title}</span>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Grid. Overflows horizontally on narrow screens rather than
                    crushing seven columns to unreadable widths — the inner
                    min-width keeps cells legible and the wrapper scrolls. */}
                <div className="overflow-x-auto -mx-5 px-5 pb-2">
                    <div className="min-w-[640px]">
                        {/* Day header row */}
                        <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: '70px repeat(7, minmax(0, 1fr))' }}>
                            <div />
                            {days.map((d, i) => {
                                const iso = toISODate(d)
                                const isToday = iso === todayISO
                                return (
                                    <div
                                        key={iso}
                                        className={`text-center text-xs rounded-md py-1 ${isToday ? 'bg-tan-soft text-ink' : 'text-rose'}`}
                                    >
                                        <div className="font-semibold">{DOW[i]}</div>
                                        <div>{d.getDate()}</div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Meal rows */}
                        {SLOTS.map(slot => (
                            <div
                                key={slot.key}
                                className="grid gap-2 mb-2 items-stretch"
                                style={{ gridTemplateColumns: '70px repeat(7, minmax(0, 1fr))' }}
                            >
                                <div className="flex items-center justify-end pr-1 text-xs text-rose">{slot.label}</div>
                                {days.map(d => {
                                    const iso = toISODate(d)
                                    const entry = getEntry(iso, slot.key)
                                    if (entry) {
                                        const title = entry.recipe?.title || 'Recipe unavailable'
                                        return (
                                            <div
                                                key={iso}
                                                draggable={!!entry.recipe?.id}
                                                onDragStart={(e) => entry.recipe?.id && handleCellDragStart(e, entry.recipe, iso, slot.key)}
                                                onDragEnd={handleDragEnd}
                                                onDragOver={(e) => handleCellDragOver(e, `${iso}|${slot.key}`)}
                                                onDrop={(e) => handleCellDrop(e, iso, slot.key)}
                                                className={`bg-tan-soft border rounded-lg min-h-[48px] px-2 flex items-center gap-1 ${dragOverKey === `${iso}|${slot.key}` ? 'border-rust ring-2 ring-rust' : 'border-rust/40'}`}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => entry.recipe?.id && onRecipeClick({ id: entry.recipe.id })}
                                                    disabled={!entry.recipe?.id}
                                                    title={title}
                                                    className="flex-1 min-w-0 text-left text-[11.5px] leading-tight font-medium text-ink truncate disabled:cursor-default"
                                                >
                                                    {title}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => removeEntry(iso, slot.key)}
                                                    aria-label={`Remove ${title} from ${slot.label} ${DOW[(d.getDay() + 6) % 7]}`}
                                                    className="flex-shrink-0 w-5 h-5 rounded-full text-rose-dark hover:bg-rust/10 flex items-center justify-center transition-colors"
                                                >
                                                    <svg aria-hidden="true" viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                                                </button>
                                            </div>
                                        )
                                    }
                                    return (
                                        <button
                                            key={iso}
                                            type="button"
                                            onClick={() => setPicker({ date: iso, slot: slot.key })}
                                            onDragOver={(e) => handleCellDragOver(e, `${iso}|${slot.key}`)}
                                            onDrop={(e) => handleCellDrop(e, iso, slot.key)}
                                            onDragEnd={handleDragEnd}
                                            aria-label={`Add a recipe to ${slot.label} ${DOW[(d.getDay() + 6) % 7]}`}
                                            className={`border border-dashed rounded-lg min-h-[48px] flex items-center justify-center transition-colors ${dragOverKey === `${iso}|${slot.key}` ? 'border-rust ring-2 ring-rust bg-paper-shade text-rose' : 'border-ink/25 text-rose/50 hover:bg-paper-shade hover:text-rose'}`}
                                        >
                                            <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                        </button>
                                    )
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                <p className="mt-4 font-display italic text-rose text-sm">
                    {loading ? 'Loading your plan…' : 'Tap any + to add from your bookmarks — or on desktop, drag a bookmark into a slot (and drag a planned recipe to move it). Building the shopping list from a week comes next.'}
                </p>
            </div>

            {/* Bookmark picker. Normal-flow fixed overlay (same posture as the
                Auth overlay / Fridge modal). Backdrop click or Escape closes. */}
            {picker && (
                <div
                    className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4"
                    onClick={() => setPicker(null)}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Pick a recipe for this meal"
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        className="bg-paper border border-paper-shade rounded-lg shadow-lg w-full max-w-md max-h-[80vh] flex flex-col"
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-paper-shade">
                            <h2 className="font-display text-lg text-ink">Add a recipe</h2>
                            <button
                                onClick={() => setPicker(null)}
                                aria-label="Close"
                                className="w-8 h-8 rounded-full bg-paper-shade hover:bg-tan/40 text-ink flex items-center justify-center transition-colors"
                            >
                                <svg aria-hidden="true" viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto p-2">
                            {bookmarksLoading ? (
                                <p className="font-display italic text-rose text-center py-8">Loading bookmarks…</p>
                            ) : bookmarks.length === 0 ? (
                                <div className="text-center py-10 px-4">
                                    <p className="text-2xl text-tan mb-3">✦</p>
                                    <p className="font-display text-ink mb-1">No bookmarks yet.</p>
                                    <p className="font-display italic text-rose text-sm">Bookmark recipes you want to cook, then plan them here.</p>
                                </div>
                            ) : (
                                bookmarks.map(recipe => (
                                    <button
                                        key={recipe.id}
                                        type="button"
                                        onClick={() => handlePick(recipe)}
                                        className="w-full text-left px-3 py-2.5 rounded-md text-ink hover:bg-paper-shade transition-colors"
                                    >
                                        {recipe.title}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

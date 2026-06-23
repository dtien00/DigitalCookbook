import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { scaleQuantity } from '../lib/scaleQuantity'
import { copyText } from '../lib/copyText'
import { recipesInList } from '../lib/shoppingListCore'

// Stage N+2a — the cumulative shopping list page (`/shopping-list`). The
// persistent list (localStorage-backed via useShoppingList) lives at App level
// and is passed in as props so the header count badge and this page share one
// in-memory instance. The "checked off" state is deliberately session-scoped
// local state here (not persisted), matching Stage 7's kitchen-session
// checklists — you tick items as you shop, and a fresh session starts clean.
//
// N+2c (PR #64) adds the "Recipes in this list" provenance chip bar: each item
// now carries `sources` (which recipes contributed it), so we can show one chip
// per recipe and highlight that recipe's rows on hover / focus / tap.
//
// No auth: shopping happens out-of-app, so the list belongs to the device, not
// an account. The route is reachable by anonymous and signed-in users alike.

// Plaintext line for the clipboard export. Stored quantities are already scaled
// by the servings multiplier at send time, so we render fractions with a
// multiplier of 1 (reusing scaleQuantity for the ½/¼/¾ substitution).
function formatLine(item) {
    const qty = item.quantity != null ? scaleQuantity(item.quantity, 1) : ''
    const parts = [qty, item.unit, item.name].filter(p => p != null && String(p).trim() !== '')
    const head = `- ${parts.join(' ')}`
    return item.notes ? `${head} (${item.notes})` : head
}

// Display string for an on-screen row (no leading "- ").
function displayLine(item) {
    const qty = item.quantity != null ? scaleQuantity(item.quantity, 1) : ''
    return [qty, item.unit, item.name].filter(p => p != null && String(p).trim() !== '').join(' ')
}

const pill = 'inline-flex items-center gap-1.5 px-3 py-2.5 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-medium rounded-md transition-colors'

export default function ShoppingList({ items, onRemove, onClear }) {
    const navigate = useNavigate()
    const [checked, setChecked] = useState(() => new Set())

    // N+2c (PR #64) — provenance chip bar. Hovering or focusing a recipe chip
    // previews which rows it contributed; clicking pins that highlight so it
    // survives the pointer leaving (and works on touch, where there's no hover).
    const recipes = useMemo(() => recipesInList(items), [items])
    const [hoveredRecipeId, setHoveredRecipeId] = useState(null)
    const [pinnedRecipeId, setPinnedRecipeId] = useState(null)
    const activeRecipeId = pinnedRecipeId ?? hoveredRecipeId

    // Drop a pin whose recipe is no longer on the list (e.g. all its rows were
    // removed individually) so a stale id can't keep an invisible highlight.
    useEffect(() => {
        if (pinnedRecipeId != null && !recipes.some(r => r.recipeId === pinnedRecipeId)) {
            setPinnedRecipeId(null)
        }
    }, [recipes, pinnedRecipeId])

    const isRowActive = (item) =>
        activeRecipeId != null && (item.sources || []).some(s => s.recipeId === activeRecipeId)

    const toggleChecked = (id) => {
        setChecked(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const handleCopy = async () => {
        if (items.length === 0) {
            toast('Your shopping list is empty')
            return
        }
        const payload = 'Shopping list\n' + items.map(formatLine).join('\n')
        try {
            await copyText(payload)
            const noun = items.length === 1 ? 'item' : 'items'
            toast.success(`Copied ${items.length} ${noun} to clipboard`)
        } catch (error) {
            toast.error('Could not copy list: ' + error.message)
        }
    }

    const handlePrint = () => window.print()

    const handleClear = () => {
        if (items.length === 0) return
        if (!window.confirm('Clear the entire shopping list?')) return
        onClear()
        setChecked(new Set())
        toast.success('Shopping list cleared')
    }

    return (
        <div className="max-w-3xl mx-auto px-5 py-5">
            <header className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/')}
                        className="no-print px-4 py-2.5 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors"
                    >
                        ← Back
                    </button>
                    <h1 className="font-display text-2xl text-ink">Shopping list</h1>
                </div>
                {items.length > 0 && (
                    <span className="no-print text-ink/50 text-sm">
                        {items.length} item{items.length === 1 ? '' : 's'}
                    </span>
                )}
            </header>

            {items.length === 0 ? (
                <div className="text-center py-16">
                    <p className="text-2xl text-tan mb-4">✦</p>
                    <p className="font-display text-xl text-ink mb-2">Your shopping list is empty.</p>
                    <p className="font-display italic text-rose">
                        Open a recipe and tap “Send to shopping list” to start stacking ingredients.
                    </p>
                </div>
            ) : (
                <>
                    <div className="no-print flex flex-wrap gap-2 mb-6">
                        <button type="button" onClick={handleCopy} className={pill} aria-label="Copy shopping list to clipboard">
                            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            <span>Copy to clipboard</span>
                        </button>
                        <button type="button" onClick={handlePrint} className={pill} aria-label="Print shopping list">
                            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="6 9 6 2 18 2 18 9" />
                                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                                <rect x="6" y="14" width="12" height="8" />
                            </svg>
                            <span>Print</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleClear}
                            className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-paper-shade hover:bg-rose/10 text-rose-dark text-sm font-medium rounded-md transition-colors"
                            aria-label="Clear entire shopping list"
                        >
                            Clear all
                        </button>
                    </div>

                    {recipes.length > 0 && (
                        <div className="no-print mb-6">
                            <p className="text-xs uppercase tracking-wide text-ink/55 mb-2">Recipes in this list</p>
                            <div className="flex flex-wrap gap-2">
                                {recipes.map(r => {
                                    const active = activeRecipeId === r.recipeId
                                    const pinned = pinnedRecipeId === r.recipeId
                                    return (
                                        <button
                                            key={r.recipeId}
                                            type="button"
                                            aria-pressed={pinned}
                                            aria-label={`Highlight ingredients from ${r.recipeTitle || 'this recipe'}`}
                                            onMouseEnter={() => setHoveredRecipeId(r.recipeId)}
                                            onMouseLeave={() => setHoveredRecipeId(null)}
                                            onFocus={() => setHoveredRecipeId(r.recipeId)}
                                            onBlur={() => setHoveredRecipeId(null)}
                                            onClick={() => setPinnedRecipeId(prev => (prev === r.recipeId ? null : r.recipeId))}
                                            className={`inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-md text-sm bg-tan-soft text-ink transition-shadow ${active ? 'ring-2 ring-rust' : 'hover:bg-tan/40'}`}
                                        >
                                            <span className="truncate max-w-[11rem]">{r.recipeTitle || 'Untitled recipe'}</span>
                                            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs ${active ? 'bg-rust text-paper' : 'bg-tan text-ink'}`}>
                                                {r.count}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    <ul className="list-none pl-0 space-y-0.5">
                        {items.map(item => {
                            const isChecked = checked.has(item.id)
                            const rowActive = isRowActive(item)
                            return (
                                <li
                                    key={item.id}
                                    className={`flex items-start gap-2 border-l-[3px] pl-3 -ml-3 transition-colors ${rowActive ? 'border-rust bg-tan/20' : 'border-transparent'}`}
                                >
                                    <label className="flex items-start gap-3 cursor-pointer select-none flex-1 py-1.5">
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => toggleChecked(item.id)}
                                            className="accent-rust w-5 h-5 mt-0.5 shrink-0 cursor-pointer"
                                        />
                                        <span className={isChecked ? 'line-through text-ink/50' : 'text-ink'}>
                                            {displayLine(item)}
                                            {item.notes && (
                                                <span className="block italic text-ink/60 text-sm mt-0.5 font-serif">
                                                    {item.notes}
                                                </span>
                                            )}
                                        </span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => onRemove(item.id)}
                                        aria-label={`Remove ${item.name}`}
                                        className="no-print shrink-0 mt-1 px-2 py-1 text-lg leading-none text-ink/30 hover:text-rose-dark transition-colors"
                                    >
                                        ✕
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                </>
            )}
        </div>
    )
}

import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { scaleQuantity } from '../lib/scaleQuantity'
import { copyText } from '../lib/copyText'
import { recipesInList } from '../lib/shoppingListCore'
import { encodeList, decodeList, payloadHash, MAX_SHARE_PAYLOAD } from '../lib/shareList'

// Stage N+2a — the cumulative shopping list page (`/shopping-list`). The
// persistent list (localStorage-backed via useShoppingList) lives at App level
// and is passed in as props so the header count badge and this page share one
// in-memory instance. The "checked off" state is session-scoped local state
// (not persisted), matching Stage 7's kitchen-session checklists.
//
// N+2c (PR #64) added the "Recipes in this list" provenance chip bar. PR #66
// adds removal + undo: the chip's ✕ removes a whole recipe optimistically (no
// dialog) and the per-row ✕ removes one item — both fire an Undo toast and drop
// onto a persistent "Recently removed" tray so an accidental delete is always
// recoverable.
//
// Share (Stage N+2a, PR #94): the Copy / Print actions collapse into a `Share ▾`
// dropdown (the Sort-picker idiom) that also offers "Copy shareable link" and,
// on capable devices, native `Share via…`. Each row copies exactly what its
// label says — "Copy list text" takes the list with the link appended, "Copy
// shareable link" takes the bare URL so it can go straight into an address bar,
// and `Share via…` sends list + link because a messaging recipient wants both.
// The link encodes the whole list into
// the URL hash (../lib/shareList) so a recipient opens `/shopping-list#list=…`
// pre-populated. Arriving with such a hash shows an Add/Discard confirm banner
// (never a silent merge); Add folds the items in under one "Shared list"
// provenance chip via the same addRecipe path, so it's idempotent and undoable.
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

// Label for a Recently-removed entry (item line, or recipe title + item count).
function removedLabel(entry) {
    if (entry.type === 'recipe') {
        const n = (entry.contribution || []).length
        return `${entry.recipeTitle || 'Recipe'} · ${n} item${n === 1 ? '' : 's'}`
    }
    return entry.item ? displayLine(entry.item) : 'item'
}

function relativeTime(ts, now) {
    if (typeof ts !== 'number') return ''
    const s = Math.max(0, Math.round((now - ts) / 1000))
    if (s < 10) return 'just now'
    if (s < 60) return `${s}s ago`
    const m = Math.round(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.round(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.round(h / 24)}d ago`
}

// An undo toast: the message + an Undo action that calls onUndo. 6s so there's
// time to catch a mis-click; the Recently-removed tray is the longer-lived net.
function undoToast(message, onUndo) {
    toast((t) => (
        <span className="flex items-center gap-3">
            <span>{message}</span>
            <button
                type="button"
                onClick={() => { onUndo(); toast.dismiss(t.id) }}
                className="shrink-0 font-medium text-rust hover:text-rust-dark underline underline-offset-2"
            >
                Undo
            </button>
        </span>
    ), { duration: 6000 })
}

const pill = 'inline-flex items-center gap-1.5 px-3 py-2.5 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-medium rounded-md transition-colors'
const menuItem = 'flex w-full items-center gap-2 px-4 py-2.5 text-sm text-left text-ink hover:bg-tan/40 transition-colors'

export default function ShoppingList({
    items,
    onRemove,
    onRemoveRecipe,
    recentlyRemoved = [],
    onRestore,
    onDismiss,
    onClear,
    onImport,
}) {
    const navigate = useNavigate()
    const location = useLocation()
    const [checked, setChecked] = useState(() => new Set())
    const [showRemoved, setShowRemoved] = useState(false)
    const now = Date.now()

    // Share menu (Sort-picker idiom): outside-click + Escape close it.
    const [shareOpen, setShareOpen] = useState(false)
    const shareMenuRef = useRef(null)
    const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

    useEffect(() => {
        if (!shareOpen) return
        const onDoc = (e) => {
            if (shareMenuRef.current && !shareMenuRef.current.contains(e.target)) setShareOpen(false)
        }
        const onKey = (e) => { if (e.key === 'Escape') setShareOpen(false) }
        document.addEventListener('mousedown', onDoc)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onDoc)
            document.removeEventListener('keydown', onKey)
        }
    }, [shareOpen])

    // Import-a-shared-list flow. A `#list=<encoded>` hash means someone shared
    // their list with us; stage it behind an Add/Discard banner rather than
    // silently merging it into our own. Strip the hash once handled so a refresh
    // (or Back/Forward) can't re-import.
    const [pendingImport, setPendingImport] = useState(null)

    const stripImportHash = () => {
        try {
            window.history.replaceState(
                window.history.state, '',
                window.location.pathname + window.location.search,
            )
        } catch { /* history unavailable — harmless */ }
    }

    useEffect(() => {
        const m = (location.hash || '').match(/^#list=(.+)$/)
        if (!m) return
        const decoded = decodeList(m[1])
        if (decoded === null) {
            toast('That shared link looks incomplete')
            stripImportHash()
            return
        }
        if (decoded.length === 0) {
            stripImportHash()
            return
        }
        setPendingImport({ items: decoded, encoded: m[1] })
    }, [location.hash])

    // N+2c (PR #64) — provenance chip bar. Hovering or focusing a recipe chip
    // previews which rows it contributed; clicking pins that highlight so it
    // survives the pointer leaving (and works on touch, where there's no hover).
    const recipes = useMemo(() => recipesInList(items), [items])
    const [hoveredRecipeId, setHoveredRecipeId] = useState(null)
    const [pinnedRecipeId, setPinnedRecipeId] = useState(null)
    const activeRecipeId = pinnedRecipeId ?? hoveredRecipeId

    // Drop a pin whose recipe is no longer on the list (e.g. removed) so a stale
    // id can't keep an invisible highlight.
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

    const handleRemoveItem = (item) => {
        const entry = onRemove(item.id)
        if (entry) undoToast(`Removed ${displayLine(item)}`, () => onRestore(entry.id))
    }

    const handleRemoveRecipe = (r) => {
        const entry = onRemoveRecipe(r.recipeId)
        if (!entry) return
        const { removed = [], reduced = [] } = entry.summary || {}
        const parts = []
        if (removed.length) parts.push(`${removed.length} item${removed.length === 1 ? '' : 's'} removed`)
        if (reduced.length) parts.push(`${reduced.length} shared item${reduced.length === 1 ? '' : 's'} reduced`)
        const detail = parts.length ? ` — ${parts.join(', ')}` : ''
        undoToast(`Removed ${r.recipeTitle || 'recipe'}${detail}`, () => onRestore(entry.id))
    }

    // Plaintext payload — the same header + `- qty unit name (notes)` rows the
    // clipboard export has always produced.
    const buildPlaintext = () => 'Shopping list\n' + items.map(formatLine).join('\n')
    const shareUrl = (encoded) => `${window.location.origin}/shopping-list#list=${encoded}`
    const textWithLink = (url) => `${buildPlaintext()}\nOpen & check off: ${url}`

    // The Share menu only renders when items.length > 0, so these handlers never
    // hit the empty-list case.
    //
    // Payload split: each menu row copies exactly what its label says.
    //   Copy list text   → the list, with the link appended (it's ~1 line and
    //                      always useful, so it rides along implicitly)
    //   Copy shareable link → the bare URL, nothing else, so it can be pasted
    //                      straight into an address bar without hand-selecting
    //                      it out of a fifteen-line blob
    //   Share via…       → list + link, unchanged (native sheet = messaging,
    //                      where the readable list is the point)
    const handleCopyText = async () => {
        setShareOpen(false)
        const encoded = encodeList(items)
        // Over budget → copy the list alone rather than a truncated link.
        const withinBudget = encoded.length <= MAX_SHARE_PAYLOAD
        const payload = withinBudget ? textWithLink(shareUrl(encoded)) : buildPlaintext()
        try {
            await copyText(payload)
            const noun = items.length === 1 ? 'item' : 'items'
            if (withinBudget) {
                toast.success(`Copied ${items.length} ${noun} and a link`)
            } else {
                toast.success(`Copied ${items.length} ${noun} — list too long to include a link`)
            }
        } catch (error) {
            toast.error('Could not copy list: ' + error.message)
        }
    }

    const handleCopyLink = async () => {
        setShareOpen(false)
        const encoded = encodeList(items)
        // No silent fallback to plaintext here: this row promises a link, and
        // quietly handing back a wall of text instead is the label/behavior
        // mismatch this split exists to remove. Say so and name the row that
        // does work.
        if (encoded.length > MAX_SHARE_PAYLOAD) {
            toast.error('List too long to share as a link — use Copy list text')
            return
        }
        try {
            await copyText(shareUrl(encoded))
            toast.success('Link copied')
        } catch (error) {
            toast.error('Could not copy link: ' + error.message)
        }
    }

    const handleWebShare = async () => {
        setShareOpen(false)
        const encoded = encodeList(items)
        const withinBudget = encoded.length <= MAX_SHARE_PAYLOAD
        // Link is embedded in the text (readable in any app + tappable on web),
        // so we don't also pass `url` — that would duplicate it on some targets.
        const text = withinBudget ? textWithLink(shareUrl(encoded)) : buildPlaintext()
        try {
            await navigator.share({ title: 'Shopping list', text })
        } catch (error) {
            if (error && error.name === 'AbortError') return // user dismissed the sheet
            toast.error('Could not share: ' + error.message)
        }
    }

    const handlePrint = () => {
        setShareOpen(false)
        window.print()
    }

    const handleImportAdd = () => {
        if (!pendingImport || typeof onImport !== 'function') {
            setPendingImport(null)
            stripImportHash()
            return
        }
        // Synthetic, payload-stable recipeId so re-opening the same link REPLACES
        // its contribution (addRecipe's replace-on-recipeId) instead of summing.
        const recipeId = 'shared:' + payloadHash(pendingImport.encoded)
        onImport(recipeId, 'Shared list', pendingImport.items)
        const n = pendingImport.items.length
        toast.success(`Added ${n} shared item${n === 1 ? '' : 's'} to your list`)
        setPendingImport(null)
        stripImportHash()
    }

    const handleImportDiscard = () => {
        setPendingImport(null)
        stripImportHash()
    }

    const handleClear = () => {
        if (items.length === 0) return
        if (!window.confirm('Clear the entire shopping list? This also clears Recently removed.')) return
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

            {pendingImport && (
                <div className="no-print mb-6 rounded-lg border border-rust/40 bg-tan-soft px-4 py-3" role="status">
                    <p className="text-ink font-serif">
                        A shared list has {pendingImport.items.length} item{pendingImport.items.length === 1 ? '' : 's'}.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleImportAdd}
                            className="px-4 py-2 bg-rust hover:bg-rust-dark text-paper text-sm font-medium rounded-md transition-colors"
                        >
                            Add to my list
                        </button>
                        <button
                            type="button"
                            onClick={handleImportDiscard}
                            className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-medium rounded-md transition-colors"
                        >
                            Discard
                        </button>
                    </div>
                </div>
            )}

            {items.length === 0 && recentlyRemoved.length === 0 ? (
                <div className="text-center py-16">
                    <p className="text-2xl text-tan mb-4">✦</p>
                    <p className="font-display text-xl text-ink mb-2">Your shopping list is empty.</p>
                    <p className="font-display italic text-rose">
                        Open a recipe and tap “Send to shopping list” to start stacking ingredients.
                    </p>
                </div>
            ) : (
                <>
                    {items.length > 0 && (
                        <>
                            <div className="no-print flex flex-wrap gap-2 mb-6">
                                <div className="relative" ref={shareMenuRef}>
                                    <button
                                        type="button"
                                        onClick={() => setShareOpen(o => !o)}
                                        aria-haspopup="menu"
                                        aria-expanded={shareOpen}
                                        className={pill}
                                    >
                                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <circle cx="18" cy="5" r="3" />
                                            <circle cx="6" cy="12" r="3" />
                                            <circle cx="18" cy="19" r="3" />
                                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                                        </svg>
                                        <span>Share</span>
                                        <span className={`inline-block text-xs transition-transform ${shareOpen ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
                                    </button>
                                    {shareOpen && (
                                        <div role="menu" className="absolute left-0 top-full mt-2 z-20 w-56 bg-paper rounded-xl shadow-lg border border-paper-shade overflow-hidden">
                                            <button type="button" role="menuitem" onClick={handleCopyText} className={menuItem}>Copy list text</button>
                                            <button type="button" role="menuitem" onClick={handleCopyLink} className={menuItem}>Copy shareable link</button>
                                            {canWebShare && (
                                                <button type="button" role="menuitem" onClick={handleWebShare} className={menuItem}>Share via…</button>
                                            )}
                                            <button type="button" role="menuitem" onClick={handlePrint} className={menuItem}>Print</button>
                                        </div>
                                    )}
                                </div>
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
                                                <span
                                                    key={r.recipeId}
                                                    onMouseEnter={() => setHoveredRecipeId(r.recipeId)}
                                                    onMouseLeave={() => setHoveredRecipeId(null)}
                                                    className={`inline-flex items-center rounded-md bg-tan-soft text-ink overflow-hidden transition-shadow ${active ? 'ring-2 ring-rust' : ''}`}
                                                >
                                                    <button
                                                        type="button"
                                                        aria-pressed={pinned}
                                                        aria-label={`Highlight ingredients from ${r.recipeTitle || 'this recipe'}`}
                                                        onFocus={() => setHoveredRecipeId(r.recipeId)}
                                                        onBlur={() => setHoveredRecipeId(null)}
                                                        onClick={() => setPinnedRecipeId(prev => (prev === r.recipeId ? null : r.recipeId))}
                                                        className={`inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 text-sm ${active ? '' : 'hover:bg-tan/40'}`}
                                                    >
                                                        <span className="truncate max-w-[10rem]">{r.recipeTitle || 'Untitled recipe'}</span>
                                                        <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs ${active ? 'bg-rust text-paper' : 'bg-tan text-ink'}`}>
                                                            {r.count}
                                                        </span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveRecipe(r)}
                                                        aria-label={`Remove ${r.recipeTitle || 'recipe'} and its ingredients`}
                                                        className="self-stretch px-2 leading-none text-ink/40 hover:text-rose-dark hover:bg-rose/10 transition-colors border-l border-tan/40"
                                                    >
                                                        ✕
                                                    </button>
                                                </span>
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
                                                onClick={() => handleRemoveItem(item)}
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

                    {recentlyRemoved.length > 0 && (
                        <div className="no-print mt-8 pt-4 border-t border-paper-shade">
                            <button
                                type="button"
                                onClick={() => setShowRemoved(v => !v)}
                                aria-expanded={showRemoved}
                                className="flex items-center gap-2 text-xs uppercase tracking-wide text-ink/45 hover:text-ink/75 transition-colors"
                            >
                                <span className={`inline-block transition-transform ${showRemoved ? 'rotate-90' : ''}`} aria-hidden="true">▸</span>
                                Recently removed ({recentlyRemoved.length})
                            </button>
                            {showRemoved && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {recentlyRemoved.map(entry => (
                                        <span key={entry.id} className="inline-flex items-center bg-paper-shade rounded-md overflow-hidden text-sm">
                                            <span className="flex items-center gap-2 pl-3 pr-1.5 py-1">
                                                <span className="text-ink/80">{removedLabel(entry)}</span>
                                                <span className="text-ink/35 text-xs">{relativeTime(entry.removedAt, now)}</span>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => onRestore(entry.id)}
                                                aria-label={`Restore ${removedLabel(entry)}`}
                                                title="Restore"
                                                className="self-stretch px-2 leading-none text-rust hover:text-rust-dark hover:bg-tan/40 transition-colors border-l border-tan/40"
                                            >
                                                ↩
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onDismiss(entry.id)}
                                                aria-label={`Dismiss ${removedLabel(entry)}`}
                                                title="Dismiss"
                                                className="self-stretch px-2 leading-none text-ink/30 hover:text-rose-dark hover:bg-rose/10 transition-colors border-l border-tan/40"
                                            >
                                                ✕
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

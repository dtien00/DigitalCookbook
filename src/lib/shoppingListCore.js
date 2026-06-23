// Stage N+2c — pure, React-free core for the shopping-list model.
//
// Split out of useShoppingList so the merge / provenance / removal arithmetic is
// testable without a React renderer and reusable by future consumers (e.g. Stage
// M+1's "build shopping list from plan"). The hook is a thin localStorage +
// setState wrapper around these functions.
//
// Shapes:
//   Source = { recipeId, recipeTitle, quantity, notes, addedAt }
//     recipeId:    string | null   (null = legacy/unattributed pre-N+2c row)
//     recipeTitle: string | null   (denormalised at add time so a chip survives
//                                    the source recipe later being edited/deleted)
//     quantity:    number | null   (this recipe's contribution, already scaled)
//     notes:       string | null   (this recipe's buy-time advice)
//     addedAt:     number | null   (Date.now() at add — drives chip order + undo)
//
//   ShoppingItem = { id, name, unit, quantity, notes, sources: Source[] }
//     quantity / notes are DENORMALISED (sum of source quantities; first source
//     note) so the render / clipboard / print paths stay unchanged. `sources` is
//     the source of truth — always recompute() a row after mutating its sources.

export function normalize(raw) {
    if (typeof raw !== 'string') return ''
    return raw.trim().toLowerCase()
}

// Dedupe key: same name AND same unit. Quantities only sum when units agree —
// "2 cups flour" + "1 cup flour" = "3 cups flour", but "2 cups" + "200 g" cannot
// be summed without a unit-conversion table that doesn't exist. Mismatched units
// stay separate rows so the list never invents a wrong total.
export function keyOf(item) {
    return normalize(item.name) + '|' + normalize(item.unit)
}

export function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `sl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

// Coerce a raw incoming ingredient into a clean { name, unit, quantity, notes }.
// Returns null when there's no usable name (the row is dropped).
function cleanIncoming(incoming) {
    const name = typeof incoming.name === 'string' ? incoming.name.trim() : ''
    if (!name) return null
    const unit = incoming.unit != null && String(incoming.unit).trim() !== ''
        ? String(incoming.unit).trim()
        : null
    const quantity = typeof incoming.quantity === 'number' && !Number.isNaN(incoming.quantity)
        ? incoming.quantity
        : null
    const notes = incoming.notes != null && String(incoming.notes).trim() !== ''
        ? String(incoming.notes).trim()
        : null
    return { name, unit, quantity, notes }
}

// Sum the numeric source quantities, rounded to 2dp. Null when no source carries
// a number (e.g. "salt, to taste" contributed by every recipe).
function sumQuantity(sources) {
    const nums = sources
        .map(s => s.quantity)
        .filter(q => typeof q === 'number' && !Number.isNaN(q))
    if (nums.length === 0) return null
    return parseFloat(nums.reduce((a, b) => a + b, 0).toFixed(2))
}

// First non-empty note in source order. A note is one recipe's advice, so the
// displayed note follows whichever contributing recipe is still present first.
function deriveNotes(sources) {
    for (const s of sources) {
        if (s.notes != null && String(s.notes).trim() !== '') return s.notes
    }
    return null
}

// Refresh an item's denormalised quantity + notes from its sources. Call after
// any mutation of `sources`.
function recompute(item) {
    return { ...item, quantity: sumQuantity(item.sources), notes: deriveNotes(item.sources) }
}

function makeSource(recipeId, recipeTitle, clean, now) {
    return {
        recipeId: recipeId != null ? String(recipeId) : null,
        recipeTitle: recipeTitle != null && String(recipeTitle).trim() !== ''
            ? String(recipeTitle).trim()
            : null,
        quantity: clean.quantity,
        notes: clean.notes,
        addedAt: typeof now === 'number' ? now : Date.now(),
    }
}

// Add one recipe's contribution to the list. Re-sending the same recipeId
// REPLACES its prior contribution (idempotent) rather than stacking a second
// copy, so the same recipe sent twice never double-counts. Each incoming
// ingredient folds into a matching (name+unit) row as a new Source, or starts a
// new row. Mismatched units of the same name stay separate (see keyOf).
export function addRecipe(list, recipeId, recipeTitle, incomingItems, now = Date.now()) {
    if (!Array.isArray(incomingItems) || incomingItems.length === 0) return list
    const id = recipeId != null ? String(recipeId) : null

    // Replace semantics: strip any existing sources from this recipe first.
    let next = id == null ? list.slice() : removeRecipe(list, id).list

    for (const raw of incomingItems) {
        const clean = cleanIncoming(raw)
        if (!clean) continue
        const source = makeSource(id, recipeTitle, clean, now)
        const key = keyOf(clean)
        const idx = next.findIndex(it => keyOf(it) === key)
        if (idx === -1) {
            next = [...next, recompute({
                id: makeId(),
                name: clean.name,
                unit: clean.unit,
                quantity: null,
                notes: null,
                sources: [source],
            })]
        } else {
            const updated = { ...next[idx], sources: [...next[idx].sources, source] }
            next = next.slice()
            next[idx] = recompute(updated)
        }
    }
    return next
}

// Remove a single row by id (a user override — ignores provenance). Returns
// { list, removed } so a caller can stash `removed` for undo.
export function removeItem(list, id) {
    const removed = list.find(it => it.id === id) || null
    return { list: list.filter(it => it.id !== id), removed }
}

// Remove an entire recipe's contribution, accounting for overlap: rows this
// recipe solely sourced are dropped; rows it shared are kept and reduced (its
// source stripped, quantity + note re-derived). Returns { list, removed } where
// `removed` is the recipe's contribution snapshot (null if it wasn't present) —
// exactly the payload addRecipe needs to undo the deletion.
export function removeRecipe(list, recipeId) {
    const id = recipeId != null ? String(recipeId) : null
    if (id == null) return { list, removed: null }

    const contribution = []
    let recipeTitle = null
    let earliest = null
    const next = []

    for (const item of list) {
        const mine = item.sources.filter(s => s.recipeId === id)
        if (mine.length === 0) {
            next.push(item)
            continue
        }
        for (const s of mine) {
            contribution.push({ name: item.name, unit: item.unit, quantity: s.quantity, notes: s.notes })
            if (recipeTitle == null && s.recipeTitle != null) recipeTitle = s.recipeTitle
            if (s.addedAt != null && (earliest == null || s.addedAt < earliest)) earliest = s.addedAt
        }
        const remaining = item.sources.filter(s => s.recipeId !== id)
        if (remaining.length === 0) continue // solely this recipe's — drop the row
        next.push(recompute({ ...item, sources: remaining }))
    }

    const removed = contribution.length === 0
        ? null
        : { recipeId: id, recipeTitle, contribution, addedAt: earliest }
    return { list: next, removed }
}

// Validate / migrate a parsed localStorage payload into the sources-bearing
// shape. Pre-N+2c rows have no `sources`; synthesise a single unattributed
// source (recipeId null) so they still render and stay individually removable —
// they just don't group under a recipe chip and aren't per-recipe deletable.
export function normalizeStored(parsed) {
    if (!Array.isArray(parsed)) return []
    return parsed
        .filter(it => it && typeof it === 'object' && typeof it.name === 'string' && it.name.trim() !== '')
        .map(it => {
            const name = it.name.trim()
            const unit = it.unit != null && String(it.unit).trim() !== '' ? String(it.unit).trim() : null
            const quantity = typeof it.quantity === 'number' && !Number.isNaN(it.quantity) ? it.quantity : null
            const notes = it.notes != null && String(it.notes).trim() !== '' ? String(it.notes).trim() : null
            const id = typeof it.id === 'string' && it.id ? it.id : makeId()

            let sources = Array.isArray(it.sources)
                ? it.sources
                    .filter(s => s && typeof s === 'object')
                    .map(s => ({
                        recipeId: s.recipeId != null ? String(s.recipeId) : null,
                        recipeTitle: s.recipeTitle != null && String(s.recipeTitle).trim() !== ''
                            ? String(s.recipeTitle).trim()
                            : null,
                        quantity: typeof s.quantity === 'number' && !Number.isNaN(s.quantity) ? s.quantity : null,
                        notes: s.notes != null && String(s.notes).trim() !== '' ? String(s.notes).trim() : null,
                        addedAt: typeof s.addedAt === 'number' ? s.addedAt : null,
                    }))
                : []
            if (sources.length === 0) {
                sources = [{ recipeId: null, recipeTitle: null, quantity, notes, addedAt: null }]
            }
            return recompute({ id, name, unit, quantity, notes, sources })
        })
}

// Derive the distinct recipes contributing to the list — the data behind the
// "Recipes in this list" provenance chip bar (N+2c, PR #64). One entry per real
// recipeId (null / unattributed sources are skipped); each carries the title,
// the count of rows it currently appears in, and its earliest addedAt for stable
// chip order. A recipe contributing two ingredients to the same row counts that
// row once.
export function recipesInList(items) {
    const byId = new Map()
    for (const item of items) {
        const counted = new Set()
        for (const s of item.sources || []) {
            if (s.recipeId == null || counted.has(s.recipeId)) continue
            counted.add(s.recipeId)
            const prev = byId.get(s.recipeId)
            if (!prev) {
                byId.set(s.recipeId, {
                    recipeId: s.recipeId,
                    recipeTitle: s.recipeTitle ?? null,
                    count: 1,
                    addedAt: s.addedAt ?? null,
                })
            } else {
                prev.count += 1
                if (prev.recipeTitle == null && s.recipeTitle != null) prev.recipeTitle = s.recipeTitle
                if (s.addedAt != null && (prev.addedAt == null || s.addedAt < prev.addedAt)) {
                    prev.addedAt = s.addedAt
                }
            }
        }
    }
    const cmpTitle = (a, b) =>
        (a.recipeTitle || '').localeCompare(b.recipeTitle || '') || a.recipeId.localeCompare(b.recipeId)
    return Array.from(byId.values()).sort((a, b) => {
        if (a.addedAt == null && b.addedAt == null) return cmpTitle(a, b)
        if (a.addedAt == null) return 1
        if (b.addedAt == null) return -1
        if (a.addedAt !== b.addedAt) return a.addedAt - b.addedAt
        return cmpTitle(a, b)
    })
}

// Restore a previously-removed item (undo of an individual per-row remove). Folds
// the item back source-aware: merges its sources into a matching (name+unit) row
// if one reappeared, else re-adds the row. Counterpart to removeItem.
export function restoreItem(list, item) {
    if (!item || typeof item.name !== 'string' || item.name.trim() === '') return list
    const sources = Array.isArray(item.sources) ? item.sources : []
    const key = keyOf(item)
    const idx = list.findIndex(it => keyOf(it) === key)
    if (idx === -1) {
        return [...list, recompute({
            id: typeof item.id === 'string' && item.id ? item.id : makeId(),
            name: item.name.trim(),
            unit: item.unit ?? null,
            quantity: null,
            notes: null,
            sources: sources.slice(),
        })]
    }
    const merged = { ...list[idx], sources: [...list[idx].sources, ...sources] }
    const next = list.slice()
    next[idx] = recompute(merged)
    return next
}

// Classify a removed recipe's contribution against the post-removal list, for the
// "1 removed · 1 reduced" summary in the undo toast: an ingredient still present
// (by name+unit) was a shared row that got reduced; one that's gone was removed
// outright. Returns name lists in contribution order.
export function summarizeContribution(contribution, listAfter) {
    const present = new Set((listAfter || []).map(keyOf))
    const removed = []
    const reduced = []
    for (const c of contribution || []) {
        if (present.has(keyOf(c))) reduced.push(c.name)
        else removed.push(c.name)
    }
    return { removed, reduced }
}

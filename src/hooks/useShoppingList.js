import { useState, useEffect, useCallback } from 'react'

// Stage N+2a — the persistent shopping list store. Backed by localStorage so
// the list survives reload, tab close, and anon -> signed-in transitions: a
// shopping list is the device's, not the session's, because shopping happens
// out-of-app (the phone goes to the store). Mirrors useFridgeBasket's posture
// (read-initial / write-through useEffect / functional setState / try-catch for
// private-mode Safari) so the two client-side stores read the same way.
//
// API:
//   const { items, addItems, removeItem, clearList } = useShoppingList()
//
//   items: ShoppingItem[] — in insertion order, where
//     ShoppingItem = { id, name, unit, quantity, notes }
//       id:       stable string for React keys + removal
//       name:     display name (required, non-empty)
//       unit:     string | null  (e.g. "cups", "g", or null for countables)
//       quantity: number | null  (already scaled by the servings multiplier at
//                                 send time; null when the source had no qty)
//       notes:    string | null  (Stage 7 per-ingredient note, buy-time advice)
//
//   addItems(newItems): void — batch-add a recipe's worth of ingredients.
//     Dedupes against the existing list AND within the batch by (name + unit),
//     summing quantities when both are numeric. See mergeItem below for the
//     full rule.
//   removeItem(id): void
//   clearList(): void
//
// Scope note: which items are *checked off* is deliberately NOT stored here.
// Per the roadmap that state is kitchen-session-scoped (like Stage 7's step
// checklists), so it lives as local state in the shopping-list page and resets
// when the session ends. This hook only owns the durable "what to buy" list.
const STORAGE_KEY = 'cookbook.shoppingList'

function normalize(raw) {
    if (typeof raw !== 'string') return ''
    return raw.trim().toLowerCase()
}

// Match key for dedupe: same name AND same unit. We only sum quantities when
// units agree — "2 cups flour" + "1 cup flour" sums to "3 cups flour", but
// "2 cups flour" + "200 g flour" cannot be summed without a unit-conversion
// table that doesn't exist (and no canonical ingredient taxonomy exists yet —
// see Stage 18 edge-case (b)). Mismatched units stay as separate rows so the
// list never silently invents a wrong total.
function keyOf(item) {
    return normalize(item.name) + '|' + normalize(item.unit)
}

function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `sl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

// Fold one incoming item into the working list, merging into a matching row
// when one exists. Both quantities numeric -> sum; otherwise keep whichever
// quantity is present (a null qty contributes nothing). Notes fill an empty
// slot but never overwrite an existing note (first note wins — we can't know
// which substitution advice the cook prefers, so we don't clobber).
function mergeItem(list, incoming) {
    const name = typeof incoming.name === 'string' ? incoming.name.trim() : ''
    if (!name) return list

    const unit = incoming.unit != null && String(incoming.unit).trim() !== ''
        ? String(incoming.unit).trim()
        : null
    const quantity = typeof incoming.quantity === 'number' && !Number.isNaN(incoming.quantity)
        ? incoming.quantity
        : null
    const notes = incoming.notes != null && String(incoming.notes).trim() !== ''
        ? String(incoming.notes).trim()
        : null

    const candidate = { id: makeId(), name, unit, quantity, notes }
    const key = keyOf(candidate)
    const idx = list.findIndex(it => keyOf(it) === key)

    if (idx === -1) return [...list, candidate]

    const existing = list[idx]
    const mergedQty = existing.quantity != null && candidate.quantity != null
        ? parseFloat((existing.quantity + candidate.quantity).toFixed(2))
        : (existing.quantity != null ? existing.quantity : candidate.quantity)
    const merged = {
        ...existing,
        quantity: mergedQty,
        notes: existing.notes || candidate.notes,
    }
    const next = list.slice()
    next[idx] = merged
    return next
}

function readInitial() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        // Re-validate each row so a hand-edited / corrupted payload can't crash
        // the page. Drop anything without a usable name; coerce the rest.
        return parsed
            .filter(it => it && typeof it === 'object' && typeof it.name === 'string' && it.name.trim() !== '')
            .map(it => ({
                id: typeof it.id === 'string' && it.id ? it.id : makeId(),
                name: it.name.trim(),
                unit: it.unit != null && String(it.unit).trim() !== '' ? String(it.unit).trim() : null,
                quantity: typeof it.quantity === 'number' && !Number.isNaN(it.quantity) ? it.quantity : null,
                notes: it.notes != null && String(it.notes).trim() !== '' ? String(it.notes).trim() : null,
            }))
    } catch {
        return []
    }
}

export function useShoppingList() {
    const [items, setItems] = useState(readInitial)

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
        } catch {
            // Storage full / disabled / private-mode Safari — silently drop.
            // The list still works in-memory for the current session; only
            // cross-session persistence is lost.
        }
    }, [items])

    const addItems = useCallback((newItems) => {
        if (!Array.isArray(newItems) || newItems.length === 0) return
        setItems(prev => newItems.reduce(mergeItem, prev))
    }, [])

    const removeItem = useCallback((id) => {
        setItems(prev => prev.filter(it => it.id !== id))
    }, [])

    const clearList = useCallback(() => setItems([]), [])

    return { items, addItems, removeItem, clearList }
}

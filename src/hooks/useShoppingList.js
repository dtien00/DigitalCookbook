import { useState, useEffect, useRef, useCallback } from 'react'
import {
    addRecipe as addRecipeToList,
    removeItem as removeItemFromList,
    removeRecipe as removeRecipeFromList,
    restoreItem as restoreItemToList,
    summarizeContribution,
    normalizeStored,
    makeId,
} from '../lib/shoppingListCore'

// Stage N+2a / N+2c — the persistent shopping list store. localStorage-backed so
// the list survives reload, tab close, and the anon -> signed-in transition: a
// shopping list is the device's, not the session's (the phone goes to the
// store). Mirrors useFridgeBasket's posture (read-initial / write-through
// useEffect / try-catch for private-mode Safari).
//
// N+2c made each item carry provenance — `sources: Source[]`, one per recipe
// that contributed it — so a single recipe can be pulled back out (keeping
// ingredients other recipes still need). PR #66 makes every removal undoable: a
// capped `recentlyRemoved` stack (also persisted) records each individual-item
// or whole-recipe removal so it can be restored. The merge / removal / restore
// arithmetic lives in ../lib/shoppingListCore (pure, testable).
//
// API:
//   const { items, addRecipe, removeItem, removeRecipe,
//           recentlyRemoved, restoreRemoved, dismissRemoved, clearList } = useShoppingList()
//     removeItem(id):         drop one row; returns an undo entry (or null)
//     removeRecipe(recipeId): drop one recipe's contribution (shared rows kept +
//                             reduced); returns an undo entry with a removed/
//                             reduced summary (or null)
//     recentlyRemoved:        RemovedEntry[] newest-first, capped, persisted
//       RemovedEntry = { id, type: 'item'|'recipe', removedAt, ... }
//     restoreRemoved(entryId): undo — re-folds the item / re-adds the recipe
//     dismissRemoved(entryId): drop an undo entry without restoring
//     clearList():            empty the list AND the undo stack
//
// Scope note: *checked-off* state is NOT stored here — it's kitchen-session state
// owned by the page. This hook owns the durable "what to buy" + its undo stack.
const STORAGE_KEY = 'cookbook.shoppingList'
const REMOVED_KEY = 'cookbook.shoppingList.removed'
const REMOVED_CAP = 10 // keep only the last N undoable removals

function readInitial() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        return normalizeStored(JSON.parse(raw))
    } catch {
        return []
    }
}

function readRemoved() {
    try {
        const raw = window.localStorage.getItem(REMOVED_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed
            .filter(e => e && typeof e === 'object' && typeof e.id === 'string'
                && (e.type === 'item' || e.type === 'recipe'))
            .slice(0, REMOVED_CAP)
    } catch {
        return []
    }
}

export function useShoppingList() {
    const [items, setItems] = useState(readInitial)
    const [recentlyRemoved, setRecentlyRemoved] = useState(readRemoved)

    // Refs mirror the latest state (updated during render) so the action
    // callbacks can stay stable (empty deps) yet always read current values —
    // no stale closures, and the remove handlers can return the new undo entry.
    const itemsRef = useRef(items)
    itemsRef.current = items
    const removedRef = useRef(recentlyRemoved)
    removedRef.current = recentlyRemoved

    useEffect(() => {
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch { /* private mode */ }
    }, [items])

    useEffect(() => {
        try { window.localStorage.setItem(REMOVED_KEY, JSON.stringify(recentlyRemoved)) } catch { /* private mode */ }
    }, [recentlyRemoved])

    // Auto-prune a recipe undo-entry once that recipe is back on the list (e.g.
    // re-sent), so an undo can't double-apply a contribution you already have.
    useEffect(() => {
        setRecentlyRemoved(prev => {
            if (prev.length === 0) return prev
            const live = new Set()
            for (const it of items) for (const s of (it.sources || [])) {
                if (s.recipeId != null) live.add(s.recipeId)
            }
            const next = prev.filter(e => !(e.type === 'recipe' && live.has(e.recipeId)))
            return next.length === prev.length ? prev : next
        })
    }, [items])

    const addRecipe = useCallback((recipeId, recipeTitle, newItems) => {
        if (!Array.isArray(newItems) || newItems.length === 0) return
        setItems(prev => addRecipeToList(prev, recipeId, recipeTitle, newItems))
    }, [])

    const pushRemoved = (entry) => setRecentlyRemoved(prev => [entry, ...prev].slice(0, REMOVED_CAP))

    const removeItem = useCallback((id) => {
        const { list, removed } = removeItemFromList(itemsRef.current, id)
        if (!removed) return null
        const entry = { id: makeId(), type: 'item', removedAt: Date.now(), item: removed }
        setItems(list)
        pushRemoved(entry)
        return entry
    }, [])

    const removeRecipe = useCallback((recipeId) => {
        const { list, removed } = removeRecipeFromList(itemsRef.current, recipeId)
        if (!removed) return null
        const entry = {
            id: makeId(),
            type: 'recipe',
            removedAt: Date.now(),
            recipeId: removed.recipeId,
            recipeTitle: removed.recipeTitle,
            contribution: removed.contribution,
            addedAt: removed.addedAt,
            summary: summarizeContribution(removed.contribution, list),
        }
        setItems(list)
        pushRemoved(entry)
        return entry
    }, [])

    const restoreRemoved = useCallback((entryId) => {
        const entry = removedRef.current.find(e => e.id === entryId)
        if (!entry) return
        setItems(prev => entry.type === 'recipe'
            ? addRecipeToList(prev, entry.recipeId, entry.recipeTitle, entry.contribution)
            : restoreItemToList(prev, entry.item))
        setRecentlyRemoved(prev => prev.filter(e => e.id !== entryId))
    }, [])

    const dismissRemoved = useCallback((entryId) => {
        setRecentlyRemoved(prev => prev.filter(e => e.id !== entryId))
    }, [])

    const clearList = useCallback(() => {
        setItems([])
        setRecentlyRemoved([])
    }, [])

    return {
        items,
        addRecipe,
        removeItem,
        removeRecipe,
        recentlyRemoved,
        restoreRemoved,
        dismissRemoved,
        clearList,
    }
}

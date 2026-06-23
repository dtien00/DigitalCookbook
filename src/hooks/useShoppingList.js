import { useState, useEffect, useCallback } from 'react'
import {
    addRecipe as addRecipeToList,
    removeItem as removeItemFromList,
    removeRecipe as removeRecipeFromList,
    normalizeStored,
} from '../lib/shoppingListCore'

// Stage N+2a / N+2c — the persistent shopping list store. localStorage-backed so
// the list survives reload, tab close, and the anon -> signed-in transition: a
// shopping list is the device's, not the session's (the phone goes to the
// store). Mirrors useFridgeBasket's posture (read-initial / write-through
// useEffect / functional setState / try-catch for private-mode Safari).
//
// N+2c made each item carry provenance — `sources: Source[]`, one per recipe
// that contributed it — so the list knows which recipes built it and a single
// recipe can be pulled back out (keeping ingredients other recipes still need).
// The merge / removal arithmetic lives in ../lib/shoppingListCore (pure,
// testable); this hook is just the localStorage + setState glue.
//
// API:
//   const { items, addRecipe, removeItem, removeRecipe, clearList } = useShoppingList()
//     items: ShoppingItem[] in insertion order, where
//       ShoppingItem = { id, name, unit, quantity, notes, sources }
//       (quantity + notes are derived from sources; see shoppingListCore)
//     addRecipe(recipeId, recipeTitle, items): batch-add a recipe's worth of
//       ingredients, tagging each with provenance. Re-sending the same recipeId
//       replaces its prior contribution (no double-count).
//     removeItem(id):         drop one row (user override, ignores provenance)
//     removeRecipe(recipeId): drop one recipe's contribution, keeping shared rows
//     clearList():            empty everything
//
// Scope note: which items are *checked off* is deliberately NOT stored here —
// it's kitchen-session state (like Stage 7's step checklists), owned by the page
// and reset when the session ends. This hook owns only the durable "what to buy".
const STORAGE_KEY = 'cookbook.shoppingList'

function readInitial() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        return normalizeStored(JSON.parse(raw))
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
            // Storage full / disabled / private-mode Safari — silently drop. The
            // list still works in-memory for the session; only cross-session
            // persistence is lost.
        }
    }, [items])

    const addRecipe = useCallback((recipeId, recipeTitle, newItems) => {
        if (!Array.isArray(newItems) || newItems.length === 0) return
        setItems(prev => addRecipeToList(prev, recipeId, recipeTitle, newItems))
    }, [])

    const removeItem = useCallback((id) => {
        setItems(prev => removeItemFromList(prev, id).list)
    }, [])

    const removeRecipe = useCallback((recipeId) => {
        setItems(prev => removeRecipeFromList(prev, recipeId).list)
    }, [])

    const clearList = useCallback(() => setItems([]), [])

    return { items, addRecipe, removeItem, removeRecipe, clearList }
}

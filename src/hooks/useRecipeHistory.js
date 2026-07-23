import { useState, useEffect, useCallback } from 'react'

// Recently-viewed recipe breadcrumbs, backed by sessionStorage so the list
// models a single browsing session rather than a persistent inventory. This
// matches the lifetime already chosen for `lastViewedRecipeId` (App.jsx):
// survives back-button hops and route changes, resets when the tab closes.
// (Contrast useFridgeBasket / useShoppingList, which use localStorage because
// those are deliberately-built lists the user expects to keep.)
//
// API:
//   const { history, pushRecipe, clearHistory } = useRecipeHistory()
//
//   history: Entry[]           — most-recent first
//   pushRecipe(recipe): void   — snapshot + move-to-top (dedupe by id)
//   clearHistory(): void
//
// Each entry is a lightweight SNAPSHOT — { id, title, image_url, tags } — not
// just an id. A recently-viewed recipe is frequently paged out of App's
// loaded `recipes` array (deep link, or scrolled past), so storing only the
// id would force a fetch to render each drawer row. RecipeDetailRoute already
// holds the full recipe object when it records the view, so we snapshot the
// four display fields there and the drawer renders with zero network.
const STORAGE_KEY = 'cookbook.recipeHistory'

// Cap the list so sessionStorage and the drawer stay bounded. 15 is well past
// what anyone scrolls back through in one session; the oldest entry drops off
// the tail on the next push.
const MAX_ENTRIES = 15

function readInitial() {
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        // Defensive: keep only well-formed entries (an id is the minimum a
        // row needs to be navigable).
        return parsed
            .filter(x => x && typeof x === 'object' && typeof x.id === 'string')
            .slice(0, MAX_ENTRIES)
    } catch {
        return []
    }
}

// Reduce a full recipe object to the fields the drawer renders. Tags are
// truncated to the two the row shows so we don't persist arbitrarily long
// arrays. Returns null for anything without an id (nothing to navigate to).
function toSnapshot(recipe) {
    if (!recipe || typeof recipe.id !== 'string') return null
    return {
        id: recipe.id,
        title: recipe.title ?? '',
        image_url: recipe.image_url ?? null,
        tags: Array.isArray(recipe.tags) ? recipe.tags.slice(0, 2) : [],
    }
}

export function useRecipeHistory() {
    const [history, setHistory] = useState(readInitial)

    useEffect(() => {
        try {
            window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history))
        } catch {
            // Storage full / disabled / private-mode Safari — silently drop.
            // History still works in-memory for the current page; only
            // cross-navigation persistence within the session is lost.
        }
    }, [history])

    const pushRecipe = useCallback((recipe) => {
        const entry = toSnapshot(recipe)
        if (!entry) return
        setHistory(prev => {
            // Move-to-top on re-view: drop any existing entry for this id,
            // then unshift the fresh snapshot and cap the tail.
            const withoutDupe = prev.filter(x => x.id !== entry.id)
            return [entry, ...withoutDupe].slice(0, MAX_ENTRIES)
        })
    }, [])

    const clearHistory = useCallback(() => setHistory([]), [])

    return { history, pushRecipe, clearHistory }
}

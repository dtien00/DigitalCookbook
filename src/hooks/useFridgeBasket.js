import { useState, useEffect, useCallback } from 'react'

// Persistent "what's in my fridge" ingredient list, backed by localStorage so
// the basket models a real-world inventory rather than a session-scoped
// scratch pad. Survives reload, tab close, and anon -> signed-in transitions
// (the basket is the user's, not the session's).
//
// API:
//   const { basket, addIngredient, removeIngredient, clearBasket } = useFridgeBasket()
//
//   basket: string[] — normalized tokens in insertion order
//   addIngredient(raw): boolean — returns false if input is empty after trim
//   removeIngredient(value): void
//   clearBasket(): void
//
// Normalization (trim + lowercase) happens at the boundary so consumers can
// hand raw input straight from a form. Deduplication on add. No item cap;
// the modal's chip container scrolls if the basket grows long.
//
// Stage 10 scope: this hook only manages the list. Filtering recipes by
// basket contents lands in the next item under the same stage.
const STORAGE_KEY = 'cookbook.fridgeBasket'

function normalize(raw) {
    if (typeof raw !== 'string') return ''
    return raw.trim().toLowerCase()
}

function readInitial() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter(x => typeof x === 'string' && x.length > 0)
    } catch {
        return []
    }
}

export function useFridgeBasket() {
    const [basket, setBasket] = useState(readInitial)

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(basket))
        } catch {
            // Storage full / disabled / private-mode Safari — silently drop.
            // The basket still works in-memory for the current page; only
            // cross-session persistence is lost.
        }
    }, [basket])

    const addIngredient = useCallback((raw) => {
        const value = normalize(raw)
        if (!value) return false
        setBasket(prev => prev.includes(value) ? prev : [...prev, value])
        return true
    }, [])

    const removeIngredient = useCallback((value) => {
        setBasket(prev => prev.filter(x => x !== value))
    }, [])

    const clearBasket = useCallback(() => setBasket([]), [])

    return { basket, addIngredient, removeIngredient, clearBasket }
}

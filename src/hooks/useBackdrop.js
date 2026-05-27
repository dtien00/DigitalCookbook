import { useState, useEffect, useCallback } from 'react'

// Stage 14 item 3 — page backdrop preference.
//
// Persistence: localStorage. Anon visitors also browse the home grid and
// benefit from the choice, so a per-user `profiles.backdrop_preference`
// column would force a "must be signed in to pick a backdrop" UX that
// doesn't fit. Upgrade path to a profiles column (for cross-device sync)
// stays open — only the hook's internals change.
//
// The hook writes `data-backdrop="..."` on <html> so CSS overrides in
// index.css can swap the .paper-grain treatment without touching JSX at
// the consumer surfaces (HomeView, ProfileBookSpread, RecipeDetail,
// AuthorProfile, FridgeBasket all already render .paper-grain at their
// root). Default is the rustic paper-grain — written explicitly to the
// attribute so the active-state UI lights up the correct swatch.
const STORAGE_KEY = 'cookbook.backdrop'

export const BACKDROPS = [
    {
        id: 'paper',
        label: 'Rustic paper',
        description: 'Cream cookbook page with a soft grain.',
    },
    {
        id: 'wood',
        label: 'Wood library',
        description: 'Warm oak grain — like a kitchen-shelf cookbook.',
    },
    {
        id: 'cabinet',
        label: 'Kitchen cabinet',
        description: 'Cool brushed-steel surface, modern utility.',
    },
    {
        id: 'notepad',
        label: 'Restaurant notepad',
        description: 'Yellow ruled pad with kitchen-line creases.',
    },
    {
        id: 'digital',
        label: 'Digital space',
        description: 'Flat slate — minimal, late-night kitchen vibe.',
    },
]

const VALID_IDS = new Set(BACKDROPS.map(b => b.id))
const DEFAULT_ID = 'paper'

function readInitial() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        return VALID_IDS.has(raw) ? raw : DEFAULT_ID
    } catch {
        return DEFAULT_ID
    }
}

export function useBackdrop() {
    const [backdrop, setBackdrop] = useState(readInitial)

    useEffect(() => {
        document.documentElement.dataset.backdrop = backdrop
        try {
            window.localStorage.setItem(STORAGE_KEY, backdrop)
        } catch {
            // localStorage may throw in private-mode Safari / strict CSP. The
            // attribute is still applied so the current session works.
        }
    }, [backdrop])

    const chooseBackdrop = useCallback((id) => {
        if (VALID_IDS.has(id)) setBackdrop(id)
    }, [])

    return { backdrop, chooseBackdrop }
}

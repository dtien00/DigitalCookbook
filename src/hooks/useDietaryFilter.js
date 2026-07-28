import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

// Stage N — the home-grid allergen/dietary filter selection, backed by
// localStorage (`cookbook.dietaryFilter`). Two independent slug lists over the
// canonical vocab in src/lib/dietaryTags.js:
//
//   excludedAllergens — hide recipes whose `allergens` overlap this list
//   requiredDietary   — keep only recipes whose `dietary` contains all of this
//
// They filter in opposite directions (exclude-any vs. require-all), which is
// exactly why the schema keeps them in separate columns (migration 025).
//
// API:
//   const {
//     excludedAllergens, requiredDietary,
//     toggleAllergen, toggleDietary, clearDietaryFilter, dietaryFilterActive,
//   } = useDietaryFilter()
//
// Persistence is dual:
//   - localStorage (`cookbook.dietaryFilter`) always — durable for anon users
//     and covers the pre-hydration render before a profile read resolves.
//   - For signed-in users, the profile columns are the cross-device source of
//     truth: on sign-in we PRE-POPULATE from profiles.allergen_exclusions /
//     dietary_requirements (if set), and WRITE THROUGH on every change. These
//     two halves are inseparable, so they ship together (Stage N item 3).
//
// Ordering guard: the write-through must not fire until the profile read has
// resolved, or a fresh mount would clobber saved prefs with the (possibly
// empty) localStorage state before we've read them. `hydratedRef` gates it.
const STORAGE_KEY = 'cookbook.dietaryFilter'

const EMPTY = { excludedAllergens: [], requiredDietary: [] }

function cleanSlugs(a) {
    return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.length > 0) : []
}

function readInitial() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return EMPTY
        const parsed = JSON.parse(raw)
        return {
            excludedAllergens: cleanSlugs(parsed?.excludedAllergens),
            requiredDietary: cleanSlugs(parsed?.requiredDietary),
        }
    } catch {
        return EMPTY
    }
}

// Flip a slug in one of the two lists. Functional so rapid taps don't race a
// stale array; returns a fresh object so the localStorage effect fires.
function toggleIn(prev, key, value) {
    const list = prev[key]
    return {
        ...prev,
        [key]: list.includes(value) ? list.filter(v => v !== value) : [...list, value],
    }
}

export function useDietaryFilter(userId) {
    const [filter, setFilter] = useState(readInitial)
    // Gates the profile write-through: false until we've either read the
    // profile (signed-in) or confirmed there's no user (anon). Prevents a
    // mount-time write from clobbering saved prefs before they're read.
    const hydratedRef = useRef(false)

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filter))
        } catch {
            // Storage full / disabled / private-mode Safari — drop silently.
            // The filter still works in-memory for the current page; only
            // cross-session persistence is lost.
        }
    }, [filter])

    // Pre-populate from the profile on sign-in. Profile prefs, when present,
    // win over localStorage (they're the cross-device source of truth). When
    // the profile is empty we keep the current (localStorage) selection and
    // let the write-through below push it up on the next change.
    useEffect(() => {
        if (!userId) {
            hydratedRef.current = true
            return
        }
        let cancelled = false
        hydratedRef.current = false
        supabase
            .from('profiles')
            .select('allergen_exclusions, dietary_requirements')
            .eq('id', userId)
            .maybeSingle()
            .then(({ data }) => {
                if (cancelled) return
                const excluded = cleanSlugs(data?.allergen_exclusions)
                const required = cleanSlugs(data?.dietary_requirements)
                if (excluded.length > 0 || required.length > 0) {
                    setFilter({ excludedAllergens: excluded, requiredDietary: required })
                }
                hydratedRef.current = true
            })
        return () => { cancelled = true }
    }, [userId])

    // Write through to the profile on every change, once hydrated. Idempotent
    // (the seed re-writes identical data at worst). Owner-only UPDATE policy
    // (migration 025) authorizes it; the migration-010 trigger only guards
    // is_admin, so these columns write freely for their owner.
    useEffect(() => {
        if (!userId || !hydratedRef.current) return
        supabase
            .from('profiles')
            .update({
                allergen_exclusions: filter.excludedAllergens,
                dietary_requirements: filter.requiredDietary,
            })
            .eq('id', userId)
            .then(({ error }) => {
                if (error) console.error('Failed to save dietary filter prefs:', error.message)
            })
    }, [filter, userId])

    const toggleAllergen = useCallback((value) => {
        setFilter(prev => toggleIn(prev, 'excludedAllergens', value))
    }, [])

    const toggleDietary = useCallback((value) => {
        setFilter(prev => toggleIn(prev, 'requiredDietary', value))
    }, [])

    const clearDietaryFilter = useCallback(() => setFilter(EMPTY), [])

    const dietaryFilterActive =
        filter.excludedAllergens.length > 0 || filter.requiredDietary.length > 0

    return {
        excludedAllergens: filter.excludedAllergens,
        requiredDietary: filter.requiredDietary,
        toggleAllergen,
        toggleDietary,
        clearDietaryFilter,
        dietaryFilterActive,
    }
}

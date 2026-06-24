import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'

// Meal-plan entries for one user, scoped to a single week. Each cell is a
// (plan_date, slot) pair holding at most one recipe — backed by the UNIQUE
// (user_id, plan_date, slot) constraint in migration 021, so "drop a recipe
// on a cell" is an upsert that REPLACES whatever was there rather than
// stacking a duplicate.
//
// Entries are keyed `${plan_date}|${slot}` for O(1) cell lookup while
// rendering the grid. The recipe title is joined at fetch time for display;
// an optimistic add stitches the picked recipe straight into the map so the
// cell fills instantly, then patches in the real row id once the write
// returns. Same optimistic-with-rollback posture as useFavorites.
//
// Scoped to one week (weekStartISO..weekEndISO inclusive) so the query stays
// small regardless of how long the user has been planning. Refetches when the
// user navigates to a different week.
//
// Anonymous (no userId) → empty map + no-op mutators. The /plan route is
// already session-gated in App.jsx; this is just belt-and-suspenders.
export function useMealPlan(userId, weekStartISO, weekEndISO) {
    const [entries, setEntries] = useState(() => new Map())
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!userId) {
            setEntries(new Map())
            setLoading(false)
            return
        }

        let active = true
        setLoading(true)

        ;(async () => {
            const { data, error } = await supabase
                .from('meal_plans')
                .select('id, plan_date, slot, recipe:recipes(id, title)')
                .eq('user_id', userId)
                .gte('plan_date', weekStartISO)
                .lte('plan_date', weekEndISO)

            if (!active) return

            if (error) {
                console.error('Failed to fetch meal plan:', error.message)
                setEntries(new Map())
            } else {
                const next = new Map()
                ;(data || []).forEach(row => {
                    next.set(`${row.plan_date}|${row.slot}`, { id: row.id, recipe: row.recipe })
                })
                setEntries(next)
            }
            setLoading(false)
        })()

        return () => { active = false }
    }, [userId, weekStartISO, weekEndISO])

    const getEntry = useCallback(
        (date, slot) => entries.get(`${date}|${slot}`) || null,
        [entries]
    )

    // Assign (or replace) the recipe in a cell. Upserts on the unique
    // (user_id, plan_date, slot) key so re-dropping onto an occupied cell
    // overwrites it instead of erroring on the constraint.
    const addEntry = useCallback(async (date, slot, recipe) => {
        if (!userId) return
        const key = `${date}|${slot}`
        const prev = entries.get(key) || null

        // Optimistic: show the picked recipe immediately. Carry the prior
        // row id forward so a same-cell replace doesn't briefly look new.
        setEntries(p => {
            const next = new Map(p)
            next.set(key, { id: prev?.id, recipe: { id: recipe.id, title: recipe.title } })
            return next
        })

        try {
            const { data, error } = await supabase
                .from('meal_plans')
                .upsert(
                    { user_id: userId, plan_date: date, slot, recipe_id: recipe.id },
                    { onConflict: 'user_id,plan_date,slot' }
                )
                .select('id')
                .single()
            if (error) throw error
            // Patch the real row id in (needed by removeEntry's no-op guard
            // and any future id-based ops).
            setEntries(p => {
                const next = new Map(p)
                const cur = next.get(key)
                if (cur) next.set(key, { ...cur, id: data.id })
                return next
            })
        } catch (e) {
            console.error('Failed to add to meal plan:', e.message)
            toast.error('Could not add to plan: ' + e.message)
            setEntries(p => {
                const next = new Map(p)
                if (prev) next.set(key, prev)
                else next.delete(key)
                return next
            })
        }
    }, [userId, entries])

    // Clear a single cell.
    const removeEntry = useCallback(async (date, slot) => {
        if (!userId) return
        const key = `${date}|${slot}`
        const prev = entries.get(key) || null
        if (!prev) return

        setEntries(p => {
            const next = new Map(p)
            next.delete(key)
            return next
        })

        try {
            const { error } = await supabase
                .from('meal_plans')
                .delete()
                .eq('user_id', userId)
                .eq('plan_date', date)
                .eq('slot', slot)
            if (error) throw error
        } catch (e) {
            console.error('Failed to remove from meal plan:', e.message)
            toast.error('Could not remove from plan: ' + e.message)
            setEntries(p => {
                const next = new Map(p)
                next.set(key, prev)
                return next
            })
        }
    }, [userId, entries])

    return { entries, getEntry, addEntry, removeEntry, loading }
}

// Standalone upsert for the "Add to plan" affordance on recipe cards (home
// grid), which targets an arbitrary (date, slot) WITHOUT the /plan page's
// week-scoped state mounted. Same conflict target as the hook's addEntry, so
// it REPLACES an occupied cell rather than erroring on the unique constraint.
// The /plan page picks up the new row on its next fetch. Returns `{ error }`
// for the caller to toast.
export async function addRecipeToPlan(userId, dateISO, slot, recipeId) {
    if (!userId) return { error: new Error('Not signed in') }
    const { error } = await supabase
        .from('meal_plans')
        .upsert(
            { user_id: userId, plan_date: dateISO, slot, recipe_id: recipeId },
            { onConflict: 'user_id,plan_date,slot' }
        )
    return { error }
}

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

// Stage 16 item 1 — admin review feed for `reports`.
//
// Only fires for callers where `isAdmin` is true — the hook itself doesn't
// gate, the route does, but the network round-trip is wasted if not admin
// so we early-out at the effect level too.
//
// Status filter is part of the hook surface (not just the UI) because
// fetching all rows and filtering client-side scales poorly once volume
// picks up, and the (status, created_at DESC) covering index from
// migration 017 only helps if the WHERE clause uses the indexed column.
//
// Target hydration: reports.target_id is polymorphic — could point at a
// comment, recipe, or profile — so a single PostgREST embed isn't
// possible. Instead, after fetching reports, we batch-fetch each target
// type's referenced ids in parallel and merge the results onto each
// report row as `target` ({ kind, id, ...display fields, recipe_id? }).
// Three round-trips total regardless of report count.
//
// Status updates use the table directly (RLS migration 017 allows admin
// UPDATE on any row); the migration's BEFORE UPDATE trigger auto-stamps
// resolved_at + resolved_by so the client doesn't manage those fields.
export function useAdminReports(isAdmin, statusFilter = 'open') {
    const [reports, setReports] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const load = useCallback(async () => {
        if (!isAdmin) {
            setReports([])
            return
        }
        setLoading(true)
        setError(null)
        try {
            let q = supabase
                .from('reports')
                .select('*, reporter:profiles!reporter_id(id, username, full_name)')
                .order('created_at', { ascending: false })
            if (statusFilter !== 'all') q = q.eq('status', statusFilter)

            const { data: rows, error: reportsError } = await q
            if (reportsError) throw reportsError

            const hydrated = await hydrateTargets(rows || [])
            setReports(hydrated)
        } catch (err) {
            console.error('useAdminReports load failed:', err.message)
            setError(err)
        } finally {
            setLoading(false)
        }
    }, [isAdmin, statusFilter])

    useEffect(() => { load() }, [load])

    const updateStatus = useCallback(async (reportId, nextStatus) => {
        const prev = reports
        // Optimistic flip — drop the row if it no longer matches the filter,
        // otherwise stamp the new status in place.
        setReports(rs => rs
            .map(r => r.id === reportId ? { ...r, status: nextStatus } : r)
            .filter(r => statusFilter === 'all' || r.status === statusFilter)
        )
        try {
            const { error: updateError } = await supabase
                .from('reports')
                .update({ status: nextStatus })
                .eq('id', reportId)
            if (updateError) throw updateError
        } catch (err) {
            setReports(prev)
            throw err
        }
    }, [reports, statusFilter])

    const openCount = useCallback(async () => {
        const { count, error: countError } = await supabase
            .from('reports')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'open')
        if (countError) {
            console.error('openCount failed:', countError.message)
            return 0
        }
        return count || 0
    }, [])

    return { reports, loading, error, refetch: load, updateStatus, openCount }
}

// Batch-fetch the polymorphic targets and merge them onto each report row.
// Skip groups that have no entries — cheaper to early-out than fire an
// `in ([])` query.
async function hydrateTargets(rows) {
    const byType = { comment: [], recipe: [], profile: [] }
    rows.forEach(r => { byType[r.target_type]?.push(r.target_id) })

    const [commentMap, recipeMap, profileMap] = await Promise.all([
        byType.comment.length
            ? fetchById('comments', 'id, recipe_id, content, user_id', byType.comment)
            : Promise.resolve(new Map()),
        byType.recipe.length
            ? fetchById('recipes', 'id, title, author_id, is_public', byType.recipe)
            : Promise.resolve(new Map()),
        byType.profile.length
            ? fetchById('profiles', 'id, username, full_name', byType.profile)
            : Promise.resolve(new Map()),
    ])

    return rows.map(r => {
        const map = r.target_type === 'comment' ? commentMap
            : r.target_type === 'recipe' ? recipeMap
            : profileMap
        const hit = map.get(r.target_id)
        return { ...r, target: hit ? { kind: r.target_type, ...hit } : { kind: r.target_type, missing: true } }
    })
}

async function fetchById(table, select, ids) {
    const { data, error } = await supabase.from(table).select(select).in('id', ids)
    if (error) {
        console.error(`hydrateTargets(${table}) failed:`, error.message)
        return new Map()
    }
    return new Map((data || []).map(row => [row.id, row]))
}

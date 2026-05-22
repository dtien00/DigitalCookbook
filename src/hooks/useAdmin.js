import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

// Fetches the current user's is_admin flag and exposes it as a boolean.
// Returns false until the fetch resolves and for anonymous viewers. Kept
// deliberately small — the App threads `isAdmin` down to the components
// that actually render admin-only controls (RecipeDetail, Comments).
//
// API:
//   const { isAdmin, loading } = useAdmin(userId)
//
// Note: this is a *trust-but-verify* signal — every admin action is
// re-checked by the database via the `is_admin()` SQL helper inside
// RLS policies and SECURITY DEFINER RPCs. Faking `isAdmin = true` in
// the client just shows the buttons; the underlying writes still fail.
export function useAdmin(userId) {
    const [isAdmin, setIsAdmin] = useState(false)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!userId) {
            setIsAdmin(false)
            setLoading(false)
            return
        }
        let active = true
        setLoading(true)
        ;(async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('is_admin')
                .eq('id', userId)
                .single()
            if (!active) return
            if (error) {
                console.error('Failed to fetch admin flag:', error.message)
                setIsAdmin(false)
            } else {
                setIsAdmin(!!data?.is_admin)
            }
            setLoading(false)
        })()
        return () => { active = false }
    }, [userId])

    return { isAdmin, loading }
}

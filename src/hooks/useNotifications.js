import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

// Per-user notifications hook (Stage 11 item 2). Fetches the signed-in
// user's recent notifications and exposes an unread count + markers.
//
// Mounts at App level so the bell badge updates without per-render
// queries. RLS scopes the result to the caller (`auth.uid() = user_id`
// SELECT policy on notifications); no client-side author check needed.
//
// Server writes only — notifications has no INSERT policy; rows are
// produced by the `notify_followers_on_new_recipe` AFTER INSERT trigger
// on recipes. The hook never tries to write a row.
//
// API:
//   const { notifications, unreadCount, markRead, markAllRead, refetch, loading } = useNotifications(userId)
//
//   notifications: array of { id, kind, actor_id, recipe_id, created_at, read_at, actor, recipe }
//     `actor` is the joined profile (username, full_name); `recipe` is the
//     joined recipe (title). Either may be null if the underlying row was
//     deleted after the notification was created (cascade leaves the
//     notification row but nulls the FK target via ON DELETE CASCADE on
//     actor_id/recipe_id — actually CASCADE deletes the notification too,
//     so in practice these are always present today; the null guard is
//     defensive for future schema changes).
//
//   unreadCount: derived count of rows with read_at = null.
//
//   markRead(id): optimistic, rolls back on error. No-op for already-read.
//   markAllRead(): optimistic mass-update, rolls back on error.
//
// When userId is null (anonymous viewer), notifications stays empty and
// the mutators are no-ops. The bell UI should be hidden for anonymous
// users by its parent rather than relying on this hook to no-op.
export function useNotifications(userId) {
    const [notifications, setNotifications] = useState([])
    const [loading, setLoading] = useState(false)

    const refetch = useCallback(async () => {
        if (!userId) {
            setNotifications([])
            return
        }
        const { data, error } = await supabase
            .from('notifications')
            .select(`
                id, kind, actor_id, recipe_id, created_at, read_at,
                actor:profiles!actor_id(username, full_name),
                recipe:recipes!recipe_id(title)
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20)
        if (error) {
            // Likely cause: migration 012 hasn't been applied yet.
            console.error('Failed to fetch notifications:', error.message)
            return
        }
        setNotifications(data || [])
    }, [userId])

    useEffect(() => {
        if (!userId) {
            setNotifications([])
            setLoading(false)
            return
        }
        let active = true
        setLoading(true)
        ;(async () => {
            await refetch()
            if (active) setLoading(false)
        })()
        return () => { active = false }
    }, [userId, refetch])

    // Stage 20 §1.5 — refresh on tab-return. The fetch above runs once per
    // mount, so a session left open all day otherwise shows a permanently
    // stale bell. `visibilitychange` fires when the user switches back to the
    // tab — the moment they'd actually glance at the bell — so refetch then.
    // Only `visible` transitions trigger it (hidden ones are the leaving
    // moment, no point querying). Full Supabase realtime stays deferred; this
    // closes most of the gap for ~free (FABLE §1.5).
    useEffect(() => {
        if (!userId) return
        const onVisibility = () => {
            if (document.visibilityState === 'visible') refetch()
        }
        document.addEventListener('visibilitychange', onVisibility)
        return () => document.removeEventListener('visibilitychange', onVisibility)
    }, [userId, refetch])

    const unreadCount = notifications.reduce((n, row) => n + (row.read_at ? 0 : 1), 0)

    const markRead = useCallback(async (id) => {
        if (!userId) return
        const target = notifications.find(n => n.id === id)
        if (!target || target.read_at) return

        const now = new Date().toISOString()
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: now } : n))

        try {
            const { error } = await supabase
                .from('notifications')
                .update({ read_at: now })
                .eq('id', id)
                .eq('user_id', userId)
            if (error) throw error
        } catch (e) {
            console.error('Failed to mark notification read:', e.message)
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: null } : n))
        }
    }, [userId, notifications])

    const markAllRead = useCallback(async () => {
        if (!userId) return
        const unread = notifications.filter(n => !n.read_at)
        if (unread.length === 0) return

        const now = new Date().toISOString()
        const unreadIds = new Set(unread.map(n => n.id))

        setNotifications(prev => prev.map(n => unreadIds.has(n.id) ? { ...n, read_at: now } : n))

        try {
            const { error } = await supabase
                .from('notifications')
                .update({ read_at: now })
                .eq('user_id', userId)
                .is('read_at', null)
            if (error) throw error
        } catch (e) {
            console.error('Failed to mark all notifications read:', e.message)
            setNotifications(prev => prev.map(n => unreadIds.has(n.id) ? { ...n, read_at: null } : n))
        }
    }, [userId, notifications])

    return { notifications, unreadCount, markRead, markAllRead, refetch, loading }
}

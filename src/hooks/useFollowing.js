import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

// Bulk-fetches the current user's follow rows once and exposes O(1)
// membership + a notify-preference lookup + toggle / preference-set
// functions. Mirrors the useFavorites / useLikes pattern: lives at the
// App level so a future "you follow N of these N authors" hint on the
// grid doesn't need a per-author query.
//
// Each follow row carries a notify_on_new_recipe flag (Stage 11 item 2)
// so we store a Map<authorId, { notify: boolean }> rather than a Set —
// the extra structure lets callers render the notify toggle alongside
// the Follow button without a second query.
//
// API:
//   const { isFollowing, getNotifyPref, toggleFollow, setNotifyPref, loading } = useFollowing(userId)
//
//   isFollowing(authorId): boolean
//   getNotifyPref(authorId): boolean  // false when not following
//   toggleFollow(authorId): Promise<void>           // optimistic, rolls back on error
//   setNotifyPref(authorId, value): Promise<void>   // no-op when not following
//
// When userId is null/undefined (anonymous viewer), the hook returns an
// empty map and the mutators are no-ops. Callers gate the Follow button
// to prompt sign-in for anonymous users themselves.
//
// Note on policy: the DB CHECK constraint `follower_id <> following_id`
// blocks self-follow at the schema layer. Callers should still hide the
// Follow button on your own profile (UX) but no defensive check is
// needed here — a self-follow attempt would surface as a server error
// and roll back optimistically.
export function useFollowing(userId) {
    const [followMap, setFollowMap] = useState(() => new Map())
    const [loading, setLoading] = useState(false)

    const refetch = useCallback(async () => {
        if (!userId) {
            setFollowMap(new Map())
            return
        }
        const { data, error } = await supabase
            .from('follows')
            .select('following_id, notify_on_new_recipe')
            .eq('follower_id', userId)
        if (error) {
            console.error('Failed to fetch follows:', error.message)
            return
        }
        setFollowMap(new Map(data.map(f => [f.following_id, { notify: f.notify_on_new_recipe }])))
    }, [userId])

    useEffect(() => {
        if (!userId) {
            setFollowMap(new Map())
            setLoading(false)
            return
        }

        let active = true
        setLoading(true)

        ;(async () => {
            const { data, error } = await supabase
                .from('follows')
                .select('following_id, notify_on_new_recipe')
                .eq('follower_id', userId)

            if (!active) return

            if (error) {
                console.error('Failed to fetch follows:', error.message)
                setFollowMap(new Map())
            } else {
                setFollowMap(new Map(data.map(f => [f.following_id, { notify: f.notify_on_new_recipe }])))
            }
            setLoading(false)
        })()

        return () => { active = false }
    }, [userId])

    const isFollowing = useCallback(
        (authorId) => followMap.has(authorId),
        [followMap]
    )

    const getNotifyPref = useCallback(
        (authorId) => followMap.get(authorId)?.notify ?? false,
        [followMap]
    )

    const toggleFollow = useCallback(async (authorId) => {
        if (!userId || !authorId) return

        const wasFollowing = followMap.has(authorId)
        const priorNotify = followMap.get(authorId)?.notify ?? false

        setFollowMap(prev => {
            const next = new Map(prev)
            if (wasFollowing) next.delete(authorId)
            else next.set(authorId, { notify: false })
            return next
        })

        try {
            if (wasFollowing) {
                const { error } = await supabase
                    .from('follows')
                    .delete()
                    .eq('follower_id', userId)
                    .eq('following_id', authorId)
                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('follows')
                    .insert({ follower_id: userId, following_id: authorId })
                if (error) throw error
            }
        } catch (e) {
            console.error('Failed to toggle follow:', e.message)
            setFollowMap(prev => {
                const next = new Map(prev)
                if (wasFollowing) next.set(authorId, { notify: priorNotify })
                else next.delete(authorId)
                return next
            })
        }
    }, [userId, followMap])

    // Toggles notify_on_new_recipe on an EXISTING follow row. No-op when
    // not following — caller should follow first. Optimistic with
    // rollback on error.
    const setNotifyPref = useCallback(async (authorId, value) => {
        if (!userId || !authorId) return
        if (!followMap.has(authorId)) return

        const priorNotify = followMap.get(authorId).notify

        setFollowMap(prev => {
            const next = new Map(prev)
            next.set(authorId, { notify: value })
            return next
        })

        try {
            const { error } = await supabase
                .from('follows')
                .update({ notify_on_new_recipe: value })
                .eq('follower_id', userId)
                .eq('following_id', authorId)
            if (error) throw error
        } catch (e) {
            console.error('Failed to update notify preference:', e.message)
            setFollowMap(prev => {
                const next = new Map(prev)
                next.set(authorId, { notify: priorNotify })
                return next
            })
        }
    }, [userId, followMap])

    return { isFollowing, getNotifyPref, toggleFollow, setNotifyPref, refetch, loading }
}

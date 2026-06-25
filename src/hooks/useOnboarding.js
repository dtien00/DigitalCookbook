import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

// Drives the first-run onboarding tour (Stage M, item 2). Fetches the
// current user's onboarding_dismissed_at (migration 022) once per signed-in
// session and exposes whether the tour should show plus a dismiss() that
// persists the dismissal so it never shows again across re-logins or devices.
//
// Gate is column-only: the tour shows whenever the user has never dismissed
// it (onboarding_dismissed_at IS NULL). The "account < 24h old" framing from
// the original roadmap is intentionally dropped — once dismissal is tracked,
// "new user" collapses to "hasn't dismissed yet", which is simpler and lets
// the tour be re-triggered on any account by nulling the column.
//
// Anonymous viewers have no profile row, so the tour never applies — the hook
// short-circuits to showTour=false with no fetch. Mirrors the small-and-flat
// shape of useAdmin; the App threads `showTour` / `dismiss` down to the
// OnboardingTour overlay.
export function useOnboarding(userId) {
    const [showTour, setShowTour] = useState(false)

    useEffect(() => {
        if (!userId) {
            setShowTour(false)
            return
        }
        let active = true
        ;(async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('onboarding_dismissed_at')
                .eq('id', userId)
                .single()
            if (!active) return
            if (error) {
                console.error('Failed to fetch onboarding flag:', error.message)
                setShowTour(false)
            } else {
                // Show only when the user has never dismissed it. The fetch
                // resolves before showTour ever flips true, so there's no
                // first-paint flash of the tour for already-onboarded users.
                setShowTour(!data?.onboarding_dismissed_at)
            }
        })()
        return () => { active = false }
    }, [userId])

    const dismiss = async () => {
        // Hide immediately. This is a one-way nicety, so we deliberately do
        // NOT roll back on write failure — a failed write just means the tour
        // reappears on the next load, which is far less jarring than popping
        // it back up mid-session.
        setShowTour(false)
        if (!userId) return
        const { error } = await supabase
            .from('profiles')
            .update({ onboarding_dismissed_at: new Date().toISOString() })
            .eq('id', userId)
        if (error) console.error('Failed to persist onboarding dismissal:', error.message)
    }

    return { showTour, dismiss }
}

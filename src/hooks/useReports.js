import { useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

// Stage 16 item 1 — thin wrapper over the `reports` table.
//
// No bulk-fetch + cache pattern (cf. useFavorites / useLikes / useFollowing)
// because reports are write-mostly from the client side: a reporter files
// one and the UI doesn't need to look the list back up at App level.
// "Have I already reported this?" is intentionally NOT a client-side
// question — letting a reporter file multiple reports on the same target
// is fine (the admin sees them as separate rows with separate reasons,
// which is informative), and the spam-cap trigger on the server keeps
// abuse bounded.
//
// `submitReport` returns the inserted row (or throws). The caller is
// responsible for toast feedback so context-specific phrasing is possible
// ("Comment reported" vs "Recipe reported" vs "Author reported").
//
// Spam-cap surfacing: the migration-017 trigger raises with the prefix
// "reports_spam_cap:". We detect that prefix here and rewrap the error
// with a user-facing message; the caller can toast `error.message`
// without leaking the raw Postgres exception text.
export function useReports(session) {
    const userId = session?.user?.id ?? null

    const submitReport = useCallback(async ({ target_type, target_id, reason }) => {
        if (!userId) throw new Error('You must be signed in to report.')
        if (!target_type || !target_id) throw new Error('Missing report target.')
        const trimmed = (reason || '').trim()
        if (!trimmed) throw new Error('Please describe the issue.')
        if (trimmed.length > 1000) throw new Error('Reason is too long (1000 characters max).')

        const { data, error } = await supabase
            .from('reports')
            .insert({
                reporter_id: userId,
                target_type,
                target_id,
                reason: trimmed,
            })
            .select()
            .single()

        if (error) {
            if (error.message?.includes('reports_spam_cap')) {
                throw new Error('You have 10 open reports. Wait for admin review before filing more.')
            }
            throw error
        }

        return data
    }, [userId])

    return { submitReport }
}

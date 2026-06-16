import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

// Stage 16 item 2 — TOTP MFA primitives.
//
// Wraps supabase.auth.mfa with the three things every consumer needs:
//   1. listFactors result  → which verified factors are on the account
//   2. AAL                 → currentLevel / nextLevel for gating
//   3. action callbacks    → enroll / challenge+verify / unenroll
//
// Microsoft Authenticator, Google Authenticator, Authy etc. are all
// RFC 6238 TOTP apps — the user scans the QR from any of them. Supabase
// returns totp.qr_code as an SVG string ready to render, so no QR
// library is needed on our side.
//
// AAL note: after a fresh email/password login, a user with a verified
// TOTP factor has session AAL = aal1 but nextLevel = aal2 — they must
// challenge + verify with a code from their authenticator to elevate.
// Admin moderation gates on currentLevel === 'aal2'.
export function useMfa(userId) {
    const [factors, setFactors] = useState([])      // verified TOTP factors only
    const [allFactors, setAllFactors] = useState([]) // includes unverified (for cleanup)
    const [aal, setAal] = useState({ currentLevel: null, nextLevel: null })
    const [loading, setLoading] = useState(false)

    const refetch = useCallback(async () => {
        if (!userId) {
            setFactors([])
            setAllFactors([])
            setAal({ currentLevel: null, nextLevel: null })
            return
        }
        setLoading(true)
        try {
            const [factorsRes, aalRes] = await Promise.all([
                supabase.auth.mfa.listFactors(),
                supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
            ])
            if (factorsRes.error) throw factorsRes.error
            if (aalRes.error) throw aalRes.error
            const all = factorsRes.data?.totp ?? []
            setAllFactors(all)
            setFactors(all.filter(f => f.status === 'verified'))
            setAal({
                currentLevel: aalRes.data?.currentLevel ?? null,
                nextLevel: aalRes.data?.nextLevel ?? null,
            })
        } catch (error) {
            console.error('useMfa refetch failed:', error.message)
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => {
        refetch()
    }, [refetch])

    // Re-fetch when the session changes — the verify call updates the JWT
    // (AAL is encoded in the token), so we need fresh data after enroll or
    // unenroll. onAuthStateChange fires on TOKEN_REFRESHED / SIGNED_IN /
    // SIGNED_OUT, all of which can shift our AAL or factor list.
    useEffect(() => {
        if (!userId) return
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                refetch()
            }
        })
        return () => subscription.unsubscribe()
    }, [userId, refetch])

    // Begin TOTP enrollment. Returns { factorId, qrCodeSvg, secret, uri }
    // for the dialog to render. The factor is created in 'unverified' state
    // — caller MUST either verify it or clean it up so stale factors don't
    // pile up on the account.
    //
    // Defensive cleanup first: Supabase rejects new enrollments when an
    // unverified factor with the same friendly_name already exists (the
    // server returns a generic "Unexpected failure"). Cancelled-dialog
    // unenroll is fire-and-forget so a rapid re-open can collide; sweep
    // any lingering unverified TOTP factors here to make enrollment
    // idempotent from the dialog's perspective.
    const beginEnrollment = useCallback(async (friendlyName) => {
        const listRes = await supabase.auth.mfa.listFactors()
        if (!listRes.error) {
            const stale = (listRes.data?.all || []).filter(
                f => f.factor_type === 'totp' && f.status === 'unverified'
            )
            await Promise.all(
                stale.map(f => supabase.auth.mfa.unenroll({ factorId: f.id }))
            )
        }
        const { data, error } = await supabase.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName: friendlyName || 'Authenticator',
        })
        if (error) throw error
        return {
            factorId: data.id,
            qrCodeSvg: data.totp.qr_code,
            secret: data.totp.secret,
            uri: data.totp.uri,
        }
    }, [])

    // Verify a 6-digit code against a just-enrolled or existing factor.
    // On success, the session is elevated to AAL2 and refetch() pulls
    // the new AAL state. Both code paths (post-enrollment and re-auth
    // challenge) share this — Supabase's challenge + verify pattern is
    // the same shape regardless of factor age.
    const verifyCode = useCallback(async (factorId, code) => {
        const challengeRes = await supabase.auth.mfa.challenge({ factorId })
        if (challengeRes.error) throw challengeRes.error
        const verifyRes = await supabase.auth.mfa.verify({
            factorId,
            challengeId: challengeRes.data.id,
            code,
        })
        if (verifyRes.error) throw verifyRes.error
        await refetch()
        return verifyRes.data
    }, [refetch])

    // Remove a factor. Used both for "Disable two-factor" and for
    // cancelling a half-enrolled (unverified) factor on dialog dismiss.
    const unenroll = useCallback(async (factorId) => {
        const { error } = await supabase.auth.mfa.unenroll({ factorId })
        if (error) throw error
        await refetch()
    }, [refetch])

    const hasVerifiedFactor = factors.length > 0
    const isAal2 = aal.currentLevel === 'aal2'
    const needsChallenge = hasVerifiedFactor && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2'

    return {
        factors,
        allFactors,
        aal,
        loading,
        hasVerifiedFactor,
        isAal2,
        needsChallenge,
        beginEnrollment,
        verifyCode,
        unenroll,
        refetch,
    }
}

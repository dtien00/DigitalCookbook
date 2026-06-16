import { useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'

// Stage 16 item 2 — AAL1 → AAL2 challenge.
//
// Rendered inline as a gate: when an admin has a verified TOTP factor
// but their current session is AAL1 (fresh email/password login), they
// must enter a 6-digit code to elevate before touching admin tools.
//
// Distinct from MfaEnrollDialog:
//   - Enrollment creates a NEW factor (one-time scan + verify).
//   - Challenge re-authenticates an EXISTING verified factor (every login).
//
// The first verified factor is used (in practice admins have one).
export default function MfaChallengeGate({ factors, verifyCode, onSuccess, title, hint }) {
    const [code, setCode] = useState('')
    const [busy, setBusy] = useState(false)
    const codeInputRef = useRef(null)
    const factor = factors[0]

    useEffect(() => {
        codeInputRef.current?.focus()
    }, [])

    async function handleSubmit(e) {
        e.preventDefault()
        if (!factor || code.length !== 6) return
        setBusy(true)
        try {
            await verifyCode(factor.id, code)
            toast.success('Verified')
            onSuccess?.()
        } catch (error) {
            toast.error('Invalid code — try again')
            setCode('')
            codeInputRef.current?.focus()
            console.error('MFA challenge failed:', error.message)
        } finally {
            setBusy(false)
        }
    }

    if (!factor) {
        return (
            <p className="font-serif italic text-ink/60">No two-factor method registered.</p>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="mfa-challenge">
            {title && <h3 className="font-display text-base font-semibold text-ink m-0 mb-1">{title}</h3>}
            {hint && <p className="font-serif italic text-ink/70 text-sm mb-3">{hint}</p>}
            <label htmlFor="mfa-challenge-code" className="block font-serif text-ink text-sm mb-2">
                Enter the 6-digit code from your authenticator app
            </label>
            <div className="flex gap-2">
                <input
                    ref={codeInputRef}
                    id="mfa-challenge-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    className="flex-1 px-3 py-2 border border-paper-shade rounded-md bg-paper-shade/30 text-ink text-lg font-mono tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-rust/40"
                />
                <button
                    type="submit"
                    disabled={code.length !== 6 || busy}
                    className="px-4 py-2 bg-rust hover:bg-rust-dark text-paper text-sm font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {busy ? '…' : 'Verify'}
                </button>
            </div>
        </form>
    )
}

import { useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'

// Module-level promise cache for in-flight enrollment.
//
// StrictMode dev mounts the dialog twice (mount → cleanup → mount) which
// fires the enroll effect twice with different component-instance refs.
// The first call creates a TOTP factor; the second collides on
// friendly_name. A ref guard inside the component can't span instances —
// the cache here can. Cleared when the dialog closes (success or cancel).
let inFlightEnrollment = null

// Stage 16 item 2 — TOTP enrollment dialog.
//
// Flow:
//   1. Mount → call beginEnrollment → get {factorId, qrCodeSvg, secret}
//   2. User scans QR with Microsoft Authenticator (or any RFC 6238 app)
//   3. User types 6-digit code → verifyCode(factorId, code)
//   4. Success → onComplete, toast, dialog closes
//
// Cancel paths: × button, Escape key, backdrop click — all call
// unenroll(factorId) on the unverified factor so we don't leave stale
// half-enrolled factors lying around. The cleanup is fire-and-forget;
// a failure there isn't user-visible since the dialog is dismissing.
//
// Supabase returns totp.qr_code as a complete SVG string, rendered
// here via dangerouslySetInnerHTML. The SVG is generated server-side
// from the otpauth:// URI, so no QR library is needed in the bundle.
export default function MfaEnrollDialog({ onClose, onComplete, beginEnrollment, verifyCode, unenroll }) {
    const [enrollment, setEnrollment] = useState(null)
    const [code, setCode] = useState('')
    const [verifying, setVerifying] = useState(false)
    const [enrollError, setEnrollError] = useState(null)
    const codeInputRef = useRef(null)
    const triggerOriginRef = useRef(null)

    // Begin enrollment on mount via the module-level in-flight cache so
    // StrictMode's double-mount can't fire two parallel enroll calls
    // (which would collide on friendly_name). Both mount cycles await
    // the same promise; only the live instance's setState callbacks run.
    useEffect(() => {
        triggerOriginRef.current = document.activeElement
        let cancelled = false
        if (!inFlightEnrollment) {
            inFlightEnrollment = beginEnrollment('Authenticator app')
        }
        inFlightEnrollment
            .then(data => { if (!cancelled) setEnrollment(data) })
            .catch(error => { if (!cancelled) setEnrollError(error.message) })
        return () => { cancelled = true }
    }, [beginEnrollment])

    // Focus code input once enrollment data lands.
    useEffect(() => {
        if (enrollment) codeInputRef.current?.focus()
    }, [enrollment])

    // Body scroll lock + Escape handler.
    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const onKey = (e) => { if (e.key === 'Escape') handleClose() }
        document.addEventListener('keydown', onKey)
        return () => {
            document.body.style.overflow = prev
            document.removeEventListener('keydown', onKey)
            const origin = triggerOriginRef.current
            if (origin && typeof origin.focus === 'function') origin.focus()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function handleClose() {
        // Best-effort cleanup of the unverified factor — if it fails (e.g.
        // network drop) we don't block the close; orphan factors can still
        // be unenrolled later from the Security tab's factor list.
        if (enrollment?.factorId) {
            unenroll(enrollment.factorId).catch(() => {})
        }
        inFlightEnrollment = null
        onClose()
    }

    async function handleVerify(e) {
        e.preventDefault()
        if (!enrollment || code.length !== 6) return
        setVerifying(true)
        try {
            await verifyCode(enrollment.factorId, code)
            toast.success('Two-factor authentication enabled')
            inFlightEnrollment = null
            onComplete()
        } catch (error) {
            toast.error('Invalid code — try again')
            setCode('')
            codeInputRef.current?.focus()
            console.error('MFA verify failed:', error.message)
        } finally {
            setVerifying(false)
        }
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mfa-enroll-title"
            className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/60 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
        >
            <div className="bg-paper border border-paper-shade rounded-lg shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                <header className="flex items-center justify-between px-5 py-4 border-b border-paper-shade">
                    <h2 id="mfa-enroll-title" className="font-display text-xl text-ink m-0">Enable two-factor authentication</h2>
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Close"
                        className="text-ink/60 hover:text-ink text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-paper-shade transition-colors"
                    >
                        ×
                    </button>
                </header>

                <div className="px-5 py-5">
                    {enrollError && (
                        <p className="text-rose-dark font-serif italic mb-3">Couldn't start enrollment: {enrollError}</p>
                    )}

                    {!enrollment && !enrollError && (
                        <p className="text-ink/60 font-serif italic">Generating QR code…</p>
                    )}

                    {enrollment && (
                        <>
                            <ol className="font-serif text-ink space-y-3 mb-4 list-decimal list-inside">
                                <li>Open <strong>Microsoft Authenticator</strong> (or any TOTP app) on your phone.</li>
                                <li>Tap <em>Add account</em> → <em>Other account</em> and scan the QR code below.</li>
                                <li>Enter the 6-digit code your app shows.</li>
                            </ol>

                            <div className="bg-paper-shade/40 border border-paper-shade rounded-md p-4 flex justify-center mb-4">
                                <img
                                    src={enrollment.qrCodeSvg}
                                    alt="QR code — scan with your authenticator app"
                                    className="mfa-qr-host w-[243px] h-[243px] bg-paper"
                                />
                            </div>

                            <details className="mb-4">
                                <summary className="cursor-pointer font-serif italic text-ink/70 hover:text-ink text-sm">
                                    Can't scan? Enter this secret manually
                                </summary>
                                <div className="mt-2 p-3 bg-paper-shade/40 border border-paper-shade rounded-md">
                                    <code className="font-mono text-sm text-ink break-all select-all">{enrollment.secret}</code>
                                </div>
                            </details>

                            <form onSubmit={handleVerify}>
                                <label className="block font-serif text-ink mb-2" htmlFor="mfa-code">
                                    Verification code
                                </label>
                                <input
                                    ref={codeInputRef}
                                    id="mfa-code"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]{6}"
                                    maxLength={6}
                                    autoComplete="one-time-code"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="123456"
                                    className="w-full px-4 py-3 border border-paper-shade rounded-md bg-paper-shade/30 text-ink text-2xl font-mono tracking-[0.4em] text-center focus:outline-none focus:ring-2 focus:ring-rust/40"
                                />
                                <div className="flex gap-2 mt-4">
                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        className="flex-1 px-4 py-2.5 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={code.length !== 6 || verifying}
                                        className="flex-1 px-4 py-2.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {verifying ? 'Verifying…' : 'Verify'}
                                    </button>
                                </div>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

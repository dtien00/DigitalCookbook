import { useEffect, useRef, useState } from 'react'
import TimerDial from './TimerDial'
import ModeTab from './ModeTab'
import { parseDurationToMs, formatMs, previewDuration } from '../lib/parseDuration'
import { DIAL_MAX_MS, dialCanRepresent } from '../lib/dialGeometry'

// Set a step's timer length while authoring a recipe — the clock-dial paradigm
// from cooking mode, brought to the editor.
//
// The dial itself is <TimerDial> unchanged: the same draggable clock face, ±
// steppers and hand sequencing that TimerSetSheet offers a cook mid-recipe, over
// the same unit-tested lib/dialGeometry.js. Only the wrapper differs, because
// the two sheets do different things with the number — TimerSetSheet *starts* a
// timer (onStart), this one *writes a string into the form* (onCommit) and has
// to offer Clear, since a step having no timer is the normal case.
//
// Dial and Type are two editors over one value, exactly as in TimerSetSheet:
// switching carries the value across, so nothing is lost either way. Type is
// also the accessible path — the dial is a pointer control, and the text field
// is its keyboard and screen-reader equivalent.
//
// Above the dial's 11:59:55 ceiling the value belongs to Type; seeding the dial
// from a larger typed duration pins it there (msToHands clamps), so the sheet
// says so rather than letting the number quietly shrink.
export default function StepDurationSheet({ value, onCommit, onClose, autoFocusType = false }) {
    const sheetRef = useRef(null)
    const typeRef = useRef(null)
    const seedMs = parseDurationToMs(value || '')
    // Open on the Dial normally, but NOT when the dial cannot represent what the
    // step already holds: seeding it clamps to 11:59:55, and the first switch
    // back to Type would then write that clamp over the author's real value.
    // A non-empty string that doesn't parse is the same hazard in reverse --
    // the dial would seed at zero and quietly discard what they typed. Both
    // cases start on Type, where the value is shown intact.
    const startInType = !!(value || '').trim() && !dialCanRepresent(seedMs)
    const [mode, setMode] = useState(startInType ? 'type' : 'dial')
    const [typed, setTyped] = useState(value || '')
    // Seeding the dial means remounting it, so it re-reads initialMs.
    const [dialSeed, setDialSeed] = useState(seedMs || 0)
    const [dialNonce, setDialNonce] = useState(0)
    const [dialMs, setDialMs] = useState(seedMs || 0)

    const currentMs = mode === 'dial' ? dialMs : parseDurationToMs(typed)
    const readout = currentMs ? formatMs(currentMs) : ''
    // Only a *typed* value can exceed the dial, so only warn in that direction.
    const overDialCeiling = mode === 'type' && !!currentMs && currentMs > DIAL_MAX_MS

    useEffect(() => {
        if (autoFocusType && mode === 'type') typeRef.current?.focus()
    }, [autoFocusType, mode])

    // Escape closes; Tab stays inside the dialog so the form behind it is never
    // a keyboard dead end.
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') { onClose(); return }
            if (e.key !== 'Tab') return
            const f = sheetRef.current?.querySelectorAll(
                'button:not([disabled]), input, [href], select, textarea, [tabindex]:not([tabindex="-1"])'
            )
            if (!f || f.length === 0) return
            const first = f[0]
            const last = f[f.length - 1]
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault()
                last.focus()
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault()
                first.focus()
            }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    // Type -> Dial seeds the dial from whatever is typed (fresh nonce remounts it
    // so it re-seeds); Dial -> Type renders the dialled ms back to a clock string.
    // Same carry-across contract as TimerSetSheet.
    const showDial = () => {
        const ms = parseDurationToMs(typed) || 0
        setDialSeed(ms)
        setDialMs(ms)
        setDialNonce(n => n + 1)
        setMode('dial')
    }
    const showType = () => {
        setTyped(dialMs ? formatMs(dialMs) : '')
        setMode('type')
    }

    const commit = () => {
        onCommit(currentMs ? formatMs(currentMs) : '')
    }

    return (
        <div
            className="fixed inset-0 z-[130] flex items-end sm:items-center sm:justify-center"
            role="dialog"
            aria-modal="true"
            aria-label="Set the step timer"
        >
            <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="absolute inset-0 bg-ink/40 cursor-default"
            />
            <div
                ref={sheetRef}
                className="relative w-full sm:max-w-sm max-h-[92vh] overflow-y-auto bg-paper paper-grain rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-paper-shade">
                    <h2 className="font-display text-lg text-ink m-0">Step timer</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-paper-shade hover:bg-tan/40 text-ink transition-colors"
                    >
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="px-5 py-4">
                    <div className="flex items-center gap-1 p-1 bg-paper-shade/60 rounded-full w-max mx-auto">
                        <ModeTab on={mode === 'dial'} onClick={showDial} label="Dial">
                            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="12" cy="13" r="8" />
                                <path d="M12 9v4l2 2" />
                                <path d="M9 2h6" />
                            </svg>
                        </ModeTab>
                        <ModeTab on={mode === 'type'} onClick={showType} label="Type">
                            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="2" y="6" width="20" height="12" rx="2" />
                                <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
                            </svg>
                        </ModeTab>
                    </div>

                    {mode === 'dial' ? (
                        <div className="mt-4">
                            <TimerDial key={dialNonce} initialMs={dialSeed} onChange={setDialMs} />
                        </div>
                    ) : (
                        <div className="mt-4">
                            <label htmlFor="step-duration-typed" className="font-display text-xs uppercase tracking-wider text-ink/50 mb-2 block">
                                Length
                            </label>
                            <input
                                id="step-duration-typed"
                                ref={typeRef}
                                type="text"
                                // text, not numeric: a numeric pad has no ":" key,
                                // which is what made "5:00" untypeable on a phone.
                                inputMode="text"
                                value={typed}
                                onChange={e => setTyped(e.target.value)}
                                placeholder="10, 5:30, or 2:00:00"
                                autoComplete="off"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                enterKeyHint="done"
                                className="w-full px-3 py-3 min-h-[44px] rounded-lg bg-[#fbf6f1] border border-paper-shade text-ink font-serif text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-rust/50"
                            />
                            <p className="mt-2 font-serif italic text-sm text-ink/60 m-0">
                                {typed.trim() === ''
                                    ? 'A bare number means minutes — 10 is ten minutes.'
                                    : previewDuration(typed)
                                        ? `Sets a ${previewDuration(typed)} timer.`
                                        : 'Not a time yet — try 10, 5:30, or 2:00:00.'}
                            </p>
                        </div>
                    )}

                    {overDialCeiling && (
                        <p className="mt-3 font-serif italic text-sm text-rose-dark m-0">
                            Longer than the dial goes (11:59:55) — keep it typed, or the dial will pin it to the ceiling.
                        </p>
                    )}

                    <div className="mt-5 flex items-center justify-between gap-3">
                        <span className="font-display text-lg text-ink tabular-nums">
                            {readout || <span className="font-serif italic text-base text-ink/50">No timer</span>}
                        </span>
                        <div className="flex gap-2">
                            {(value || '').trim() !== '' && (
                                <button
                                    type="button"
                                    onClick={() => onCommit('')}
                                    className="px-4 py-3 min-h-[44px] rounded-lg text-ink/60 hover:text-rose-dark font-serif italic text-sm transition-colors"
                                >
                                    Clear
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={commit}
                                disabled={!currentMs}
                                className="px-5 py-3 min-h-[44px] rounded-lg bg-rust hover:bg-rust-dark text-paper font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Set timer
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

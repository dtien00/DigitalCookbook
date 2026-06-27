import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { parseDurationToMs, formatMs } from '../lib/parseDuration'

// Stage 19 (Cooking Mode Timer) — the quick-set sheet for starting an ad-hoc
// timer. Opened from the CookingMode header clock button, the RecipeDetail
// "Timer" button, and the floating <TimerWidget>'s "+ Timer". Rendered once at
// App level and portaled to <body> at z-[130] so it layers above the widget
// (z-[120]) and CookingMode (z-[100] / its ingredient sheet z-[110]).
//
// Preset chips cover the common kitchen durations; the custom field accepts a
// bare minute count ("10") or mm:ss / h:mm:ss ("5:30") via parseDurationToMs.

const PRESET_MINUTES = [1, 3, 5, 10, 15, 30]

export default function TimerSetSheet({ open, onClose, onStart }) {
    const [custom, setCustom] = useState('')
    const [error, setError] = useState('')
    // The custom-time entry field stays hidden until the author taps "Add a
    // custom time", so the sheet opens to just the quick presets — the common
    // case — and only reveals the input on demand.
    const [showCustom, setShowCustom] = useState(false)
    const inputRef = useRef(null)
    const restoreFocusRef = useRef(null)

    useEffect(() => {
        if (!open) return
        // Remember what had focus so we can restore it on close — works for any
        // opener (CookingMode header, RecipeDetail button, widget) generically.
        restoreFocusRef.current = document.activeElement
        setCustom('')
        setError('')
        setShowCustom(false)
    }, [open])

    // Focus the custom field only once it's revealed — focusing on open would
    // pull focus to an input the user hasn't asked for yet.
    useEffect(() => {
        if (!open || !showCustom) return
        const raf = requestAnimationFrame(() => inputRef.current?.focus())
        return () => cancelAnimationFrame(raf)
    }, [open, showCustom])

    useEffect(() => {
        if (!open) return
        // Capture phase + stopPropagation so these keys don't also reach
        // CookingMode's window-level handler underneath — otherwise Escape would
        // exit cooking mode while closing the sheet, and Arrow keys would change
        // steps behind the modal. Digits / ":" / Backspace are left alone so
        // they still reach the custom-time input.
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation()
                close()
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.stopPropagation()
            }
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    function close() {
        onClose()
        const el = restoreFocusRef.current
        if (el && typeof el.focus === 'function') el.focus()
    }

    function start(durationMs) {
        onStart({ durationMs })
        close()
    }

    function startCustom(e) {
        e.preventDefault()
        const ms = parseDurationToMs(custom)
        if (!ms) {
            setError('Enter a time like 10 or 5:30')
            return
        }
        start(ms)
    }

    if (!open) return null

    return createPortal(
        <div
            className="fixed inset-0 z-[130] flex items-end sm:items-center sm:justify-center"
            role="dialog"
            aria-modal="true"
            aria-label="Set a timer"
        >
            <button
                type="button"
                aria-label="Close timer setup"
                className="absolute inset-0 bg-ink/40 cursor-default"
                onClick={close}
            />
            <div className="relative w-full sm:max-w-sm bg-paper paper-grain rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-paper-shade">
                    <h2 className="font-display text-lg text-ink m-0">Set a timer</h2>
                    <button
                        onClick={close}
                        aria-label="Close timer setup"
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-paper-shade hover:bg-tan/40 text-ink transition-colors"
                    >
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="px-5 py-4">
                    <p className="font-display text-xs uppercase tracking-wider text-ink/50 mb-2">Quick presets</p>
                    <div className="grid grid-cols-3 gap-2">
                        {PRESET_MINUTES.map(min => (
                            <button
                                key={min}
                                onClick={() => start(min * 60000)}
                                className="px-3 py-3 min-h-[44px] rounded-lg bg-paper-shade hover:bg-tan/40 text-ink font-serif text-base transition-colors tabular-nums"
                            >
                                {formatMs(min * 60000)}
                            </button>
                        ))}
                    </div>

                    {showCustom ? (
                        <form onSubmit={startCustom} className="mt-5">
                            <label htmlFor="timer-custom" className="font-display text-xs uppercase tracking-wider text-ink/50 mb-2 block">
                                Custom
                            </label>
                            <div className="flex gap-2">
                                <input
                                    id="timer-custom"
                                    ref={inputRef}
                                    type="text"
                                    inputMode="numeric"
                                    value={custom}
                                    onChange={(e) => { setCustom(e.target.value); if (error) setError('') }}
                                    placeholder="e.g. 10  or  5:30"
                                    aria-invalid={!!error}
                                    aria-describedby={error ? 'timer-custom-error' : undefined}
                                    className="flex-1 min-w-0 px-3 py-3 min-h-[44px] rounded-lg bg-[#fbf6f1] border border-paper-shade text-ink font-serif text-base focus:outline-none focus:ring-2 focus:ring-rust/50"
                                />
                                <button
                                    type="submit"
                                    className="px-5 py-3 min-h-[44px] rounded-lg bg-rust hover:bg-rust-dark text-paper font-semibold transition-colors shrink-0"
                                >
                                    Start
                                </button>
                            </div>
                            {error && (
                                <p id="timer-custom-error" className="mt-2 font-serif italic text-sm text-rose-dark" role="alert">
                                    {error}
                                </p>
                            )}
                        </form>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setShowCustom(true)}
                            className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-lg border border-dashed border-paper-shade text-ink/70 hover:text-ink hover:bg-paper-shade/60 font-medium transition-colors"
                        >
                            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            Add a custom time
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    )
}

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { parseDurationToMs, formatMs } from '../lib/parseDuration'
import TimerDial from './TimerDial'

// Stage 19 (Cooking Mode Timer) — the quick-set sheet for starting an ad-hoc
// timer. Opened from the CookingMode header clock button, the RecipeDetail
// "Timer" button, and the floating <TimerWidget>'s "+ Timer". Rendered once at
// App level and portaled to <body> at z-[130] so it layers above the widget
// (z-[120]) and CookingMode (z-[100] / its ingredient sheet z-[110]).
//
// Preset chips cover the common kitchen durations. Below them, "custom time"
// reveals two editors over one value (Phase 3): a Dial (<TimerDial>, an
// alarm-style clock face) and Type (a text field accepting "10" / mm:ss /
// h:mm:ss via parseDurationToMs). Switching tabs carries the value across.

const PRESET_MINUTES = [1, 3, 5, 10, 15, 30]

// One segment of the Dial/Type toggle — a pill in the paper family.
function ModeTab({ on, onClick, label, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={on}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 min-h-[36px] rounded-full text-sm font-medium transition-colors ${
                on ? 'bg-paper text-ink shadow-sm' : 'text-ink/60 hover:text-ink'
            }`}
        >
            {children}
            {label}
        </button>
    )
}

export default function TimerSetSheet({ open, onClose, onStart }) {
    const [custom, setCustom] = useState('')
    const [error, setError] = useState('')
    // The custom-time area stays hidden until the author taps "Add a custom
    // time", so the sheet opens to just the quick presets — the common case —
    // and only reveals the Dial/Type editors on demand. Dial is the default tab.
    const [showCustom, setShowCustom] = useState(false)
    const [customMode, setCustomMode] = useState('dial') // 'dial' | 'type'
    const [dialMs, setDialMs] = useState(0)               // the dial's live value
    const [dialSeed, setDialSeed] = useState(0)           // ms the dial mounts from
    const [dialNonce, setDialNonce] = useState(0)         // bump to remount + re-seed
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
        setCustomMode('dial')
        setDialMs(0)
        setDialSeed(0)
        setDialNonce(n => n + 1)
    }, [open])

    // Focus the custom field only once the Type tab is showing — focusing on
    // open, or while the Dial tab is active, would pull focus to a hidden input.
    useEffect(() => {
        if (!open || !showCustom || customMode !== 'type') return
        const raf = requestAnimationFrame(() => inputRef.current?.focus())
        return () => cancelAnimationFrame(raf)
    }, [open, showCustom, customMode])

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

    // Dial <-> Type carry the same value across. Type -> Dial seeds the dial from
    // whatever's typed (remounting via a fresh nonce so it re-seeds); Dial -> Type
    // renders the dialled ms back to a clock string so nothing is lost.
    function showDial() {
        setDialSeed(parseDurationToMs(custom) || 0)
        setDialNonce(n => n + 1)
        setError('')
        setCustomMode('dial')
    }
    function showType() {
        setCustom(dialMs ? formatMs(dialMs) : '')
        setError('')
        setCustomMode('type')
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
            <div className="relative w-full sm:max-w-sm max-h-[92vh] overflow-y-auto bg-paper paper-grain rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col">
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
                        <div className="mt-5">
                            {/* Dial ↔ Type — two editors over one duration value */}
                            <div className="flex items-center gap-1 p-1 bg-paper-shade/60 rounded-full w-max mx-auto">
                                <ModeTab on={customMode === 'dial'} onClick={showDial} label="Dial">
                                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <circle cx="12" cy="12" r="9" />
                                        <path d="M12 7v5l3 2" />
                                    </svg>
                                </ModeTab>
                                <ModeTab on={customMode === 'type'} onClick={showType} label="Type">
                                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <rect x="3" y="6" width="18" height="12" rx="2" />
                                        <line x1="7.5" y1="10" x2="7.5" y2="10.01" />
                                        <line x1="12" y1="10" x2="12" y2="10.01" />
                                        <line x1="16.5" y1="10" x2="16.5" y2="10.01" />
                                        <line x1="8" y1="14" x2="16" y2="14" />
                                    </svg>
                                </ModeTab>
                            </div>

                            {customMode === 'dial' ? (
                                <div className="mt-4 flex flex-col items-center">
                                    <TimerDial key={dialNonce} initialMs={dialSeed} onChange={setDialMs} />
                                    <button
                                        type="button"
                                        onClick={() => start(dialMs)}
                                        disabled={!dialMs}
                                        className="mt-4 w-full px-5 py-3 min-h-[44px] rounded-lg bg-rust hover:bg-rust-dark text-paper font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        Start
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={startCustom} className="mt-4">
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
                            )}
                        </div>
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

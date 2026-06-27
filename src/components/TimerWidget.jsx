import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { formatMs } from '../lib/parseDuration'

// Stage 19 (Cooking Mode Timer) — the floating timer stack. Rendered once at
// App level and portaled to <body> at z-[120] so it floats above CookingMode
// (z-[100]) and its ingredient sheet (z-[110]) while staying below the set
// sheet (z-[130]). Anchored bottom-left, clear of CookingMode's bottom-right
// "Mark step done" pill and the home grid's bottom-right scroll-to-top button.
//
// This component owns the per-tick `now` so only this subtree re-renders 4x/sec
// during a countdown — the useTimers hook intentionally holds no `now` state.
// Remaining time is derived from each timer's absolute endsAt, so the display
// stays correct across throttling without mutating timer objects every tick.

function liveRemaining(t, now) {
    if (t.status === 'running') return Math.max(0, t.endsAt - now)
    return Math.max(0, t.remainingMs)
}

function CircleButton({ label, onClick, children, tone = 'neutral' }) {
    const tones = {
        neutral: 'bg-paper-shade hover:bg-tan/40 text-ink',
        rust: 'bg-rust hover:bg-rust-dark text-paper',
    }
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors shrink-0 ${tones[tone]}`}
        >
            {children}
        </button>
    )
}

export default function TimerWidget({
    timers,
    onPause,
    onResume,
    onReset,
    onAddMinute,
    onDismiss,
    onAddTimer,
}) {
    const [now, setNow] = useState(() => Date.now())
    const hasRunning = timers.some(t => t.status === 'running')

    // Tick only while something is counting down; paused/done pills are static.
    useEffect(() => {
        if (!hasRunning) return
        const id = setInterval(() => setNow(Date.now()), 250)
        return () => clearInterval(id)
    }, [hasRunning])

    if (timers.length === 0) return null

    return createPortal(
        <div className="timer-widget fixed bottom-4 left-4 z-[120] flex flex-col gap-2 w-[16rem] max-w-[calc(100vw-2rem)]">
            {timers.map(t => {
                const remaining = liveRemaining(t, now)
                const done = t.status === 'done'
                const paused = t.status === 'paused'
                return (
                    <div
                        key={t.id}
                        role="timer"
                        aria-live={done ? 'assertive' : 'off'}
                        className={`rounded-xl shadow-lg border px-3 py-2.5 ${
                            done
                                ? 'bg-rose-dark text-paper border-rose-dark motion-safe:animate-pulse'
                                : 'bg-paper paper-grain text-ink border-paper-shade'
                        }`}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className={`font-display text-xs uppercase tracking-wider truncate ${done ? 'text-paper/80' : 'text-ink/50'}`}>
                                {done ? "Time's up" : t.label}
                            </span>
                            <button
                                type="button"
                                onClick={() => onDismiss(t.id)}
                                aria-label={done ? 'Stop timer' : 'Dismiss timer'}
                                title={done ? 'Stop' : 'Dismiss'}
                                className={`w-7 h-7 flex items-center justify-center rounded-full shrink-0 transition-colors ${
                                    done ? 'bg-paper/20 hover:bg-paper/30 text-paper' : 'bg-paper-shade hover:bg-tan/40 text-ink'
                                }`}
                            >
                                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>

                        <div className={`font-serif tabular-nums leading-none my-1.5 ${done ? 'text-3xl' : 'text-3xl'}`}>
                            {formatMs(remaining)}
                        </div>

                        {done ? (
                            <div className="flex items-center gap-2 mt-2">
                                <button
                                    type="button"
                                    onClick={() => onDismiss(t.id)}
                                    className="flex-1 px-3 py-2 min-h-[40px] rounded-full bg-paper text-rose-dark font-semibold hover:bg-paper/90 transition-colors"
                                >
                                    Stop
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onAddMinute(t.id)}
                                    aria-label="Add one minute and resume"
                                    className="px-3 py-2 min-h-[40px] rounded-full bg-paper/20 hover:bg-paper/30 text-paper font-medium transition-colors shrink-0"
                                >
                                    +1:00
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 mt-1">
                                {paused ? (
                                    <CircleButton label="Resume timer" tone="rust" onClick={() => onResume(t.id)}>
                                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                                            <polygon points="6 4 20 12 6 20 6 4" />
                                        </svg>
                                    </CircleButton>
                                ) : (
                                    <CircleButton label="Pause timer" onClick={() => onPause(t.id)}>
                                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                                            <rect x="6" y="5" width="4" height="14" rx="1" />
                                            <rect x="14" y="5" width="4" height="14" rx="1" />
                                        </svg>
                                    </CircleButton>
                                )}
                                <CircleButton label="Reset timer" onClick={() => onReset(t.id)}>
                                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <polyline points="1 4 1 10 7 10" />
                                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                    </svg>
                                </CircleButton>
                                <button
                                    type="button"
                                    onClick={() => onAddMinute(t.id)}
                                    aria-label="Add one minute"
                                    title="Add one minute"
                                    className="px-3 h-9 flex items-center justify-center rounded-full bg-paper-shade hover:bg-tan/40 text-ink font-medium text-sm transition-colors shrink-0 tabular-nums"
                                >
                                    +1:00
                                </button>
                            </div>
                        )}
                    </div>
                )
            })}

            <button
                type="button"
                onClick={onAddTimer}
                className="self-start inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-paper paper-grain border border-paper-shade text-ink/80 hover:text-ink hover:bg-paper-shade shadow-md transition-colors text-sm font-medium"
            >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="13" r="8" />
                    <path d="M12 9v4l2 2" />
                    <path d="M9 2h6" />
                </svg>
                Timer
            </button>
        </div>,
        document.body
    )
}

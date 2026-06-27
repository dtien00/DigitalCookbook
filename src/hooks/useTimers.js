import { useState, useEffect, useRef, useCallback } from 'react'
import { formatMs } from '../lib/parseDuration'
import { fireAlarm, stopAlarm, primeAudio } from '../lib/timerAlarm'

// Stage 19 (Cooking Mode Timer) — App-level kitchen-timer store. Lives at the
// App level (like useFridgeBasket / useShoppingList) so a running timer survives
// step navigation, the CookingMode <-> RecipeDetail boundary, and route changes:
// you set a pasta timer, browse elsewhere, and it still rings. The floating
// <TimerWidget> consumes this single instance.
//
// Timer shape:
//   { id, label, durationMs, remainingMs, endsAt, status, createdAt }
//     status 'running' -> endsAt is an absolute epoch ms; remainingMs is stale
//                         (recomputed for display as endsAt - now)
//     status 'paused'  -> remainingMs holds the frozen value; endsAt is null
//     status 'done'    -> remainingMs 0; the alarm rings until the timer is
//                         dismissed (or re-armed via reset / +1)
//
// Mechanics are epoch-based, NOT interval-decrement: storing the absolute
// endsAt means a backgrounded/throttled tab shows the correct remaining time on
// return, and localStorage persistence is nearly free (an accidental reload or
// back-swipe doesn't kill a 20-minute timer). This hook holds no per-tick `now`
// state — the smooth countdown re-render lives in <TimerWidget>; here a light
// watcher only flips expired timers to 'done', so App re-renders on actual
// expiry, not 4x/second.
//
// API:
//   const { timers, startTimer, pauseTimer, resumeTimer,
//           resetTimer, addMinute, dismissTimer } = useTimers()
//     startTimer({ durationMs, label? }) -> id | null
const STORAGE_KEY = 'cookbook.timers'
const TICK_MS = 250

function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `timer_${crypto.randomUUID()}`
    }
    return `timer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function readInitial() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        const now = Date.now()
        return parsed
            .filter(t => t && typeof t === 'object' && typeof t.id === 'string'
                && typeof t.durationMs === 'number')
            .map(t => {
                // A timer that ran out while the app was closed comes back done.
                if (t.status === 'running' && typeof t.endsAt === 'number' && t.endsAt <= now) {
                    return { ...t, status: 'done', remainingMs: 0, endsAt: null }
                }
                return t
            })
    } catch {
        return []
    }
}

export function useTimers() {
    const [timers, setTimers] = useState(readInitial)

    // Mirror latest timers so the expiry watcher reads current values without
    // re-subscribing its interval on every structural change.
    const timersRef = useRef(timers)
    timersRef.current = timers

    // Persist structural changes only (there is no per-tick state here, so this
    // does not thrash localStorage on the countdown).
    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(timers))
        } catch {
            // Storage full / disabled / private-mode Safari — timers still work
            // in-memory for this page; only cross-session persistence is lost.
        }
    }, [timers])

    // Expiry watcher — runs only while a timer is counting down. Flips any
    // running timer past its endsAt to 'done' (a structural change, so it
    // persists and the alarm effect below fires). Reads Date.now() directly;
    // setTimers fires solely on a real expiry, so App stays still between ticks.
    useEffect(() => {
        const hasRunning = timers.some(t => t.status === 'running')
        if (!hasRunning) return
        const interval = setInterval(() => {
            const now = Date.now()
            let changed = false
            const next = timersRef.current.map(t => {
                if (t.status === 'running' && t.endsAt <= now) {
                    changed = true
                    return { ...t, status: 'done', remainingMs: 0, endsAt: null }
                }
                return t
            })
            if (changed) setTimers(next)
        }, TICK_MS)
        return () => clearInterval(interval)
    }, [timers])

    // Alarm side-effect — ring while any timer is done, silence once all done
    // timers are dismissed or re-armed. fireAlarm()/stopAlarm() are idempotent.
    useEffect(() => {
        if (timers.some(t => t.status === 'done')) fireAlarm()
        else stopAlarm()
    }, [timers])

    // Stop the alarm if the whole hook unmounts (e.g. full app teardown).
    useEffect(() => () => stopAlarm(), [])

    const startTimer = useCallback(({ durationMs, label } = {}) => {
        if (!Number.isFinite(durationMs) || durationMs <= 0) return null
        primeAudio() // unlock audio inside the originating user gesture
        const id = makeId()
        const now = Date.now()
        setTimers(prev => [
            ...prev,
            {
                id,
                label: (label && String(label).trim()) || formatMs(durationMs),
                durationMs,
                remainingMs: durationMs,
                endsAt: now + durationMs,
                status: 'running',
                createdAt: now,
            },
        ])
        return id
    }, [])

    const pauseTimer = useCallback((id) => {
        setTimers(prev => prev.map(t => {
            if (t.id !== id || t.status !== 'running') return t
            return { ...t, status: 'paused', remainingMs: Math.max(0, t.endsAt - Date.now()), endsAt: null }
        }))
    }, [])

    const resumeTimer = useCallback((id) => {
        primeAudio()
        setTimers(prev => prev.map(t => {
            if (t.id !== id || t.status !== 'paused') return t
            return { ...t, status: 'running', endsAt: Date.now() + t.remainingMs }
        }))
    }, [])

    // Reset re-arms to the full authored duration. A running timer keeps running
    // (restarts from full); a paused or done timer sits at full, paused — moving
    // off 'done' also silences the alarm via the effect above.
    const resetTimer = useCallback((id) => {
        setTimers(prev => prev.map(t => {
            if (t.id !== id) return t
            if (t.status === 'running') {
                return { ...t, remainingMs: t.durationMs, endsAt: Date.now() + t.durationMs }
            }
            return { ...t, status: 'paused', remainingMs: t.durationMs, endsAt: null }
        }))
    }, [])

    // +1 minute. Running extends endsAt; paused extends the frozen remainder; a
    // done timer takes the extra minute and starts running again ("need a bit
    // more — go"), which also stops the alarm.
    const addMinute = useCallback((id) => {
        setTimers(prev => prev.map(t => {
            if (t.id !== id) return t
            if (t.status === 'running') return { ...t, endsAt: t.endsAt + 60000 }
            if (t.status === 'done') return { ...t, status: 'running', remainingMs: 60000, endsAt: Date.now() + 60000 }
            return { ...t, remainingMs: t.remainingMs + 60000 }
        }))
    }, [])

    const dismissTimer = useCallback((id) => {
        setTimers(prev => prev.filter(t => t.id !== id))
    }, [])

    return { timers, startTimer, pauseTimer, resumeTimer, resetTimer, addMinute, dismissTimer }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { describeDictationError, describeEmptySession, isEmptyStrike, readResults, recognitionCtorFor } from '../lib/dictation'

// How long to wait for an engine to wind down after stop() before shutting it
// down ourselves and keeping what was heard.
const STOP_GRACE_MS = 2000

// One toast slot for every dictation message, so repeated taps against a
// blocked microphone replace the toast instead of stacking copies of it.
const TOAST_ID = 'dictation'

const currentWindow = () => (typeof window === 'undefined' ? null : window)

// One-at-a-time speech-to-text over the browser's Web Speech API, for the mic
// on each CreateRecipe step. The caller names what it's dictating into with a
// `key` (the step index). `start(key, onText)` opens a session; `onText`
// receives the transcript once the engine stops — by itself on a pause, or
// when `stop()` is called. Nothing is recorded or kept here: the browser sends
// the audio to its own speech service (Google's in Chrome, Apple's in Safari)
// and only text comes back.
//
// Sessions are single-utterance (`continuous: false`). Keep-listening mode is
// broken on some Android recognizers (Chromium issue 40324711), and a pause
// ending the session costs nothing when tapping again carries on from there.
//
// Every handler checks that it still belongs to the live session before it
// touches anything. Detaching happens before abort(), so an aborted
// recognizer's trailing error/end events — which can arrive after the next
// session has started — can neither commit into the wrong step nor clear the
// new session's state.
export function useSpeechDictation() {
    const [activeKey, setActiveKey] = useState(null)
    const [interim, setInterim] = useState('')
    // Set once an engine proves it can't dictate here (an error or a run of
    // empty sessions says 'disable'); hides every mic for the page-load.
    const [unavailable, setUnavailable] = useState(false)
    const sessionRef = useRef(null)
    // Whether any session has returned words since the page loaded. Once the
    // engine has worked, a later failure is treated as transient.
    const hasSucceededRef = useRef(false)
    // Empty, error-free sessions in a row since the last one with words — how
    // a recognizer that fails silently (Opera) gets caught.
    const emptyStreakRef = useRef(0)

    const supported = !unavailable && recognitionCtorFor(currentWindow()) !== null

    // Detach the live session and reset the visible state. Callers decide
    // what happens to the recognizer itself.
    const detach = useCallback(() => {
        const session = sessionRef.current
        if (session) clearTimeout(session.stopTimer)
        sessionRef.current = null
        setActiveKey(null)
        setInterim('')
        return session
    }, [])

    // Drop the live session and whatever it heard.
    const abort = useCallback(() => {
        const session = detach()
        if (!session) return
        try { session.recognition.abort() } catch { /* already stopped */ }
    }, [detach])

    // Say what happened, and hide every mic when the engine can't dictate here.
    // `info` is for "try again" moments that aren't really errors.
    const report = useCallback(({ action, message }, { info = false } = {}) => {
        if (action === 'ignore') return
        if (action === 'disable') setUnavailable(true)
        if (info && action !== 'disable') toast(message, { id: TOAST_ID })
        else toast.error(message, { id: TOAST_ID })
    }, [])

    const fail = useCallback((code) => {
        const online = typeof navigator === 'undefined' || navigator.onLine !== false
        report(
            describeDictationError(code, { online, hasSucceeded: hasSucceededRef.current }),
            { info: code === 'no-speech' },
        )
    }, [report])

    const start = useCallback((key, onText) => {
        abort()
        const Ctor = recognitionCtorFor(currentWindow())
        if (!Ctor) return

        const recognition = new Ctor()
        recognition.continuous = false
        recognition.interimResults = true
        // `lang` stays unset on purpose: it falls back to <html lang="en">,
        // then to the browser's own language.
        const session = {
            key,
            recognition,
            finalText: '',
            interimText: '',
            startedAt: Date.now(),
            stopRequested: false,
            errored: false,
            stopTimer: null,
        }

        // Hand over what was heard and end the session. What the author saw is
        // what they get: an engine that ends without marking its last words
        // final still has them committed.
        session.complete = () => {
            if (sessionRef.current !== session) return
            const text = [session.finalText, session.interimText].filter(Boolean).join(' ')
            detach()
            if (text) {
                emptyStreakRef.current = 0
                onText(text)
                return
            }
            // Nothing heard. An error has already explained itself; a session
            // that simply ended empty hasn't, and is how a recognizer that
            // fails silently shows itself (see isEmptyStrike).
            if (session.errored) return
            const durationMs = Date.now() - session.startedAt
            if (!isEmptyStrike({ stoppedByUser: session.stopRequested, durationMs })) return
            emptyStreakRef.current += 1
            report(
                describeEmptySession({ emptyStreak: emptyStreakRef.current, hasSucceeded: hasSucceededRef.current }),
                { info: true },
            )
        }

        recognition.onresult = (event) => {
            if (sessionRef.current !== session) return
            hasSucceededRef.current = true
            const { finalText, interimText } = readResults(event.results)
            session.finalText = finalText
            session.interimText = interimText
            setInterim([finalText, interimText].filter(Boolean).join(' '))
        }
        // An `end` event follows every error, and that is what closes the
        // session; this only decides what to say.
        recognition.onerror = (event) => {
            if (sessionRef.current !== session) return
            session.errored = true
            fail(event.error)
        }
        recognition.onend = () => session.complete()

        sessionRef.current = session
        setActiveKey(key)
        setInterim('')
        try {
            recognition.start()
        } catch {
            // Some engines throw from start() instead of raising an error event.
            detach()
            fail('start-failed')
        }
    }, [abort, detach, fail, report])

    // Finish the live session and keep what it heard. The engine normally
    // answers stop() with its final words and then `end`; one that never does
    // (iOS Safari has been reported to keep the microphone open) would leave
    // the step stuck listening, so after a grace period we end it ourselves.
    const stop = useCallback(() => {
        const session = sessionRef.current
        if (!session || session.stopTimer) return
        session.stopRequested = true
        session.stopTimer = setTimeout(() => {
            if (sessionRef.current !== session) return
            session.complete()
            try { session.recognition.abort() } catch { /* already stopped */ }
        }, STOP_GRACE_MS)
        try { session.recognition.stop() } catch { /* the timer covers it */ }
    }, [])

    // Leaving the editor mid-dictation must release the microphone, or the
    // browser's recording indicator outlives the page that started it.
    useEffect(() => () => {
        const session = sessionRef.current
        sessionRef.current = null
        if (!session) return
        clearTimeout(session.stopTimer)
        try { session.recognition.abort() } catch { /* already stopped */ }
    }, [])

    return { supported, activeKey, interim, start, stop, abort }
}

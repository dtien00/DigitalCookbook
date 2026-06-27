// Stage 19 (Cooking Mode Timer) — the cross-platform timer-expiry signal: a
// looping WebAudio chime plus navigator.vibrate.
//
// Vibration is Android-only (iOS Safari ignores navigator.vibrate), so the
// audio chime is the primary signal and vibration the bonus. The chime is
// synthesized from a short oscillator envelope — no binary asset to ship or
// version.
//
// iOS / Chrome autoplay policy: an AudioContext won't produce sound unless it
// was created or resumed inside a user-gesture handler. Every timer is started
// (or resumed) from a tap, so primeAudio() is called from that handler to
// unlock playback for the later, gesture-less expiry.
//
// Module-level singletons: there is exactly one AudioContext and one alarm loop
// per page. fireAlarm() is idempotent — flipping a second timer to "done" while
// one is already ringing does not stack a second loop.

let audioCtx = null
let alarmInterval = null
let firing = false

function getCtx() {
    if (audioCtx) return audioCtx
    const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
    if (!Ctx) return null
    try {
        audioCtx = new Ctx()
    } catch {
        audioCtx = null
    }
    return audioCtx
}

// Call from a user-gesture handler (start / resume tap) so the later expiry
// chime is allowed to play on iOS / Chrome.
export function primeAudio() {
    const ctx = getCtx()
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
}

// A friendly two-tone "ding-ding" rather than a harsh buzzer.
function beep() {
    const ctx = getCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const now = ctx.currentTime
    const tones = [
        { at: 0, freq: 880 },     // A5
        { at: 0.18, freq: 1174.7 } // ~D6
    ]
    for (const { at, freq } of tones) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        // Quick attack, short exponential decay — avoids the click of a hard cut.
        gain.gain.setValueAtTime(0.0001, now + at)
        gain.gain.exponentialRampToValueAtTime(0.3, now + at + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.16)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now + at)
        osc.stop(now + at + 0.17)
    }
}

function vibrate() {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([400, 150, 400, 150, 400])
    }
}

// Start the repeating expiry signal. No-op if already ringing (idempotent).
export function fireAlarm() {
    if (firing) return
    firing = true
    beep()
    vibrate()
    alarmInterval = setInterval(() => {
        beep()
        vibrate()
    }, 1600)
}

// Stop the repeating signal and cancel any in-flight vibration.
export function stopAlarm() {
    if (!firing) return
    firing = false
    if (alarmInterval) {
        clearInterval(alarmInterval)
        alarmInterval = null
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(0)
    }
}

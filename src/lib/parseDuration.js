// Stage 19 (Cooking Mode Timer) — parse a human "timer" duration string into
// milliseconds, and format milliseconds back to a clock string.
//
// Parsing accepts (whitespace-tolerant):
//   "10"      -> 10 minutes        (a bare number = minutes; the common
//                                    "set a 10 minute timer" intent)
//   "10:30"   -> 10 min 30 sec
//   "1:05:00" -> 1 hr 5 min
//   "0:45"    -> 45 sec
// Returns a positive integer of milliseconds, or null when the input is empty,
// malformed, or resolves to zero. Mirrors the parseQuantity.js posture: a small
// pure helper the form hands raw input to.
export function parseDurationToMs(raw) {
    if (typeof raw !== 'string') return null
    const s = raw.trim()
    if (!s) return null
    const parts = s.split(':').map(p => p.trim())
    if (parts.length > 3) return null
    // Every segment must be a run of digits (no signs, no decimals).
    if (!parts.every(p => /^\d+$/.test(p))) return null

    let hrs = 0, mins = 0, secs = 0
    if (parts.length === 1) {
        mins = parseInt(parts[0], 10)
    } else if (parts.length === 2) {
        mins = parseInt(parts[0], 10)
        secs = parseInt(parts[1], 10)
    } else {
        hrs = parseInt(parts[0], 10)
        mins = parseInt(parts[1], 10)
        secs = parseInt(parts[2], 10)
    }

    const totalMs = (hrs * 3600 + mins * 60 + secs) * 1000
    return totalMs > 0 ? totalMs : null
}

// Format milliseconds as a clock string. Sub-hour -> "M:SS" (single-digit
// minutes stay un-padded, like a kitchen timer: "9:05" not "09:05"); hour or
// more -> "H:MM:SS". Negative input clamps to 0:00.
export function formatMs(ms) {
    const total = Math.max(0, Math.round(ms / 1000))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const sec = total % 60
    const pad = (n) => String(n).padStart(2, '0')
    if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`
    return `${m}:${pad(sec)}`
}

// What a typed duration actually resolves to, as a clock string — for the live
// readout beside the step-timer field. Empty when the input is empty or
// unparseable, so the caller can simply not render a hint.
//
// The point is the bare-number case: this project reads "10" as ten *minutes*,
// which is a reasonable default and a genuine surprise the first time. Echoing
// "10:00" back settles it without a paragraph of help text.
export function previewDuration(raw) {
    const ms = parseDurationToMs(raw)
    return ms ? formatMs(ms) : ''
}

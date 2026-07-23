// Stage 19 Phase 3 (Clock-dial time picker) — pure geometry for <TimerDial>.
// Angle<->value math for an analog dial, kept React-free so the arithmetic runs
// on plain numbers under Vitest (mirrors dragSortCore.js behind useDragSort).
//
// Clock-angle convention: 0 deg at 12 o'clock, increasing CLOCKWISE, in [0, 360).
// SVG's y-axis points down, so a clock angle A maps to the standard math angle
// (A - 90) deg. Each hand is whole units over a full turn:
//   hours:   0-11  over a 12-unit circle (30 deg / hour)
//   minutes: 0-59  over a 60-unit circle (6 deg / min)
//   seconds: 0-59  over a 60-unit circle (6 deg / sec), snapped to 5s on drag
//
// "No carry": each hand is an independent, clamped value — dragging minutes past
// the top does NOT roll into hours. That keeps the sequential mental model and
// enforces the 11:59:59 ceiling the ROADMAP item calls out (12 o'clock reads as
// zero, so the largest dialable value is 11:59:55).

const FULL_TURN = 360

// The three hands, in the order the ROADMAP item sequences them (hour, minute,
// second). `unitsPerCircle` is the full-turn count; `snap` is the drag/step
// granularity in value units; `max` is the largest legal value — one snap below
// a full turn for the no-carry clamp.
export const HANDS = {
    hours: { unitsPerCircle: 12, snap: 1, max: 11 },
    minutes: { unitsPerCircle: 60, snap: 1, max: 59 },
    seconds: { unitsPerCircle: 60, snap: 5, max: 55 },
}

// The dial's ceiling, in milliseconds (11:59:55). Anything larger belongs to the
// Type field, per the "under 12 hours" scoping.
export const DIAL_MAX_MS = (11 * 3600 + 59 * 60 + 55) * 1000

// Place a point on the dial for a given clock angle (deg). Pure trig; the caller
// passes the SVG center + radius, we hand back {x, y} in the same user units.
export function clockAngleToXY(angleDeg, radius, cx = 0, cy = 0) {
    const rad = ((angleDeg - 90) * Math.PI) / 180
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
}

// Inverse: a point (in the same user units as the center) -> clock angle in
// [0, 360). atan2 measures from +x (3 o'clock) and runs clockwise because y is
// down; +90 rotates the origin to 12 o'clock.
export function xyToClockAngle(px, py, cx = 0, cy = 0) {
    const deg = (Math.atan2(py - cy, px - cx) * 180) / Math.PI
    return (((deg + 90) % FULL_TURN) + FULL_TURN) % FULL_TURN
}

// A whole hand value -> its clock angle.
export function valueToClockAngle(value, unitsPerCircle) {
    return (value / unitsPerCircle) * FULL_TURN
}

// A clock angle -> the nearest snapped whole value, wrapped so a full turn reads
// as 0 (60min -> 0, 12h -> 0). `snapStep` is in value units (1 for hours/minutes,
// 5 for seconds). This is the drag path, so wrapping (not clamping) is correct:
// dragging just clockwise of 12 o'clock should land on 0, not the max.
export function clockAngleToValue(angleDeg, unitsPerCircle, snapStep = 1) {
    const raw = (angleDeg / FULL_TURN) * unitsPerCircle
    const snapped = Math.round(raw / snapStep) * snapStep
    return ((snapped % unitsPerCircle) + unitsPerCircle) % unitsPerCircle
}

// Compose the three hand values into milliseconds. Missing hands read as 0.
export function handsToMs({ hours = 0, minutes = 0, seconds = 0 } = {}) {
    return (hours * 3600 + minutes * 60 + seconds) * 1000
}

// Split milliseconds back into whole hand values — used to seed the dial from the
// Type field. Durations at or beyond 12h are out of the dial's range and pin to
// the 11:59:55 ceiling rather than wrapping; an exact typed value below the cap
// (e.g. 5:37) is preserved so Type -> Dial round-trips without snapping.
export function msToHands(ms) {
    const totalSec = Math.max(0, Math.round((Number(ms) || 0) / 1000))
    if (totalSec >= 12 * 3600) return { hours: 11, minutes: 59, seconds: 55 }
    return {
        hours: Math.floor(totalSec / 3600),
        minutes: Math.floor((totalSec % 3600) / 60),
        seconds: totalSec % 60,
    }
}

// Nudge a hand value by +/-1 step, clamped to [0, max] with no wrap — a stepper
// pressed past either end is a no-op, which reads more predictably than rolling
// 59 -> 0. `hand` is one of the HANDS entries. This is the keyboard / non-drag
// path, so it also fixes the touch-precision problem of a thin dragged hand.
export function stepHandValue(value, hand, direction) {
    const next = value + direction * hand.snap
    return Math.min(hand.max, Math.max(0, next))
}

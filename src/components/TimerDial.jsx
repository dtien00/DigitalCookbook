import { useEffect, useRef, useState } from 'react'
import { formatMs } from '../lib/parseDuration'
import {
    HANDS,
    clockAngleToXY,
    xyToClockAngle,
    valueToClockAngle,
    clockAngleToValue,
    handsToMs,
    msToHands,
    stepHandValue,
} from '../lib/dialGeometry'

// Stage 19 Phase 3 (Clock-dial time picker) — an analog clock-face alternative to
// the custom-time text field in <TimerSetSheet>. You drag a hand (or tap the
// face, or use the ± steppers) to set a duration, alarm-clock style. Hours is
// the default hand and releasing one advances the active hand in reading order
// (hours -> minutes -> seconds, wrapping), so a full duration is set as a
// sequence; the hand selector still lets you jump to any hand directly. All the
// angle<->value math lives in the React-free, unit-tested ../lib/dialGeometry.js.
//
// The whole control is layered *beside* the accessible Type field (its keyboard/
// screen-reader fallback) — the ± steppers additionally give a non-drag path and
// fix the touch-precision problem of a thin dragged hand. `onChange(ms)` feeds
// the shared readout + Start button the sheet owns.

const VIEW = 200 // viewBox is 0 0 200 200; center at (C, C)
const C = 100
const HAND_ORDER = ['hours', 'minutes', 'seconds']
const HAND_LABELS = { hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds' }

// Per-hand geometry + paint styling; `On`/`Off` are the active vs faint variants.
// Hours/minutes keep one width; only seconds thins when inactive.
const HAND_STYLE = {
    hours:   { units: 12, length: 40, widthOn: 5,   widthOff: 5, colorOn: 'stroke-ink',  colorOff: 'stroke-ink/35' },
    minutes: { units: 60, length: 62, widthOn: 4,   widthOff: 4, colorOn: 'stroke-ink',  colorOff: 'stroke-ink/35' },
    seconds: { units: 60, length: 70, widthOn: 2.5, widthOff: 2, colorOn: 'stroke-rust', colorOff: 'stroke-rust/40' },
}
// Paint longest hand first so the shortest ends up on top — that keeps each hand's
// knob (drawn at its tip) clear of shorter hands, which never reach that radius.
const HAND_PAINT_ORDER = ['seconds', 'minutes', 'hours']

// 60 tick marks; every 5th (the numeral positions) is a longer/darker "major".
const TICKS = Array.from({ length: 60 }, (_, i) => {
    const major = i % 5 === 0
    const a = (i / 60) * 360
    return {
        major,
        p1: clockAngleToXY(a, 90, C, C),
        p2: clockAngleToXY(a, major ? 80 : 84, C, C),
    }
})

// 1..12 numerals; 12 sits at the top and reads as zero for a duration. They
// double as the 5-unit grid for every hand (minutes 1->:05, seconds 1->:05s).
const NUMERALS = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1
    return { n, ...clockAngleToXY((n / 12) * 360, 68, C, C) }
})

function Hand({ hand, length, width, colorClass, active, animate, slow }) {
    return (
        <g
            style={{ transform: `rotate(${valueToClockAngle(hand.value, hand.units)}deg)`, transformOrigin: `${C}px ${C}px` }}
            className={animate ? `transition-transform ${slow ? 'duration-1000' : 'duration-200'} ease-out motion-reduce:transition-none` : undefined}
        >
            <line
                x1={C}
                y1={C}
                x2={C}
                y2={C - length}
                strokeWidth={width}
                strokeLinecap="round"
                className={colorClass}
            />
            {active && (
                <circle
                    cx={C}
                    cy={C - length}
                    r="12"
                    className={`fill-[#fbf6f1] ${colorClass}`}
                    strokeWidth="2.5"
                />
            )}
        </g>
    )
}

export default function TimerDial({ initialMs = 0, onChange }) {
    const [hands, setHands] = useState(() => msToHands(initialMs))
    const [activeHand, setActiveHand] = useState('hours')
    const [dragging, setDragging] = useState(false)
    // `dragging` = pointer is down; `tracking` = pointer has actually moved while
    // down. Animation is gated on `tracking`, not `dragging`, so a plain tap glides
    // the hand to the tapped spot (nothing moved yet) while a real drag tracks the
    // finger 1:1 with no transition (first move flips `tracking`, killing the glide).
    const [tracking, setTracking] = useState(false)
    // Which speed the current glide uses: a tap-to-place sweeps slowly and
    // deliberately, the ± steppers stay snappy. Set true on pointer-down (a tap),
    // false in step(), so each non-drag path animates at its own pace.
    const [slowGlide, setSlowGlide] = useState(false)
    const svgRef = useRef(null)

    // Sync the seed value up on mount so the sheet's Start button + readout match
    // whatever we were seeded from (e.g. a value carried over from the Type tab).
    useEffect(() => {
        onChange(handsToMs(hands))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function applyHands(next) {
        setHands(next)
        onChange(handsToMs(next))
    }

    // Map a pointer event to the active hand's snapped value and apply it. Tapping
    // anywhere on the face jumps the hand there; dragging tracks the finger.
    function setFromPointer(e) {
        const rect = svgRef.current?.getBoundingClientRect()
        if (!rect || rect.width === 0) return
        const vx = ((e.clientX - rect.left) / rect.width) * VIEW
        const vy = ((e.clientY - rect.top) / rect.height) * VIEW
        const angle = xyToClockAngle(vx, vy, C, C)
        const spec = HANDS[activeHand]
        const value = clockAngleToValue(angle, spec.unitsPerCircle, spec.snap)
        applyHands({ ...hands, [activeHand]: value })
    }

    function onPointerDown(e) {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        setDragging(true)
        setSlowGlide(true) // a tap-place glides slowly; a real drag kills the glide on first move
        setFromPointer(e)
    }
    function onPointerMove(e) {
        if (!dragging) return
        setTracking(true) // first real movement — switch from glide to 1:1 tracking
        setFromPointer(e)
    }
    function endDrag(e) {
        setDragging(false)
        setTracking(false)
        e.currentTarget.releasePointerCapture?.(e.pointerId)
        // Advance to the next hand on release (wrapping seconds -> hours) so a duration
        // is set in reading order without reaching for the selector. Functional-updater
        // form reads the current hand safely rather than the render's stale `activeHand`.
        setActiveHand(cur => HAND_ORDER[(HAND_ORDER.indexOf(cur) + 1) % HAND_ORDER.length])
    }

    function step(direction) {
        setSlowGlide(false) // steppers feel snappy, not a slow sweep
        const spec = HANDS[activeHand]
        applyHands({ ...hands, [activeHand]: stepHandValue(hands[activeHand], spec, direction) })
    }

    const ms = handsToMs(hands)
    const atCeiling = hands.hours === HANDS.hours.max
    const showSeconds = activeHand === 'seconds' || hands.seconds > 0

    return (
        <div className="flex flex-col items-center">
            <svg
                ref={svgRef}
                viewBox={`0 0 ${VIEW} ${VIEW}`}
                className="w-56 h-56 sm:w-60 sm:h-60 select-none touch-none cursor-pointer"
                role="group"
                aria-label={`Timer dial — ${formatMs(ms)}, setting ${activeHand}. Drag a hand, or use the minus and plus buttons below.`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
            >
                {/* Face */}
                <circle cx={C} cy={C} r="94" className="fill-[#fbf6f1] stroke-paper-shade" strokeWidth="2" />
                {/* Ticks */}
                {TICKS.map((t, i) => (
                    <line
                        key={i}
                        x1={t.p1.x}
                        y1={t.p1.y}
                        x2={t.p2.x}
                        y2={t.p2.y}
                        strokeWidth={t.major ? 1.5 : 1}
                        className={t.major ? 'stroke-ink/40' : 'stroke-ink/15'}
                    />
                ))}
                {/* Numerals */}
                {NUMERALS.map(({ n, x, y }) => (
                    <text
                        key={n}
                        x={x}
                        y={y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="fill-ink/35 font-display"
                        fontSize="12"
                    >
                        {n}
                    </text>
                ))}

                {/* All three hands render persistently with stable keys and never
                    unmount on active-change, so a tap-glide begun while a hand is active
                    keeps animating to completion even after endDrag cycles the active
                    hand away. The <g> that carries the transform transition keeps an
                    identical className across the active<->inactive swap (only its
                    children change), so the browser never tears down the in-flight glide.
                    Inactive hands are faint; the active one is full-strength with a knob.
                    Hub is rendered after, so it stays on top. */}
                {HAND_PAINT_ORDER.map(h => {
                    if (h === 'seconds' && !showSeconds) return null
                    const isActive = activeHand === h
                    const s = HAND_STYLE[h]
                    return (
                        <Hand
                            key={h}
                            hand={{ value: hands[h], units: s.units }}
                            length={s.length}
                            width={isActive ? s.widthOn : s.widthOff}
                            colorClass={isActive ? s.colorOn : s.colorOff}
                            active={isActive}
                            // Every hand keeps its transition EXCEPT the one being dragged
                            // (1:1 finger tracking). That's what lets a just-deactivated
                            // hand finish its glide instead of snapping.
                            animate={!(isActive && tracking)}
                            slow={slowGlide}
                        />
                    )
                })}

                {/* Center hub */}
                <circle cx={C} cy={C} r="5" className="fill-ink" />
                <circle cx={C} cy={C} r="2" className="fill-rust" />
            </svg>

            {/* Readout + ± steppers for the active hand (the non-drag / keyboard path) */}
            <div className="flex items-center gap-3 mt-3">
                <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label={`Decrease ${activeHand}`}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-paper-shade hover:bg-tan/40 text-ink transition-colors"
                >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </button>
                <div className="text-center min-w-[6.5rem]">
                    <div className="font-serif tabular-nums text-3xl leading-none text-ink" aria-live="polite">
                        {formatMs(ms)}
                    </div>
                    <div className="font-display text-[0.65rem] uppercase tracking-wider text-ink/50 mt-1">{activeHand}</div>
                </div>
                <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label={`Increase ${activeHand}`}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-paper-shade hover:bg-tan/40 text-ink transition-colors"
                >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </button>
            </div>

            {/* Hand selector — which hand drag / ± acts on. Hours pre-selected. */}
            <div role="group" aria-label="Which hand to set" className="flex gap-1.5 mt-3">
                {HAND_ORDER.map(h => {
                    const on = activeHand === h
                    return (
                        <button
                            key={h}
                            type="button"
                            onClick={() => setActiveHand(h)}
                            aria-pressed={on}
                            className={`px-3 min-h-[36px] rounded-full text-sm font-medium transition-colors ${
                                on ? 'bg-rust text-paper' : 'bg-paper-shade hover:bg-tan/40 text-ink'
                            }`}
                        >
                            {HAND_LABELS[h]}
                        </button>
                    )
                })}
            </div>

            {/* Visual note: the dial is capped under 12 hours. Emphasizes when the
                hour hand is pinned at its 11-hour ceiling. */}
            <p
                className={`mt-3 flex items-center gap-1.5 font-serif italic text-xs text-center transition-colors ${
                    atCeiling ? 'text-rose-dark font-medium not-italic' : 'text-rose'
                }`}
            >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                </svg>
                {atCeiling ? 'Dial maxes out under 12 h — switch to Type for longer' : 'Covers up to 11:59:55 — switch to Type for longer'}
            </p>
        </div>
    )
}

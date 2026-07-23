import { describe, it, expect } from 'vitest'
import {
    HANDS,
    DIAL_MAX_MS,
    clockAngleToXY,
    xyToClockAngle,
    valueToClockAngle,
    clockAngleToValue,
    handsToMs,
    msToHands,
    stepHandValue,
} from './dialGeometry'

// Pins the angle<->value arithmetic behind <TimerDial>. React-free by design, so
// the whole surface runs on plain numbers — angles in clock degrees (0 at 12
// o'clock, clockwise), values in whole hand units.

describe('valueToClockAngle', () => {
    it('maps 3 hours to 90 degrees (3 o\'clock)', () => {
        expect(valueToClockAngle(3, 12)).toBe(90)
    })
    it('maps 15 minutes to 90 degrees', () => {
        expect(valueToClockAngle(15, 60)).toBe(90)
    })
    it('maps 30 minutes to the bottom (180)', () => {
        expect(valueToClockAngle(30, 60)).toBe(180)
    })
    it('maps 0 to the top (0)', () => {
        expect(valueToClockAngle(0, 60)).toBe(0)
    })
})

describe('clockAngleToValue', () => {
    it('snaps hours to whole hours', () => {
        expect(clockAngleToValue(90, 12, 1)).toBe(3)
        expect(clockAngleToValue(30, 12, 1)).toBe(1)
    })
    it('snaps minutes to whole minutes', () => {
        expect(clockAngleToValue(90, 60, 1)).toBe(15)
        expect(clockAngleToValue(6, 60, 1)).toBe(1)
    })
    it('snaps seconds to the nearest 5', () => {
        expect(clockAngleToValue(120, 60, 5)).toBe(20) // 20s dead-on
        expect(clockAngleToValue(12, 60, 5)).toBe(0) // 2s -> 0
        expect(clockAngleToValue(21, 60, 5)).toBe(5) // 3.5s -> 5
    })
    it('wraps a full turn back to 0, never to the max', () => {
        expect(clockAngleToValue(359, 12, 1)).toBe(0) // just cw of 12 o'clock
        expect(clockAngleToValue(359, 60, 1)).toBe(0)
        expect(clockAngleToValue(360, 60, 1)).toBe(0)
    })
    it('reaches the 11 o\'clock / 59-minute positions', () => {
        expect(clockAngleToValue(330, 12, 1)).toBe(11)
        expect(clockAngleToValue(354, 60, 1)).toBe(59)
    })
    it('round-trips every whole value through its angle', () => {
        for (let h = 0; h < 12; h++) {
            expect(clockAngleToValue(valueToClockAngle(h, 12), 12, 1)).toBe(h)
        }
        for (let m = 0; m < 60; m++) {
            expect(clockAngleToValue(valueToClockAngle(m, 60), 60, 1)).toBe(m)
        }
    })
})

describe('clockAngleToXY / xyToClockAngle', () => {
    const cx = 100
    const cy = 100
    const r = 90

    it('places 0 degrees straight up', () => {
        const { x, y } = clockAngleToXY(0, r, cx, cy)
        expect(x).toBeCloseTo(100)
        expect(y).toBeCloseTo(10)
    })
    it('places 90 degrees at 3 o\'clock', () => {
        const { x, y } = clockAngleToXY(90, r, cx, cy)
        expect(x).toBeCloseTo(190)
        expect(y).toBeCloseTo(100)
    })
    it('inverts back to the same angle', () => {
        for (const a of [0, 45, 90, 137, 180, 270, 359]) {
            const { x, y } = clockAngleToXY(a, r, cx, cy)
            expect(xyToClockAngle(x, y, cx, cy)).toBeCloseTo(a)
        }
    })
})

describe('handsToMs', () => {
    it('composes hours, minutes, seconds', () => {
        expect(handsToMs({ hours: 1, minutes: 5, seconds: 30 })).toBe(3930000)
    })
    it('treats missing hands and no arg as zero', () => {
        expect(handsToMs({ minutes: 2 })).toBe(120000)
        expect(handsToMs()).toBe(0)
    })
})

describe('msToHands', () => {
    it('splits a sub-12h duration exactly (no snapping)', () => {
        expect(msToHands(3930000)).toEqual({ hours: 1, minutes: 5, seconds: 30 })
        expect(msToHands(337000)).toEqual({ hours: 0, minutes: 5, seconds: 37 })
    })
    it('preserves an exact 11:59:59 typed value', () => {
        expect(msToHands((11 * 3600 + 59 * 60 + 59) * 1000)).toEqual({ hours: 11, minutes: 59, seconds: 59 })
    })
    it('pins anything >= 12h to the 11:59:55 ceiling', () => {
        expect(msToHands(12 * 3600 * 1000)).toEqual({ hours: 11, minutes: 59, seconds: 55 })
        expect(msToHands(48 * 3600 * 1000)).toEqual({ hours: 11, minutes: 59, seconds: 55 })
    })
    it('clamps zero and negative to all-zero', () => {
        expect(msToHands(0)).toEqual({ hours: 0, minutes: 0, seconds: 0 })
        expect(msToHands(-5000)).toEqual({ hours: 0, minutes: 0, seconds: 0 })
    })
})

describe('stepHandValue', () => {
    it('steps minutes by 1 and clamps at 0 / 59', () => {
        expect(stepHandValue(10, HANDS.minutes, 1)).toBe(11)
        expect(stepHandValue(59, HANDS.minutes, 1)).toBe(59)
        expect(stepHandValue(0, HANDS.minutes, -1)).toBe(0)
    })
    it('steps hours by 1 and clamps at 11', () => {
        expect(stepHandValue(11, HANDS.hours, 1)).toBe(11)
        expect(stepHandValue(11, HANDS.hours, -1)).toBe(10)
    })
    it('steps seconds by 5 and clamps at the 55 ceiling', () => {
        expect(stepHandValue(50, HANDS.seconds, 1)).toBe(55)
        expect(stepHandValue(55, HANDS.seconds, 1)).toBe(55)
        expect(stepHandValue(5, HANDS.seconds, -1)).toBe(0)
    })
})

describe('DIAL_MAX_MS', () => {
    it('is exactly 11:59:55', () => {
        expect(DIAL_MAX_MS).toBe((11 * 3600 + 59 * 60 + 55) * 1000)
    })
})

import { describe, it, expect } from 'vitest'
import { toISODate, startOfWeek, addDays } from './week'

describe('toISODate', () => {
    it('formats a date as local YYYY-MM-DD', () => {
        expect(toISODate(new Date(2026,6,28))).toBe("2026-07-28")
    })               // :7   (new Date(2026,6,28) → "2026-07-28")
    it('zero-pads single-digit month and day', () => {
        expect(toISODate(new Date(2026,0,5))).toBe("2026-01-05")
    })             // :9-10 (new Date(2026,0,5) → "2026-01-05")
})

describe('startOfWeek', () => {
    it('returns the same day when given a Monday', () => {
        expect(startOfWeek(new Date(2026,6,27))).toStrictEqual(new Date(2026,6,27))
    })          // :16  (dow 0)
    it('walks back to Monday from a Sunday', () => {
        expect(startOfWeek(new Date(2026,6,26))).toStrictEqual(new Date(2026,6,20))
    })                // :18  (Sunday → previous Monday)  ← boundary
    it('normalizes to local midnight', () => {
        expect(startOfWeek(new Date(2026,6,27))).toStrictEqual(new Date(2026,6,27))
    })                      // hours/mins are 0
})

describe('addDays', () => {
    it('adds N days, crossing a month boundary', () => {
        expect(addDays(new Date(2026,6,31), 1)).toStrictEqual(new Date(2026,7,1))
    })            // :23  (Jul 31 + 1 → Aug 1)
    it('handles negative N', () => {
        expect(addDays(new Date(2026,6,31), -1)).toStrictEqual(new Date(2026,6,30))
    })                                // (−7 → a week earlier)
    it('does NOT mutate the input date', () => {
        const input = new Date(2026,6,31)
        addDays(input,5)
        expect(input).toStrictEqual(new Date(2026,6,31))
    })                    // :24  ← purity: original Date unchanged
})
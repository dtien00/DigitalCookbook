import { describe, it, expect } from 'vitest'
import { parseDurationToMs, formatMs } from './parseDuration'

describe('parseDurationToMs', () => {
    it('returns null for a non-string', () => {
        expect(parseDurationToMs(0)).toBe(null)
        expect(parseDurationToMs(1)).toBe(null)
        expect(parseDurationToMs(null)).toBe(null)
        expect(parseDurationToMs(undefined)).toBe(null)
    })                    // :14  (number, null, undefined)
    it('returns null for empty / whitespace', () => {
        expect(parseDurationToMs("")).toBe(null)
        expect(parseDurationToMs("     ")).toBe(null)
    })              // :16
    it('reads a bare number as minutes', () => {
        expect(parseDurationToMs("1")).toBe(60000)
        expect(parseDurationToMs("10")).toBe(600000)
        expect(parseDurationToMs("60")).toBe(3600000)
    })                   // :23  ("10" → 600000)
    it('reads M:SS', () => {
        expect(parseDurationToMs("0:45")).toBe(45000)
        expect(parseDurationToMs("10:30")).toBe(630000)
    })                                       // :25  ("10:30", "0:45")
    it('reads H:MM:SS', () => {
        expect(parseDurationToMs("1:00:00")).toBe(3600000)
        expect(parseDurationToMs("1:10:45")).toBe(4245000)
    })                                    // :28  ("1:05:00")
    it('returns null for more than 3 segments', () => {
        expect(parseDurationToMs("0:1:2:3")).toBe(null)
        expect(parseDurationToMs("1:2:3:4")).toBe(null)
        expect(parseDurationToMs("1;2:3:4")).toBe(null)
        expect(parseDurationToMs("1:2:3;4")).toBe(null)
        expect(parseDurationToMs("1:2;3:4")).toBe(null)
        expect(parseDurationToMs("1;2;3;4")).toBe(null)
    })            // :18  ("1:2:3:4")  ← boundary (3 vs 4)
    it('returns null for a non-digit segment', () => {
        expect(parseDurationToMs("-5")).toBe(null)
        expect(parseDurationToMs("10.5")).toBe(null)
        expect(parseDurationToMs("1:5a")).toBe(null)
    })             // :20  ("10.5", "-5", "1:5a")
    it('returns null when the total is zero', () => {
        expect(parseDurationToMs("0")).toBe(null)
        expect(parseDurationToMs("0:00")).toBe(null)
        expect(parseDurationToMs("0:0:00")).toBe(null)
        expect(parseDurationToMs("0:00:00")).toBe(null)
    })              // :35  ("0", "0:00")  ← boundary
    it('tolerates whitespace around segments', () => {
        expect(parseDurationToMs("   1 :    01:  01")).toBe(3661000)
    })             // " 1 : 05 : 00 "  (parts are trimmed)
})

describe('formatMs (inverse of parseDurationToMs)', () => {
    it('formats sub-hour as M:SS with unpadded minutes', () => {
        expect(formatMs(545000)).toBe("9:05")
        expect(formatMs(630000)).toBe("10:30")
    })   // :48  (630000 → "10:30", 545000 → "9:05")
    it('formats hour-plus as H:MM:SS', () => {
        expect(formatMs(1000)).toBe("0:01")
        expect(formatMs(3900000)).toBe("1:05:00")
    })                     // :47  (3900000 → "1:05:00")
    it('clamps negative input to 0:00', () => {
        expect(formatMs(-1)).toBe("0:00")
    })                    // :42
    it('rounds to the nearest second', () => {
        expect(formatMs(1499)).toBe("0:01")
        expect(formatMs(1500)).toBe("0:02")
    })                     // :42  (1500 → "0:02")
})

describe('round-trip', () => {
    it('formatMs(parseDurationToMs("10:30")) === "10:30"', () => {
        expect(parseDurationToMs(formatMs(1000))).toBe(1000)
        expect(formatMs(parseDurationToMs("10:30"))).toBe("10:30")
        expect(formatMs(parseDurationToMs("0:15:45"))).toBe("15:45")
    })
})
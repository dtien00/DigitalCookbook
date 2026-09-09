import { describe, it, expect } from 'vitest'
import {parseQuantity, quantityToDisplay, appendFraction, FRACTION_GLYPHS} from './parseQuantity'

describe('parseQuantity', () => {
    it('returns null for null/undefined input', () => {
        expect(parseQuantity(null)).toBe(null)
        expect(parseQuantity(undefined)).toBe(null)
    })            // parseQuantity.js:28
    it('passes a finite number straight through', () => {
        expect(parseQuantity("1.5")).toBe(1.5)
        expect(parseQuantity("30")).toBe(30)
        expect(parseQuantity(1.5)).toBe(1.5)
        expect(parseQuantity(30)).toBe(30)
    })          // :30  (e.g. 1.5)
    it('returns null for a non-finite number', () => {
        expect(parseQuantity(NaN)).toBe(null)
        expect(parseQuantity(Infinity)).toBe(null)
    })             // :30  (NaN, Infinity)
    it('returns null for empty / whitespace-only string', () => {
        expect(parseQuantity("")).toBe(null)
        expect(parseQuantity("          ")).toBe(null)
    })          // :33
    it('reads a bare unicode fraction glyph', () => {
        expect(parseQuantity("½")).toBe(0.5)
    })              // :48  ("½" → ?)
    it('adds a glyph onto a leading whole number', () => {
        expect(parseQuantity("1½")).toBe(1.5)
        expect(parseQuantity("1 ½")).toBe(1.5)
    })         // :48  ("1 ½", "1½" → ?)
    it('parses a mixed number with space or hyphen', () => {
        expect(parseQuantity("1 1/2")).toBe(1.5)
        expect(parseQuantity("1-1/2")).toBe(1.5)
    })       // :52  ("1 1/2", "1-1/2" → ?)
    it('parses a simple fraction', () => {
        expect(parseQuantity("3/4")).toBe(0.75)
    })                         // :61  ("3/4" → ?)
    it('parses a plain integer and a plain decimal', () => {
        expect(parseQuantity("2")).toBe(2)
        expect(parseQuantity("1.5")).toBe(1.5)
    })       // :70  ("2", "1.5")
    it('returns null on a zero denominator', () => {
        expect(parseQuantity("1/0")).toBe(null)
        expect(parseQuantity("1 1/0")).toBe(null)
    })               // :56/:65  ("1/0", "1 1/0")  ← boundary
    it('returns null on unparseable garbage', () => {
        expect(parseQuantity("abc")).toBe(null)
    })              // :73  ("abc")
    it('tolerates surrounding whitespace', () => {
        expect(parseQuantity("      1/2          ")).toBe(0.5)
        expect(parseQuantity("       ½         ")).toBe(0.5)
        expect(parseQuantity("   1    ½         ")).toBe(1.5)
        expect(parseQuantity("   11    ½         ")).toBe(11.5)
    })                 // "  1/2  "
})

describe('quantityToDisplay (inverse of parseQuantity)', () => {
    it('returns "" for null / 0 / non-finite', () => {
        expect(quantityToDisplay(null)).toBe("")
        expect(quantityToDisplay(0)).toBe("")
        expect(quantityToDisplay(Infinity)).toBe("")
        expect(quantityToDisplay(-Infinity)).toBe("")
        expect(quantityToDisplay(NaN)).toBe("")
    })             // :80-82
    it('renders a whole number with no decimal', () => {
        expect(quantityToDisplay(2)).toBe("2")
    })           // :86  (2 → "2")
    it('renders a bare glyph when whole part is 0', () => {
        expect(quantityToDisplay(0.5)).toBe("½")
    })        // :89  (0.5 → "½")
    it('joins whole + glyph', () => {
        expect(quantityToDisplay(1.5)).toBe("1 ½")
    })                              // :89  (1.5 → "1 ½")
    it('falls back to a rounded decimal with no glyph', () => {
        expect(quantityToDisplay(1.2)).toBe("1.2")
    })    // :92  (1.2 → "1.2")
})

describe('round-trip', () => {
    it('quantityToDisplay(parseQuantity(x)) recovers canonical form', () => {
        expect(quantityToDisplay(parseQuantity("1 ½"))).toBe("1 ½")
        expect(quantityToDisplay(parseQuantity("1.50"))).toBe("1 ½")
    }) // "1 ½" → 1.5 → "1 ½"  (clean) ; "1.50" → 1.5 → "1 ½"  (lossy → canonical)
    it('parseQuantity(quantityToDisplay(x)) preserves numerical value', () => {
        expect(parseQuantity(quantityToDisplay(1.50))).toBe(1.5)
        expect(parseQuantity(quantityToDisplay(1.12500000))).toBe(1.125)
    }) // 1.5 → "1 ½" → 1.5  (clean)
    
})

// Phone fraction chips: tapping a glyph should read as the last keystroke of
// the amount, and the result must survive parseQuantity unchanged.
describe('appendFraction', () => {
    it('starts a bare fraction in an empty field', () => {
        expect(appendFraction('', '½')).toBe('½')
        expect(parseQuantity(appendFraction('', '½'))).toBe(0.5)
    })
    it('appends to a whole number', () => {
        expect(appendFraction('1', '½')).toBe('1½')
        expect(parseQuantity(appendFraction('1', '½'))).toBe(1.5)
    })
    it('ignores a trailing space so "1 " does not become "1 ½" twice over', () => {
        expect(appendFraction('1 ', '½')).toBe('1½')
    })
    it('replaces a trailing glyph instead of stacking two', () => {
        // Nobody means "1½¼" - a second tap is a correction.
        expect(appendFraction('1½', '¼')).toBe('1¼')
        expect(parseQuantity(appendFraction('1½', '¼'))).toBe(1.25)
    })
    it('replaces a lone glyph', () => {
        expect(appendFraction('½', '¾')).toBe('¾')
    })
    it('handles null/undefined as an empty field', () => {
        expect(appendFraction(null, '½')).toBe('½')
        expect(appendFraction(undefined, '½')).toBe('½')
    })

    it('every offered glyph round-trips through parseQuantity', () => {
        for (const glyph of FRACTION_GLYPHS) {
            // Bare, and after a whole number - both must yield a finite number.
            expect(parseQuantity(appendFraction('', glyph))).toBeGreaterThan(0)
            expect(parseQuantity(appendFraction('2', glyph))).toBeGreaterThan(2)
        }
    })
    it('offers six glyphs, one row at phone width', () => {
        expect(FRACTION_GLYPHS).toHaveLength(6)
    })
})

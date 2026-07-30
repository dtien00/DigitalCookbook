import { describe, it, expect } from 'vitest'
import { scaleQuantity } from './scaleQuantity'

// Pins the servings-multiplier display logic (RecipeDetail's −/+ stepper). A
// wrong scaled quantity misleads someone mid-cook, so the fraction table
// (¼ ½ ¾ ⅓ ⅔), the 2-dp rounding, and the falsy pass-through are all covered
// explicitly. Quantities are stored NUMERIC, so inputs are a number or null.
describe('scaleQuantity', () => {
    it('passes falsy quantities through untouched, keeping the original type', () => {
        // The guard returns the input as-is — null stays null, 0 stays a number,
        // neither gets stringified the way the normal path does.
        expect(scaleQuantity(null, 2)).toBe(null)
        expect(scaleQuantity(0, 5)).toBe(0)
    })

    it('renders a whole-number result with no trailing decimal', () => {
        expect(scaleQuantity(2, 2)).toBe('4')
        expect(scaleQuantity(1, 1)).toBe('1')
    })

    describe('common fractions', () => {
        it('substitutes each of the five supported fractions', () => {
            expect(scaleQuantity(0.25, 1)).toBe('¼')
            expect(scaleQuantity(0.5, 1)).toBe('½')
            expect(scaleQuantity(0.75, 1)).toBe('¾')
            expect(scaleQuantity(1, 1 / 3)).toBe('⅓') // 0.333… rounds to 0.33
            expect(scaleQuantity(2, 1 / 3)).toBe('⅔') // 0.666… rounds to 0.67
        })

        it('shows a bare fraction when the whole part is zero', () => {
            expect(scaleQuantity(0.5, 1)).toBe('½')
        })

        it('joins a non-zero whole part to the fraction with a space', () => {
            expect(scaleQuantity(0.5, 3)).toBe('1 ½') // 1.5
            expect(scaleQuantity(1.5, 1)).toBe('1 ½')
        })
    })

    describe('decimals with no fraction match', () => {
        it('falls back to the plain decimal string', () => {
            expect(scaleQuantity(0.1, 1)).toBe('0.1')
        })

        it('does not split the whole part off a non-matching decimal', () => {
            // 2.1 stays "2.1" rather than "2" + a leftover fraction — current contract.
            expect(scaleQuantity(2.1, 1)).toBe('2.1')
        })
    })

    it('rounds the scaled value to 2 decimal places before formatting', () => {
        // 0.333 × 3 = 0.999 → rounds to 1.00 → renders as the whole "1".
        expect(scaleQuantity(0.333, 3)).toBe('1')
    })
})

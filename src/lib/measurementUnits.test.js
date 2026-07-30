import {describe, it, expect} from 'vitest'
import {matchUnits, MEASUREMENT_UNITS, MAX_SUGGESTIONS} from './measurementUnits'

describe('matchUnits', () => {
    
    it('returns the head of the list for empty/whitespace query', () => {
        expect(matchUnits("")).toEqual([
            'teaspoon', 'tablespoon', 'cup', 'fluid ounce',
            'pint', 'quart', 'gallon', 'milliliter'
        ])
    })  // :59  (first 8 labels)
    it('matches on an alias, not just the label', () => {
        expect(matchUnits("tbsp")).toEqual(["tablespoon"])
    })                  // :63  ("tbsp" → ["tablespoon"])
    it('is case-insensitive', () => {
        expect(matchUnits("TBSP")).toEqual(["tablespoon"])
    })                                      // :58  ("TBSP" → ["tablespoon"])
    it('returns [] when nothing matches', () => {
        expect(matchUnits("xyz")).toEqual([])
    })                          // "xyz"
    it('ranks start-of-string matches before mid-string matches', () => {
        const result = matchUnits('ounce')
        // Guard presence first — indexOf on a missing item returns -1, which can
        // sneak past a naive "less than" check (see below).
        expect(result).toContain('ounce')        // query at index 0
        expect(result).toContain('fluid ounce')  // query at index 6
        // The property under test: the start-of-string match ranks first.
        expect(result.indexOf('ounce')).toBeLessThan(result.indexOf('fluid ounce'))
    })  // :67  ("c": "cup"/"can" before "fluid ounce")
    it(`caps results at ${MAX_SUGGESTIONS}`, () => {
        const match_broad = matchUnits("s") // broad query — many units contain "s"
        expect(match_broad).toHaveLength(MAX_SUGGESTIONS)
    })  // :50  (a broad query like "s")  ← boundary
})

describe('MEASUREMENT_UNITS data integrity', () => {
    it('has unique, non-empty labels', () => {
        const labels = MEASUREMENT_UNITS.map(u => u.label)
        const empties = labels.filter(l => !l || l.trim() === '')
        const dupes = labels.filter((l, i) => labels.indexOf(l) !== i)

        expect(empties).toEqual([])   // names the offender on failure

        expect(dupes).toEqual([])   // on failure prints e.g. ['cup'] — the offender

        // Unique: Set size vs array length.
        expect(new Set(labels).size).toBe(labels.length)
    })                             // optional: guards future edits
})
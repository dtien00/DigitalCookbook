import {describe, it, expect} from 'vitest'
import {matchUnits, repairReversedUnit, MEASUREMENT_UNITS, MAX_SUGGESTIONS, COMMON_UNITS, UNIT_GROUPS, unitsInGroup, isCanonicalUnit} from './measurementUnits'

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

// Regression net for the mobile IME bug that stored unit strings backwards
// (see src/lib/imeComposition.js). These are the literal values that reached
// the ingredients table on the "Braised Eggs" and "Butter Chicken" recipes.
describe('repairReversedUnit', () => {
    const OBSERVED = [
        ['noopselbAT', 'tablespoon'],  // typed "TAblespoon"
        ['psBT', 'tablespoon'],        // typed "TBsp"
        ['pST', 'teaspoon'],           // typed "TSp"
        ['pUC', 'cup'],                // typed "CUp"
        ['sklaTS', 'stalk'],           // typed "STalks"
        ['sevoLC', 'clove'],           // typed "CLoves"
        ['seceIP', 'piece'],           // typed "PIeces"
    ]

    it.each(OBSERVED)('repairs %s to %s', (stored, expected) => {
        expect(repairReversedUnit(stored)).toBe(expected)
    })

    it('leaves canonical labels and aliases alone', () => {
        for (const ok of ['cup', 'tablespoon', 'tbsp', 'TBSP', 'grams', 'fl oz', 'to taste']) {
            expect(repairReversedUnit(ok)).toBeNull()
        }
    })

    it('never rewrites a palindromic unit', () => {
        // 'g', 'l' and 'c' are their own reverse — the known-unit check has to
        // win before the reversal check, or these would rewrite themselves.
        for (const p of ['g', 'l', 'c']) expect(repairReversedUnit(p)).toBeNull()
    })

    it('leaves unrecognised free text alone', () => {
        // The column is deliberately free text; these all exist in the live
        // data and are not reversals of anything.
        for (const free of ['pouch', 'thumb', 'large', 'Thumbs', 'spoons', 'large spoons', 'Bottle']) {
            expect(repairReversedUnit(free)).toBeNull()
        }
    })

    it('handles empty and missing values', () => {
        for (const empty of ['', '   ', null, undefined]) {
            expect(repairReversedUnit(empty)).toBeNull()
        }
    })
})


// The mobile unit sheet renders entirely from these, so a unit with a missing
// or misspelled group would silently vanish from the picker.
describe('unit groups (mobile sheet)', () => {
    it('gives every unit a group the sheet knows how to render', () => {
        const known = new Set(UNIT_GROUPS.map(g => g.id))
        const orphans = MEASUREMENT_UNITS.filter(u => !known.has(u.group)).map(u => u.label)
        expect(orphans).toEqual([])   // names the offender on failure
    })

    it('renders every unit exactly once across all groups', () => {
        const rendered = UNIT_GROUPS.flatMap(g => unitsInGroup(g.id))
        expect(rendered).toHaveLength(MEASUREMENT_UNITS.length)
        expect(new Set(rendered).size).toBe(MEASUREMENT_UNITS.length)
    })

    it('unitsInGroup returns labels in declaration order', () => {
        expect(unitsInGroup('weight')).toEqual(['gram', 'kilogram', 'milligram', 'ounce', 'pound'])
    })

    it('unitsInGroup returns [] for an unknown group', () => {
        expect(unitsInGroup('nope')).toEqual([])
    })
})

describe('COMMON_UNITS', () => {
    it('are all real canonical labels', () => {
        const labels = new Set(MEASUREMENT_UNITS.map(u => u.label))
        const bogus = COMMON_UNITS.filter(u => !labels.has(u))
        expect(bogus).toEqual([])
    })
    it('fills a 3-wide chip grid exactly', () => {
        expect(COMMON_UNITS).toHaveLength(9)
    })
    it('has no duplicates', () => {
        expect(new Set(COMMON_UNITS).size).toBe(COMMON_UNITS.length)
    })
})

describe('isCanonicalUnit', () => {
    it('accepts canonical labels, case-insensitively', () => {
        expect(isCanonicalUnit('cup')).toBe(true)
        expect(isCanonicalUnit('CUP')).toBe(true)
        expect(isCanonicalUnit('  tablespoon  ')).toBe(true)
    })
    it('rejects aliases - the sheet shows labels, not aliases', () => {
        // 'tbsp' is a real alias but is not a chip, so the sheet must treat it
        // as the author's own text rather than silently claiming it is selected.
        expect(isCanonicalUnit('tbsp')).toBe(false)
    })
    it('rejects free text and empties', () => {
        for (const v of ['pouch', 'large spoons', '', '   ', null, undefined]) {
            expect(isCanonicalUnit(v)).toBe(false)
        }
    })
})

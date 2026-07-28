import { describe, it, expect } from 'vitest'
import { recipeMatchesDietaryFilter, ALLERGENS, DIETARY, allergenLabel, dietaryLabel } from './dietaryTags'

// Pins the Stage N grid-filter predicate. Safety-critical: a false negative
// (an allergen-containing recipe passing an exclusion) is the exact harm this
// feature exists to prevent, so the exclusion cases are exhaustive.
describe('recipeMatchesDietaryFilter', () => {
    const recipe = (allergens = [], dietary = []) => ({ allergens, dietary })

    it('passes everything when no filter is active', () => {
        expect(recipeMatchesDietaryFilter(recipe(['peanuts']), [], [])).toBe(true)
        expect(recipeMatchesDietaryFilter(recipe([], []), [], [])).toBe(true)
    })

    describe('allergen exclusion (exclude-any)', () => {
        it('hides a recipe that declares an excluded allergen', () => {
            expect(recipeMatchesDietaryFilter(recipe(['peanuts', 'dairy']), ['peanuts'], [])).toBe(false)
        })

        it('keeps a recipe that declares none of the excluded allergens', () => {
            expect(recipeMatchesDietaryFilter(recipe(['dairy']), ['peanuts'], [])).toBe(true)
        })

        it('hides on ANY overlap when multiple allergens are excluded', () => {
            expect(recipeMatchesDietaryFilter(recipe(['soy']), ['peanuts', 'soy'], [])).toBe(false)
            expect(recipeMatchesDietaryFilter(recipe(['wheat']), ['peanuts', 'soy'], [])).toBe(true)
        })

        it('does NOT exclude a recipe with no declared allergens (author-declared contract)', () => {
            expect(recipeMatchesDietaryFilter(recipe([]), ['peanuts'], [])).toBe(true)
        })
    })

    describe('dietary requirement (require-all)', () => {
        it('keeps a recipe that satisfies the required attribute', () => {
            expect(recipeMatchesDietaryFilter(recipe([], ['vegan', 'vegetarian']), [], ['vegan'])).toBe(true)
        })

        it('hides a recipe missing a required attribute', () => {
            expect(recipeMatchesDietaryFilter(recipe([], ['vegetarian']), [], ['vegan'])).toBe(false)
        })

        it('requires ALL when several dietary attrs are required', () => {
            expect(recipeMatchesDietaryFilter(recipe([], ['vegetarian']), [], ['vegan', 'vegetarian'])).toBe(false)
            expect(recipeMatchesDietaryFilter(recipe([], ['vegan', 'vegetarian']), [], ['vegan', 'vegetarian'])).toBe(true)
        })
    })

    describe('composed (both filters active)', () => {
        it('passes only when both the allergen and dietary conditions hold', () => {
            // vegan, no peanuts → passes both
            expect(recipeMatchesDietaryFilter(recipe(['soy'], ['vegan']), ['peanuts'], ['vegan'])).toBe(true)
            // vegan but contains peanuts → fails allergen side
            expect(recipeMatchesDietaryFilter(recipe(['peanuts'], ['vegan']), ['peanuts'], ['vegan'])).toBe(false)
            // no peanuts but not vegan → fails dietary side
            expect(recipeMatchesDietaryFilter(recipe(['soy'], []), ['peanuts'], ['vegan'])).toBe(false)
        })
    })

    describe('defensive input handling', () => {
        it('treats missing/undefined arrays as empty (stale-view safety window)', () => {
            // recipe from a view that never selected the columns
            expect(recipeMatchesDietaryFilter({}, [], [])).toBe(true)
            // with an active exclusion, undefined allergens must NOT crash;
            // it reads as "no declared allergens" → not excluded (documented risk)
            expect(recipeMatchesDietaryFilter({}, ['peanuts'], [])).toBe(true)
            expect(recipeMatchesDietaryFilter(null, [], ['vegan'])).toBe(false)
        })
    })
})

// Guards the canonical vocab the DB slugs are keyed on — a rename here without
// a data migration would silently desync authoring, filtering, and stored rows.
describe('canonical vocab', () => {
    it('has the 12 allergens and 2 dietary attributes with unique slugs', () => {
        expect(ALLERGENS).toHaveLength(12)
        expect(DIETARY).toHaveLength(2)
        const allSlugs = [...ALLERGENS, ...DIETARY].map(x => x.value)
        expect(new Set(allSlugs).size).toBe(allSlugs.length)
    })

    it('resolves labels, falling back to the raw slug for unknowns', () => {
        expect(allergenLabel('tree_nuts')).toBe('Tree nuts')
        expect(dietaryLabel('vegan')).toBe('Vegan')
        expect(allergenLabel('mystery')).toBe('mystery')
    })
})

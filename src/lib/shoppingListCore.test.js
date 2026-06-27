import { describe, it, expect } from 'vitest'
import {
    normalize,
    keyOf,
    makeId,
    addRecipe,
    removeItem,
    removeRecipe,
    normalizeStored,
    recipesInList,
    restoreItem,
    summarizeContribution,
} from './shoppingListCore'

// These tests pin the provenance / merge / removal arithmetic that the
// shopping list depends on. The module is intentionally React-free, so the
// whole surface is exercised here with plain data — no renderer, no DOM.

describe('normalize', () => {
    it('trims and lowercases strings', () => {
        expect(normalize('  Flour  ')).toBe('flour')
    })

    it('returns empty string for non-strings', () => {
        expect(normalize(42)).toBe('')
        expect(normalize(null)).toBe('')
        expect(normalize(undefined)).toBe('')
    })
})

describe('keyOf', () => {
    it('keys on name + unit, case-insensitively', () => {
        expect(keyOf({ name: 'Flour', unit: 'Cups' })).toBe('flour|cups')
        expect(keyOf({ name: 'flour', unit: 'cups' })).toBe('flour|cups')
    })

    it('treats a different unit as a different key', () => {
        expect(keyOf({ name: 'flour', unit: 'cups' })).not.toBe(keyOf({ name: 'flour', unit: 'g' }))
    })
})

describe('makeId', () => {
    it('returns a non-empty unique string', () => {
        const a = makeId()
        const b = makeId()
        expect(typeof a).toBe('string')
        expect(a.length).toBeGreaterThan(0)
        expect(a).not.toBe(b)
    })
})

describe('addRecipe', () => {
    it('adds an ingredient as a row carrying its source provenance', () => {
        const list = addRecipe([], 'r1', 'Pancakes', [{ name: 'Flour', unit: 'cups', quantity: 2 }], 1000)
        expect(list).toHaveLength(1)
        expect(list[0]).toMatchObject({ name: 'Flour', unit: 'cups', quantity: 2 })
        expect(list[0].sources).toHaveLength(1)
        expect(list[0].sources[0]).toMatchObject({ recipeId: 'r1', recipeTitle: 'Pancakes', quantity: 2, addedAt: 1000 })
    })

    it('merges same name+unit across recipes and sums the quantity', () => {
        let list = addRecipe([], 'r1', 'Pancakes', [{ name: 'Flour', unit: 'cups', quantity: 2 }], 1000)
        list = addRecipe(list, 'r2', 'Bread', [{ name: 'flour', unit: 'Cups', quantity: 1 }], 2000)
        expect(list).toHaveLength(1)
        expect(list[0].quantity).toBe(3)
        expect(list[0].sources).toHaveLength(2)
    })

    it('keeps the same ingredient with a different unit as a separate row', () => {
        let list = addRecipe([], 'r1', 'Pancakes', [{ name: 'flour', unit: 'cups', quantity: 2 }], 1000)
        list = addRecipe(list, 'r2', 'Bread', [{ name: 'flour', unit: 'g', quantity: 200 }], 2000)
        expect(list).toHaveLength(2)
    })

    it('replaces (does not stack) when the same recipeId is sent again', () => {
        let list = addRecipe([], 'r1', 'Pancakes', [{ name: 'Flour', unit: 'cups', quantity: 2 }], 1000)
        list = addRecipe(list, 'r1', 'Pancakes', [{ name: 'Flour', unit: 'cups', quantity: 5 }], 1500)
        expect(list).toHaveLength(1)
        expect(list[0].quantity).toBe(5)
        expect(list[0].sources).toHaveLength(1)
    })

    it('rounds a summed quantity to two decimals', () => {
        let list = addRecipe([], 'r1', 'A', [{ name: 'Oil', unit: 'cup', quantity: 0.1 }], 1000)
        list = addRecipe(list, 'r2', 'B', [{ name: 'Oil', unit: 'cup', quantity: 0.2 }], 2000)
        expect(list[0].quantity).toBe(0.3)
    })

    it('keeps a quantity-less ingredient ("to taste") with a null quantity', () => {
        const list = addRecipe([], 'r1', 'A', [{ name: 'Salt', unit: null, quantity: null }], 1000)
        expect(list).toHaveLength(1)
        expect(list[0].quantity).toBeNull()
    })

    it('drops rows with no usable name', () => {
        const list = addRecipe([], 'r1', 'A', [{ name: '   ', unit: 'cups', quantity: 1 }], 1000)
        expect(list).toHaveLength(0)
    })

    it('returns the list unchanged for empty or invalid input', () => {
        const existing = addRecipe([], 'r1', 'A', [{ name: 'Eggs', unit: null, quantity: 2 }], 1000)
        expect(addRecipe(existing, 'r9', 'Z', [])).toBe(existing)
        expect(addRecipe(existing, 'r9', 'Z', null)).toBe(existing)
    })
})

describe('removeItem', () => {
    it('removes a row by id and returns the removed row', () => {
        const list = addRecipe([], 'r1', 'A', [{ name: 'Eggs', unit: null, quantity: 2 }], 1000)
        const { list: after, removed } = removeItem(list, list[0].id)
        expect(after).toHaveLength(0)
        expect(removed.name).toBe('Eggs')
    })

    it('is a no-op with a null removed for an unknown id', () => {
        const list = addRecipe([], 'r1', 'A', [{ name: 'Eggs', unit: null, quantity: 2 }], 1000)
        const { list: after, removed } = removeItem(list, 'nope')
        expect(after).toHaveLength(1)
        expect(removed).toBeNull()
    })
})

describe('removeRecipe', () => {
    it('drops rows that recipe solely sourced', () => {
        const list = addRecipe([], 'r1', 'Pancakes', [{ name: 'Flour', unit: 'cups', quantity: 2 }], 1000)
        const { list: after, removed } = removeRecipe(list, 'r1')
        expect(after).toHaveLength(0)
        expect(removed.recipeId).toBe('r1')
        expect(removed.contribution).toHaveLength(1)
    })

    it('reduces a shared row instead of deleting it', () => {
        let list = addRecipe([], 'r1', 'Pancakes', [{ name: 'Flour', unit: 'cups', quantity: 2 }], 1000)
        list = addRecipe(list, 'r2', 'Bread', [{ name: 'Flour', unit: 'cups', quantity: 1 }], 2000)
        const { list: after } = removeRecipe(list, 'r1')
        expect(after).toHaveLength(1)
        expect(after[0].quantity).toBe(1)
        expect(after[0].sources).toHaveLength(1)
        expect(after[0].sources[0].recipeId).toBe('r2')
    })

    it('produces a removed payload that addRecipe can replay to undo', () => {
        let list = addRecipe([], 'r1', 'Pancakes', [{ name: 'Flour', unit: 'cups', quantity: 2 }], 1000)
        list = addRecipe(list, 'r2', 'Bread', [{ name: 'Flour', unit: 'cups', quantity: 1 }], 2000)
        const { list: after, removed } = removeRecipe(list, 'r1')
        const undone = addRecipe(after, removed.recipeId, removed.recipeTitle, removed.contribution, removed.addedAt)
        expect(undone).toHaveLength(1)
        expect(undone[0].quantity).toBe(3)
        expect(undone[0].sources).toHaveLength(2)
    })

    it('is a no-op for an absent recipe or a null id', () => {
        const list = addRecipe([], 'r1', 'A', [{ name: 'Eggs', unit: null, quantity: 2 }], 1000)
        expect(removeRecipe(list, 'ghost')).toEqual({ list, removed: null })
        expect(removeRecipe(list, null)).toEqual({ list, removed: null })
    })
})

describe('recipesInList', () => {
    it('lists distinct contributing recipes with row counts, ordered by first-added', () => {
        let list = addRecipe([], 'r1', 'Pancakes', [{ name: 'Flour', unit: 'cups', quantity: 2 }], 1000)
        list = addRecipe(list, 'r2', 'Bread', [
            { name: 'Flour', unit: 'cups', quantity: 1 },
            { name: 'Sugar', unit: 'g', quantity: 50 },
        ], 2000)
        const recipes = recipesInList(list)
        expect(recipes).toHaveLength(2)
        expect(recipes[0]).toMatchObject({ recipeId: 'r1', count: 1, addedAt: 1000 })
        expect(recipes[1]).toMatchObject({ recipeId: 'r2', count: 2, addedAt: 2000 })
    })

    it('skips unattributed (null-recipeId) sources', () => {
        const stored = normalizeStored([{ name: 'Eggs', unit: null, quantity: 2 }])
        expect(recipesInList(stored)).toHaveLength(0)
    })
})

describe('normalizeStored', () => {
    it('returns an empty array for non-array input', () => {
        expect(normalizeStored(null)).toEqual([])
        expect(normalizeStored('nope')).toEqual([])
    })

    it('migrates a legacy row into a single unattributed source', () => {
        const out = normalizeStored([{ name: 'Eggs', unit: null, quantity: 2 }])
        expect(out).toHaveLength(1)
        expect(out[0].sources).toHaveLength(1)
        expect(out[0].sources[0].recipeId).toBeNull()
        expect(out[0].quantity).toBe(2)
    })

    it('filters out junk rows with no usable name', () => {
        const out = normalizeStored([{ name: '' }, null, { nope: true }, { name: 'Milk', quantity: 1 }])
        expect(out).toHaveLength(1)
        expect(out[0].name).toBe('Milk')
    })
})

describe('restoreItem', () => {
    const removedRow = {
        id: 'x1',
        name: 'Butter',
        unit: 'tbsp',
        quantity: 2,
        notes: null,
        sources: [{ recipeId: 'r1', recipeTitle: 'Pancakes', quantity: 2, notes: null, addedAt: 1000 }],
    }

    it('re-adds a removed row when no matching row exists', () => {
        const out = restoreItem([], removedRow)
        expect(out).toHaveLength(1)
        expect(out[0].quantity).toBe(2)
    })

    it('folds a restored row back into a matching (name+unit) row', () => {
        const list = addRecipe([], 'r2', 'Cookies', [{ name: 'butter', unit: 'Tbsp', quantity: 1 }], 2000)
        const out = restoreItem(list, removedRow)
        expect(out).toHaveLength(1)
        expect(out[0].quantity).toBe(3)
        expect(out[0].sources).toHaveLength(2)
    })

    it('ignores an item with no usable name', () => {
        const list = addRecipe([], 'r1', 'A', [{ name: 'Eggs', unit: null, quantity: 2 }], 1000)
        expect(restoreItem(list, { name: '   ' })).toBe(list)
    })
})

describe('summarizeContribution', () => {
    it('classifies each contributed ingredient as removed or reduced', () => {
        const contribution = [
            { name: 'Flour', unit: 'cups' },
            { name: 'Eggs', unit: null },
        ]
        const listAfter = [{ name: 'Flour', unit: 'cups' }]
        expect(summarizeContribution(contribution, listAfter)).toEqual({ removed: ['Eggs'], reduced: ['Flour'] })
    })
})

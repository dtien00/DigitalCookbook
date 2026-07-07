import { describe, it, expect } from 'vitest'
import {
    groupIngredients,
    hasSections,
    rowsToIngredients,
    ingredientsToRows,
    adoptSectionAt,
} from './ingredientSections'

// Pins the Stage 21 grouping + editor row-mapping logic. All plain data —
// ingredients are modelled as { name, section } (the real rows carry more
// fields, which every helper passes through untouched).

const ing = (name, section = null) => ({ name, section })

describe('groupIngredients', () => {
    it('returns no groups for an empty list', () => {
        expect(groupIngredients([])).toEqual([])
    })

    it('puts an unsectioned recipe in one null-section run', () => {
        const groups = groupIngredients([ing('flour'), ing('salt')])
        expect(groups).toHaveLength(1)
        expect(groups[0].section).toBeNull()
        expect(groups[0].items.map(i => i.name)).toEqual(['flour', 'salt'])
        expect(groups[0].startIndex).toBe(0)
    })

    it('splits contiguous runs and records flat start indexes', () => {
        const groups = groupIngredients([
            ing('flour', 'dough'), ing('yeast', 'dough'),
            ing('tomato', 'sauce'),
        ])
        expect(groups.map(g => [g.section, g.startIndex])).toEqual([
            ['dough', 0],
            ['sauce', 2],
        ])
    })

    it('keeps a leading unsectioned run as its own group', () => {
        const groups = groupIngredients([ing('oil'), ing('flour', 'dough')])
        expect(groups.map(g => g.section)).toEqual([null, 'dough'])
    })

    it('treats non-contiguous repeats of a name as separate runs', () => {
        const groups = groupIngredients([
            ing('a', 'sauce'), ing('b', 'dough'), ing('c', 'sauce'),
        ])
        expect(groups.map(g => g.section)).toEqual(['sauce', 'dough', 'sauce'])
    })

    it('treats undefined section as null (pre-migration rows)', () => {
        const groups = groupIngredients([{ name: 'flour' }, ing('salt', null)])
        expect(groups).toHaveLength(1)
    })
})

describe('hasSections', () => {
    it('is false for unsectioned and empty lists', () => {
        expect(hasSections([])).toBe(false)
        expect(hasSections([ing('flour'), { name: 'salt' }])).toBe(false)
    })

    it('is true once any ingredient carries a label', () => {
        expect(hasSections([ing('flour'), ing('tomato', 'sauce')])).toBe(true)
    })
})

describe('rowsToIngredients', () => {
    const section = (name) => ({ type: 'section', name })
    const row = (name) => ({ type: 'ingredient', name, quantity: '1', unit: 'cup', notes: '' })

    it('stamps each ingredient with the nearest section row above', () => {
        const out = rowsToIngredients([
            row('oil'),
            section('For the dough'), row('flour'), row('yeast'),
            section('For the sauce'), row('tomato'),
        ])
        expect(out.map(i => [i.name, i.section])).toEqual([
            ['oil', null],
            ['flour', 'For the dough'],
            ['yeast', 'For the dough'],
            ['tomato', 'For the sauce'],
        ])
    })

    it('drops blank section rows without resetting the current section', () => {
        const out = rowsToIngredients([
            section('Dough'), row('flour'),
            section('   '), row('yeast'),
        ])
        expect(out.map(i => i.section)).toEqual(['Dough', 'Dough'])
    })

    it('trims section labels and strips the row type field', () => {
        const out = rowsToIngredients([section('  Sauce  '), row('tomato')])
        expect(out[0].section).toBe('Sauce')
        expect(out[0].type).toBeUndefined()
        expect(out[0]).toMatchObject({ name: 'tomato', quantity: '1', unit: 'cup' })
    })
})

describe('ingredientsToRows', () => {
    it('reconstructs section rows at run starts and strips section from ingredient rows', () => {
        const rows = ingredientsToRows([
            ing('oil'),
            ing('flour', 'dough'), ing('yeast', 'dough'),
            ing('tomato', 'sauce'),
        ])
        expect(rows.map(r => r.type === 'section' ? `§${r.name}` : r.name)).toEqual([
            'oil', '§dough', 'flour', 'yeast', '§sauce', 'tomato',
        ])
        expect(rows.filter(r => r.type === 'ingredient').every(r => !('section' in r))).toBe(true)
    })

    it('round-trips through rowsToIngredients', () => {
        const stored = [
            ing('oil'),
            ing('flour', 'dough'), ing('yeast', 'dough'),
            ing('tomato', 'sauce'),
        ]
        expect(rowsToIngredients(ingredientsToRows(stored))).toEqual(stored)
    })
})

describe('adoptSectionAt', () => {
    const list = [
        ing('oil'),
        ing('flour', 'dough'), ing('yeast', 'dough'),
        ing('tomato', 'sauce'),
    ]

    it('adopts the section of the row above after a downward drop', () => {
        // 'oil' dragged between flour and yeast (flat index 1 after arrayMove).
        const moved = [list[1], list[0], list[2], list[3]]
        const out = adoptSectionAt(moved, 1)
        expect(out[1]).toMatchObject({ name: 'oil', section: 'dough' })
    })

    it('adopts the section of the row below when dropped at the top', () => {
        // 'tomato' dragged to index 0; old first row was unsectioned oil.
        const moved = [list[3], list[0], list[1], list[2]]
        const out = adoptSectionAt(moved, 0)
        expect(out[0]).toMatchObject({ name: 'tomato', section: null })
    })

    it('does not mutate the input array', () => {
        const moved = [list[1], list[0], list[2], list[3]]
        adoptSectionAt(moved, 1)
        expect(moved[1].section).toBeNull()
    })

    it('handles a single-item list', () => {
        const out = adoptSectionAt([ing('flour', 'dough')], 0)
        expect(out[0].section).toBe('dough')
    })
})

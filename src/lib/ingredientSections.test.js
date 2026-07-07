import { describe, it, expect } from 'vitest'
import {
    groupIngredients,
    hasSections,
    rowsToIngredients,
    ingredientsToRows,
    clampMoveToSection,
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

describe('clampMoveToSection', () => {
    // flat indexes:      0            1                    2                    3                  4
    const list = [
        ing('oil'),
        ing('flour', 'dough'), ing('yeast', 'dough'), ing('water', 'dough'),
        ing('tomato', 'sauce'),
    ]

    it('allows moves within the same section', () => {
        expect(clampMoveToSection(list, 1, 3)).toBe(3)
        expect(clampMoveToSection(list, 3, 1)).toBe(1)
    })

    it('clamps a downward drag at the section\'s last row', () => {
        // 'flour' dragged toward the sauce section → pinned at dough's end.
        expect(clampMoveToSection(list, 1, 4)).toBe(3)
    })

    it('clamps an upward drag at the section\'s first row', () => {
        // 'water' dragged toward the unsectioned lead → pinned at dough's start.
        expect(clampMoveToSection(list, 3, 0)).toBe(1)
    })

    it('pins a one-ingredient section in place (cannot be dissolved)', () => {
        expect(clampMoveToSection(list, 4, 0)).toBe(4)
        expect(clampMoveToSection(list, 0, 4)).toBe(0)
    })

    it('keeps the unsectioned lead run inside itself', () => {
        const twoLead = [ing('oil'), ing('salt'), ing('flour', 'dough')]
        expect(clampMoveToSection(twoLead, 0, 2)).toBe(1)
        expect(clampMoveToSection(twoLead, 1, 0)).toBe(0)
    })

    it('treats undefined section as null when matching the run', () => {
        const mixed = [{ name: 'oil' }, ing('salt', null), ing('flour', 'dough')]
        expect(clampMoveToSection(mixed, 0, 1)).toBe(1)
    })
})

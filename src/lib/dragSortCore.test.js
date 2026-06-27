import { describe, it, expect } from 'vitest'
import { arrayMove, targetIndexForY } from './dragSortCore'

// Pins the reorder arithmetic behind useDragSort. React-free by design, so the
// whole surface runs on plain data — rows are modelled as { top, height }
// rectangles, exactly what the hook feeds in from getBoundingClientRect.

describe('arrayMove', () => {
    it('moves an item down', () => {
        expect(arrayMove(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    })

    it('moves an item up', () => {
        expect(arrayMove(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    })

    it('is a no-op when from === to', () => {
        expect(arrayMove(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
    })

    it('does not mutate the input array', () => {
        const input = ['a', 'b', 'c']
        arrayMove(input, 0, 2)
        expect(input).toEqual(['a', 'b', 'c'])
    })
})

// Equal-height rows stacked from y=0: row i spans [i*H, (i+1)*H), midpoint at
// i*H + H/2.
const H = 100
const rects = (n) => Array.from({ length: n }, (_, i) => ({ top: i * H, height: H }))

describe('targetIndexForY', () => {
    it('returns null for an empty list', () => {
        expect(targetIndexForY([], 50, 0)).toBeNull()
    })

    it('keeps the dragged row put while the pointer stays in its own slot', () => {
        // Dragging row 1; pointer anywhere inside slot 1 (100..200) → stays at 1.
        expect(targetIndexForY(rects(4), 110, 1)).toBe(1)
        expect(targetIndexForY(rects(4), 190, 1)).toBe(1)
    })

    it('targets the slot whose midpoint the pointer has passed (dragging down)', () => {
        // Dragging row 0 downward; pointer past row 1's midpoint (150) → slot 1.
        expect(targetIndexForY(rects(4), 160, 0)).toBe(1)
        // Past row 2's midpoint (250) as well → slot 2.
        expect(targetIndexForY(rects(4), 260, 0)).toBe(2)
    })

    it('targets correctly when dragging up', () => {
        // Dragging row 3 upward; pointer above row 0's midpoint (50) → slot 0.
        expect(targetIndexForY(rects(4), 40, 3)).toBe(0)
    })

    it('never overshoots past the last slot', () => {
        expect(targetIndexForY(rects(4), 99999, 0)).toBe(3)
    })
})

// End-to-end: replay a drag the way the hook does — recompute the target from
// the *current* order each move (rows reflow live), apply arrayMove, and keep
// the dragged item tracked at its new index. Asserts the committed final order.
function simulateDrag(items, from, pointerYs) {
    let order = [...items]
    let cur = from
    for (const y of pointerYs) {
        const target = targetIndexForY(rects(order.length), y, cur)
        if (target !== cur) {
            order = arrayMove(order, cur, target)
            cur = target
        }
    }
    return order
}

describe('simulateDrag (live reflow)', () => {
    it('drags the first item down to the third slot without overshooting', () => {
        // Finger crosses row 1's then row 2's midpoint, settling inside slot 2
        // (200..300) — the dragged item lands at index 2, not past it.
        const out = simulateDrag(['a', 'b', 'c', 'd'], 0, [160, 260])
        expect(out).toEqual(['b', 'c', 'a', 'd'])
    })

    it('drags the last item up to the top', () => {
        const out = simulateDrag(['a', 'b', 'c', 'd'], 3, [340, 240, 140, 40])
        expect(out).toEqual(['d', 'a', 'b', 'c'])
    })

    it('returns to the original order when the finger comes back', () => {
        // Down to slot 2, then back above row 0's midpoint (50) → home again.
        const out = simulateDrag(['a', 'b', 'c', 'd'], 0, [160, 260, 40])
        expect(out).toEqual(['a', 'b', 'c', 'd'])
    })
})

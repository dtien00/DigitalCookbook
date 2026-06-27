// Pure, React-free helpers behind useDragSort — kept here (mirroring
// shoppingListCore) so the reorder arithmetic is unit-testable with plain data,
// no DOM and no renderer, under vitest's default 'node' environment.

// Immutably move an array item from one index to another.
export function arrayMove(arr, from, to) {
    const next = [...arr]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
}

// Resolve where the dragged row should land given the on-screen rows and the
// pointer's Y. `rects` is every row in current visual order ({ top, height } in
// viewport coords); `fromIndex` is the dragged row's current index.
//
// We count how many *other* rows have their vertical midpoint above the pointer.
// That count is the dragged item's destination index — and, because arrayMove
// removes the source first, it's exactly the `to` argument arrayMove expects.
// Excluding the dragged row's own midpoint is what stops it overshooting by a
// slot as the list reshuffles live underneath the finger.
export function targetIndexForY(rects, clientY, fromIndex) {
    if (!rects.length) return null
    let insert = 0
    for (let i = 0; i < rects.length; i++) {
        if (i === fromIndex) continue
        const { top, height } = rects[i]
        if (clientY > top + height / 2) insert++
    }
    return insert
}

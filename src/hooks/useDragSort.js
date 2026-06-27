import { useCallback, useEffect, useRef, useState } from 'react'
import { targetIndexForY } from '../lib/dragSortCore'

// Pointer-based drag-to-reorder (mouse + touch + pen, no dependencies).
//
// The native HTML5 drag-and-drop API does not fire on touch devices, so a
// kitchen app used on phones can't rely on it. Pointer Events unify all three
// input types and work on mobile, so this hook drives reordering off them.
//
// Items reorder *live* as the pointer crosses a neighbouring row's vertical
// midpoint; the caller owns the array (via onMove) and decides when to persist.
// In RecipeDetail the moves stay local until the author taps "Save order".
//
// A drag on touch starts on a handle styled `touch-action: none` so the browser
// doesn't try to scroll the page out from under the gesture.
//
// Usage:
//   const { listRef, dragIndex, handleProps } = useDragSort({ enabled, onMove })
//   <ul ref={listRef}>
//     {items.map((it, i) => (
//       <li key={it.id} data-sort-row className={dragIndex === i ? 'opacity-60' : ''}>
//         <button {...handleProps(i)} aria-label="Drag to reorder">⠿</button>
//         …
//       </li>
//     ))}
//   </ul>
export function useDragSort({ enabled = true, onMove }) {
    const [dragIndex, setDragIndex] = useState(null)
    const listRef = useRef(null)
    // index: the row currently being dragged (null when idle).
    // moved:  whether this drag actually reordered, so we can swallow the
    //         synthetic click that fires on release (it would otherwise toggle
    //         a checkbox under the drop point).
    const drag = useRef({ index: null, moved: false })

    // onMove is recreated each render by the caller; keep a live ref so the
    // long-lived pointer listeners always call the current closure without
    // being torn down and re-added mid-drag.
    const onMoveRef = useRef(onMove)
    onMoveRef.current = onMove

    // Snapshot the live row geometry (current visual order) for the pure
    // target-resolver.
    const readRects = useCallback(() => {
        const list = listRef.current
        if (!list) return []
        return [...list.querySelectorAll('[data-sort-row]')].map(row => {
            const r = row.getBoundingClientRect()
            return { top: r.top, height: r.height }
        })
    }, [])

    const handleMove = useCallback((e) => {
        if (drag.current.index == null) return
        const from = drag.current.index
        const target = targetIndexForY(readRects(), e.clientY, from)
        if (target == null || target === from) return
        // Reorder live and keep the dragged item tracked at its new slot, so the
        // row follows the pointer and the next move computes from where it now
        // sits.
        onMoveRef.current(from, target)
        drag.current.index = target
        drag.current.moved = true
        setDragIndex(target)
    }, [readRects])

    const endDrag = useCallback(() => {
        if (drag.current.index == null) return
        const reordered = drag.current.moved
        drag.current.index = null
        drag.current.moved = false
        setDragIndex(null)
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', endDrag)
        window.removeEventListener('pointercancel', endDrag)
        // Suppress the click the browser synthesises after a mouse/pen drag so
        // releasing over a checkbox/label doesn't also toggle it. Self-removes
        // after one click; the timeout covers touch (where no click follows).
        if (reordered) {
            const swallow = (ev) => {
                ev.stopPropagation()
                ev.preventDefault()
                window.removeEventListener('click', swallow, true)
            }
            window.addEventListener('click', swallow, true)
            setTimeout(() => window.removeEventListener('click', swallow, true), 350)
        }
    }, [handleMove])

    const startDrag = useCallback((index, e) => {
        if (!enabled) return
        // Primary button / touch / pen only — ignore right- and middle-click.
        if (e.button != null && e.button !== 0) return
        e.preventDefault()
        drag.current = { index, moved: false }
        setDragIndex(index)
        window.addEventListener('pointermove', handleMove)
        window.addEventListener('pointerup', endDrag)
        window.addEventListener('pointercancel', endDrag)
    }, [enabled, handleMove, endDrag])

    // Drop any in-flight listeners if the component unmounts mid-drag.
    useEffect(() => endDrag, [endDrag])

    const handleProps = useCallback((index) => ({
        onPointerDown: (e) => startDrag(index, e),
        style: { touchAction: 'none' },
    }), [startDrag])

    return { listRef, dragIndex, handleProps }
}

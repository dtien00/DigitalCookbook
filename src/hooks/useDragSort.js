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
// onMove may return the index the row actually landed at — a caller that
// constrains moves (e.g. RecipeDetail clamps ingredient drags inside their
// section) reports the clamped index so the hook keeps tracking the right row;
// returning undefined means the move landed at the requested target.
//
// A drag on touch starts on a handle styled `touch-action: none` so the browser
// doesn't try to scroll the page out from under the gesture. Because we've taken
// scrolling away from the browser, we drive it ourselves: when the pointer is
// held inside an EDGE_ZONE band at the top or bottom of the viewport, an
// requestAnimationFrame loop scrolls the window in that direction (speed ramps
// with how deep into the band the pointer is) and re-resolves the drop target
// each frame — so a long list can be reordered on a phone past what's on screen.
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

// Distance from a viewport edge (px) within which auto-scroll kicks in, and the
// peak scroll speed (px/frame, ~60fps) reached right at the edge.
const EDGE_ZONE = 72
const MAX_SCROLL_SPEED = 14

// px/frame for a pointer `dist` px from the edge: 0 at the band's inner border,
// ramping to MAX_SCROLL_SPEED at the very edge. "slowly scroll in accordance".
function edgeScrollSpeed(dist) {
    const t = Math.max(0, Math.min(1, 1 - dist / EDGE_ZONE))
    return MAX_SCROLL_SPEED * t
}

export function useDragSort({ enabled = true, onMove }) {
    const [dragIndex, setDragIndex] = useState(null)
    const listRef = useRef(null)
    // index:   the row currently being dragged (null when idle).
    // moved:   whether this drag actually reordered, so we can swallow the
    //          synthetic click that fires on release (it would otherwise toggle
    //          a checkbox under the drop point).
    // clientY: the pointer's last viewport Y — the auto-scroll loop re-resolves
    //          the target from it each frame while the finger is held still.
    // raf:     the running auto-scroll frame handle (null when not scheduled).
    const drag = useRef({ index: null, moved: false, clientY: 0, raf: null })

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

    // Resolve and apply the drop target for a given viewport Y. Reorders live and
    // keeps the dragged item tracked at its new slot, so the row follows the
    // pointer and the next evaluation computes from where it now sits. Called
    // both on pointer move and on every auto-scroll frame.
    const applyReorder = useCallback((clientY) => {
        if (drag.current.index == null) return
        const from = drag.current.index
        const target = targetIndexForY(readRects(), clientY, from)
        if (target == null || target === from) return
        const applied = onMoveRef.current(from, target)
        // Track where the row actually landed — a constraining caller may have
        // clamped the move (landing back at `from` means it was pinned).
        const landed = typeof applied === 'number' ? applied : target
        if (landed === from) return
        drag.current.index = landed
        drag.current.moved = true
        setDragIndex(landed)
    }, [readRects])

    // Auto-scroll loop: while the held pointer sits in the top/bottom edge band,
    // nudge the window and re-resolve the target so rows scrolling under the
    // finger still drop where expected. Self-reschedules until the drag ends.
    const autoScrollTick = useCallback(() => {
        if (drag.current.index == null) { drag.current.raf = null; return }
        const y = drag.current.clientY
        const vh = window.innerHeight
        let delta = 0
        if (y < EDGE_ZONE) delta = -edgeScrollSpeed(y)
        else if (vh - y < EDGE_ZONE) delta = edgeScrollSpeed(vh - y)
        if (delta) {
            window.scrollBy(0, delta)
            applyReorder(y)
        }
        drag.current.raf = requestAnimationFrame(autoScrollTick)
    }, [applyReorder])

    const handleMove = useCallback((e) => {
        if (drag.current.index == null) return
        drag.current.clientY = e.clientY
        applyReorder(e.clientY)
    }, [applyReorder])

    const endDrag = useCallback(() => {
        if (drag.current.index == null) return
        const reordered = drag.current.moved
        if (drag.current.raf != null) cancelAnimationFrame(drag.current.raf)
        drag.current.index = null
        drag.current.moved = false
        drag.current.raf = null
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
        drag.current = { index, moved: false, clientY: e.clientY, raf: null }
        setDragIndex(index)
        window.addEventListener('pointermove', handleMove)
        window.addEventListener('pointerup', endDrag)
        window.addEventListener('pointercancel', endDrag)
        drag.current.raf = requestAnimationFrame(autoScrollTick)
    }, [enabled, handleMove, endDrag, autoScrollTick])

    // Drop any in-flight listeners if the component unmounts mid-drag.
    useEffect(() => endDrag, [endDrag])

    const handleProps = useCallback((index) => ({
        onPointerDown: (e) => startDrag(index, e),
        style: { touchAction: 'none' },
    }), [startDrag])

    return { listRef, dragIndex, handleProps }
}

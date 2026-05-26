import { useState, useRef, useEffect, useMemo } from 'react'

// Stage 14 item 2.1 — paginated recipe carousel for the right page of
// ProfileBookSpread. When recipes would overflow the left page's
// intrinsic height, they split into "book pages" the user navigates
// through:
//   - Wheel scroll inside the carousel: down → next page, up → previous
//   - Horizontal touch swipe on mobile (vertical kept for page scroll)
//   - Keyboard: ←/→ navigate, Home/End jump to first/last
//   - Numbered page indicator at the bottom with « first / last » buttons
//
// `maxHeight` props the viewport height; the parent component measures
// the left page's intrinsic content height with ResizeObserver and
// passes it. The viewport is fixed-height — anything beyond a page's
// allocated space is clipped (overflow: hidden), so cardsPerPage adapts
// to the height estimate to avoid that happening often.
//
// `cardsPerPage` derives from maxHeight: roughly 2 columns × estimated
// row count at ~240px per row. Falls back to 6 when maxHeight is
// unknown (before the first ResizeObserver fire).
//
// If recipes fit in one page, no carousel chrome renders — just the
// regular columns-2 masonry grid. The carousel only activates when
// pagination is actually needed.
export default function RecipesCarousel({ recipes, maxHeight, renderRecipe }) {
    const viewportRef = useRef(null)
    const [currentPage, setCurrentPage] = useState(0)

    const cardsPerPage = useMemo(() => {
        if (!maxHeight) return 6
        // Subtract bottom space for the indicator pill + estimate ~240px
        // per row of 2 cards. Minimum 2 cards/page so pagination always
        // makes progress.
        const rows = Math.max(1, Math.floor((maxHeight - 80) / 240))
        return Math.max(2, rows * 2)
    }, [maxHeight])

    const pages = useMemo(() => {
        const out = []
        for (let i = 0; i < recipes.length; i += cardsPerPage) {
            out.push(recipes.slice(i, i + cardsPerPage))
        }
        return out
    }, [recipes, cardsPerPage])

    const pageCount = pages.length

    // Clamp currentPage if pages shrink (e.g., user deletes a recipe and
    // the last page disappears). Also resets when the recipes array
    // changes wholesale.
    useEffect(() => {
        if (currentPage >= pageCount && pageCount > 0) {
            setCurrentPage(pageCount - 1)
        }
    }, [pageCount, currentPage])

    // Wheel: vertical scroll inside the carousel translates to horizontal
    // page nav. Cooldown prevents a single trackpad gesture firing many
    // page changes. At boundaries the event is NOT prevented, so document
    // scroll resumes naturally — letting the user scroll past the spread
    // to the Following section / page footer.
    useEffect(() => {
        const el = viewportRef.current
        if (!el || pageCount <= 1) return
        let cooldown = false
        const onWheel = (e) => {
            if (cooldown) return
            const dy = e.deltaY
            if (Math.abs(dy) < 20) return
            if (dy > 0 && currentPage < pageCount - 1) {
                e.preventDefault()
                setCurrentPage(p => Math.min(p + 1, pageCount - 1))
                cooldown = true
                setTimeout(() => { cooldown = false }, 450)
            } else if (dy < 0 && currentPage > 0) {
                e.preventDefault()
                setCurrentPage(p => Math.max(p - 1, 0))
                cooldown = true
                setTimeout(() => { cooldown = false }, 450)
            }
            // At boundary: don't preventDefault → document scroll continues
        }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    }, [pageCount, currentPage])

    // Touch: horizontal swipe → page nav. Vertical drag is left alone so
    // document scroll behaves normally on phones. Multi-touch (pinch /
    // multi-finger) is ignored.
    useEffect(() => {
        const el = viewportRef.current
        if (!el || pageCount <= 1) return
        let startX = null
        let startY = null
        const onTouchStart = (e) => {
            if (e.touches.length !== 1) return
            startX = e.touches[0].clientX
            startY = e.touches[0].clientY
        }
        const onTouchEnd = (e) => {
            if (startX == null) return
            const endTouch = e.changedTouches[0]
            const dx = endTouch.clientX - startX
            const dy = endTouch.clientY - startY
            startX = null
            startY = null
            // Require ≥60px horizontal travel AND horizontal > vertical
            // so vertical scroll gestures don't accidentally flip pages.
            if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy)) return
            if (dx < 0 && currentPage < pageCount - 1) {
                setCurrentPage(p => Math.min(p + 1, pageCount - 1))
            } else if (dx > 0 && currentPage > 0) {
                setCurrentPage(p => Math.max(p - 1, 0))
            }
        }
        el.addEventListener('touchstart', onTouchStart, { passive: true })
        el.addEventListener('touchend', onTouchEnd, { passive: true })
        return () => {
            el.removeEventListener('touchstart', onTouchStart)
            el.removeEventListener('touchend', onTouchEnd)
        }
    }, [pageCount, currentPage])

    function onKeyDown(e) {
        if (pageCount <= 1) return
        if (e.key === 'ArrowRight' && currentPage < pageCount - 1) {
            e.preventDefault()
            setCurrentPage(p => p + 1)
        } else if (e.key === 'ArrowLeft' && currentPage > 0) {
            e.preventDefault()
            setCurrentPage(p => p - 1)
        } else if (e.key === 'Home') {
            e.preventDefault()
            setCurrentPage(0)
        } else if (e.key === 'End') {
            e.preventDefault()
            setCurrentPage(pageCount - 1)
        }
    }

    // Single-page fallback: no carousel chrome, just render the recipes
    // as a regular masonry. The carousel only earns its complexity when
    // there's actually pagination work to do.
    if (pageCount <= 1) {
        return (
            <div className="columns-1 sm:columns-2 gap-4">
                {recipes.map(renderRecipe)}
            </div>
        )
    }

    const heightStyle = maxHeight
        ? { height: `${maxHeight}px` }
        : { minHeight: '420px' }

    return (
        <div className="recipes-carousel" style={heightStyle}>
            <div
                ref={viewportRef}
                className="recipes-carousel-viewport"
                tabIndex={0}
                role="region"
                aria-label={`Recipe pages, page ${currentPage + 1} of ${pageCount}`}
                onKeyDown={onKeyDown}
            >
                <div
                    className="recipes-carousel-track"
                    style={{ transform: `translateX(-${currentPage * 100}%)` }}
                >
                    {pages.map((pageRecipes, pageIdx) => (
                        <div
                            key={pageIdx}
                            className="recipes-carousel-page"
                            aria-hidden={pageIdx !== currentPage}
                        >
                            <div className="columns-1 sm:columns-2 gap-4">
                                {pageRecipes.map(renderRecipe)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <CarouselIndicator
                pageCount={pageCount}
                currentPage={currentPage}
                onSelect={setCurrentPage}
            />
        </div>
    )
}

// Bottom-of-page navigation pill — «First | windowed numbered pages | Last»
// + a "Page N of M" readout for screen readers (also visible as a quiet
// italic to the right of the buttons).
//
// Numbered pages use a sliding window around the current page so the bar
// stays compact when there are many pages: always show first + last, plus
// current ± 1, with `…` ellipses in between.
function CarouselIndicator({ pageCount, currentPage, onSelect }) {
    const visible = windowedPageList(currentPage, pageCount)

    return (
        <div className="recipes-carousel-indicator" role="navigation" aria-label="Recipe pages">
            <button
                type="button"
                onClick={() => onSelect(0)}
                disabled={currentPage === 0}
                aria-label="First page"
                className="indicator-btn indicator-edge"
            >
                «
            </button>
            {visible.map((item, i) => (
                item === '…' ? (
                    <span key={`gap-${i}`} className="indicator-ellipsis" aria-hidden="true">…</span>
                ) : (
                    <button
                        key={item}
                        type="button"
                        onClick={() => onSelect(item)}
                        aria-label={`Go to page ${item + 1}`}
                        aria-current={item === currentPage ? 'page' : undefined}
                        className={'indicator-btn' + (item === currentPage ? ' is-current' : '')}
                    >
                        {item + 1}
                    </button>
                )
            ))}
            <button
                type="button"
                onClick={() => onSelect(pageCount - 1)}
                disabled={currentPage === pageCount - 1}
                aria-label="Last page"
                className="indicator-btn indicator-edge"
            >
                »
            </button>
            <span className="indicator-readout" aria-live="polite">
                Page {currentPage + 1} of {pageCount}
            </span>
        </div>
    )
}

function windowedPageList(current, total) {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i)
    }
    const out = [0]
    const start = Math.max(1, current - 1)
    const end = Math.min(total - 2, current + 1)
    if (start > 1) out.push('…')
    for (let i = start; i <= end; i++) out.push(i)
    if (end < total - 2) out.push('…')
    out.push(total - 1)
    return out
}

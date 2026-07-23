import { useEffect, useRef } from 'react'

// Left slide-in drawer listing recently-viewed recipes (most-recent first),
// so a browser can jump back to a dish without hunting the grid. Pure UI over
// the useRecipeHistory hook — the snapshots it renders already carry title /
// image / tags, so no row needs a fetch.
//
// Motion mirrors the Auth slide-in but reversed (emerges from the left edge,
// the same side as its trigger FAB). The container stays mounted at all times
// so CSS handles the entrance/exit transition; `aria-hidden` +
// `pointer-events-none` keep it inert to screen readers and clicks while
// closed. `motion-reduce:transition-none` honors prefers-reduced-motion.
//
// Accessibility contract (matches FridgeBasket):
//   - role="dialog" + aria-modal + labelled by the heading
//   - Focus moves to the first row (or the close button) on open
//   - Escape closes; backdrop click closes
//   - Body scroll locked while open
//   - Focus returns to the opener (the FAB) on close via openerRef
//   - Interactive controls keep the 44px tap-target floor
export default function RecipeHistory({
    isOpen,
    onClose,
    history,
    onClear,
    onSelect,
    openerRef,
}) {
    const firstRowRef = useRef(null)
    const closeBtnRef = useRef(null)

    // Body scroll lock + focus management. Cleanup restores focus to the
    // opener FAB so keyboard users land back where they were.
    useEffect(() => {
        if (!isOpen) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const focusTimer = setTimeout(() => {
            (firstRowRef.current || closeBtnRef.current)?.focus()
        }, 50)
        return () => {
            document.body.style.overflow = previousOverflow
            clearTimeout(focusTimer)
            // Intentional: refocus the opener element as it exists at close time.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            openerRef?.current?.focus?.()
        }
    }, [isOpen, openerRef])

    // Escape-to-close. Mounted only while open so the global keydown surface
    // stays empty on every other page.
    useEffect(() => {
        if (!isOpen) return
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation()
                onClose()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [isOpen, onClose])

    return (
        <div
            aria-hidden={!isOpen}
            className={`no-print fixed inset-0 z-50 ${isOpen ? '' : 'pointer-events-none'}`}
        >
            {/* Backdrop — fades in/out; click to close. */}
            <div
                onClick={onClose}
                className={`absolute inset-0 bg-ink/40 backdrop-blur-sm transition-opacity duration-300 motion-reduce:transition-none ${isOpen ? 'opacity-100' : 'opacity-0'}`}
            />

            {/* Panel — slides from the left edge. */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="recipe-history-title"
                className={`paper-grain bg-paper absolute inset-y-0 left-0 w-full max-w-sm shadow-2xl flex flex-col transition-transform duration-300 ease-out motion-reduce:transition-none ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-paper-shade">
                    <div className="min-w-0">
                        <h2
                            id="recipe-history-title"
                            className="font-display text-2xl font-semibold text-ink flex items-center gap-2"
                        >
                            <span aria-hidden="true" className="text-rust">✦</span>
                            Recently viewed
                        </h2>
                        <p className="font-serif italic text-sm text-ink/60 mt-0.5">
                            Jump back to a dish.
                        </p>
                    </div>
                    <button
                        ref={closeBtnRef}
                        type="button"
                        onClick={onClose}
                        aria-label="Close recently viewed"
                        className="w-11 h-11 rounded-full bg-paper-shade hover:bg-tan/40 text-ink flex items-center justify-center transition-colors flex-shrink-0"
                    >
                        <svg aria-hidden="true" viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                    </button>
                </div>

                <div className="px-3 py-3 flex-1 overflow-y-auto">
                    {history.length === 0 ? (
                        <div className="text-center py-12 px-2">
                            <div className="text-3xl text-rust/40 mb-2" aria-hidden="true">✦</div>
                            <p className="font-display text-lg text-ink">No recipes viewed yet</p>
                            <p className="font-serif italic text-sm text-ink/60 mt-1">
                                Open a recipe and it'll show up here.
                            </p>
                        </div>
                    ) : (
                        <ul className="flex flex-col gap-1" aria-label="Recently viewed recipes">
                            {history.map((entry, i) => (
                                <li key={entry.id}>
                                    <button
                                        ref={i === 0 ? firstRowRef : undefined}
                                        type="button"
                                        onClick={() => onSelect(entry.id)}
                                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-tan-soft focus:bg-tan-soft focus:outline-none transition-colors"
                                    >
                                        {entry.image_url ? (
                                            <img
                                                src={entry.image_url}
                                                alt=""
                                                className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                                            />
                                        ) : (
                                            <div
                                                className="w-12 h-12 rounded-md bg-tan/40 text-rust flex items-center justify-center flex-shrink-0"
                                                aria-hidden="true"
                                            >
                                                ✦
                                            </div>
                                        )}
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-display text-ink truncate">
                                                {entry.title || 'Untitled recipe'}
                                            </span>
                                            {entry.tags?.length > 0 && (
                                                <span className="block font-serif italic text-xs text-ink/60 truncate mt-0.5">
                                                    {entry.tags.join(' · ')}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-paper-shade">
                    <button
                        type="button"
                        onClick={onClear}
                        disabled={history.length === 0}
                        className="px-4 py-2.5 text-rose-dark hover:text-rose disabled:opacity-40 disabled:cursor-not-allowed font-medium text-sm transition-colors min-h-[44px]"
                    >
                        Clear history
                    </button>
                </div>
            </div>
        </div>
    )
}

import { useEffect, useRef } from 'react'
import { ALLERGENS, DIETARY } from '../lib/dietaryTags'

// Stage N — home-grid allergen/dietary filter modal. Selection lives in the
// useDietaryFilter hook (localStorage); this is pure UI over it. Grid filtering
// and signed-in profile sync land in the next Stage N item; for now Done just
// closes and the choice persists via localStorage either way.
//
// Mirrors the FridgeBasket modal's accessibility contract:
//   - role="dialog" + aria-modal="true" + labelled by the heading
//   - focus moves into the panel on open (deferred a tick past the mount)
//   - Escape closes; backdrop click closes
//   - body scroll locked while open
//   - focus returns to the trigger on close via openerRef
//   - 44px tap-target floor on the footer controls
//
// Colors are rustic-palette utility classes (this is a home surface, unlike
// CreateRecipe): exclude-allergen ON = rose-dark (the warning tone), require-
// dietary ON = rust (the affirmative tone), OFF = paper-shade for both.
export default function DietaryFilterModal({
    isOpen,
    onClose,
    excludedAllergens,
    requiredDietary,
    onToggleAllergen,
    onToggleDietary,
    onClear,
    openerRef,
}) {
    const panelRef = useRef(null)

    // Body scroll lock + focus management. Cleanup restores focus to the opener
    // so keyboard users land back where they were.
    useEffect(() => {
        if (!isOpen) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const focusTimer = setTimeout(() => panelRef.current?.focus(), 50)
        return () => {
            document.body.style.overflow = previousOverflow
            clearTimeout(focusTimer)
            // Intentional: refocus the opener as it exists at close time.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            openerRef?.current?.focus?.()
        }
    }, [isOpen, openerRef])

    // Escape-to-close, mounted only while open.
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

    if (!isOpen) return null

    const activeCount = excludedAllergens.length + requiredDietary.length

    return (
        <div
            className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-ink/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="dietary-filter-title"
                className="paper-grain bg-paper w-full sm:max-w-lg sm:rounded-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[80vh] focus:outline-none"
            >
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-paper-shade">
                    <div className="min-w-0">
                        <h2
                            id="dietary-filter-title"
                            className="font-display text-2xl font-semibold text-ink flex items-center gap-2"
                        >
                            <span aria-hidden="true" className="text-rust">✦</span>
                            Dietary filters
                        </h2>
                        <p className="font-serif italic text-sm text-ink/60 mt-0.5">
                            Browse without the recipes you can't (or won't) eat.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close dietary filters"
                        className="w-11 h-11 rounded-full bg-paper-shade hover:bg-tan/40 text-ink flex items-center justify-center transition-colors flex-shrink-0"
                    >
                        <svg aria-hidden="true" viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                    </button>
                </div>

                <div className="px-5 py-4 flex-1 overflow-y-auto space-y-5">
                    {/* Exclude allergens — recipes flagged with any selected
                        allergen get hidden. Selected = rose-dark (warning). */}
                    <fieldset>
                        <legend className="font-display text-lg text-ink mb-1">Exclude allergens</legend>
                        <p className="font-serif italic text-sm text-ink/60 mb-3">
                            Hide any recipe an author flagged as containing these.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {ALLERGENS.map(a => {
                                const on = excludedAllergens.includes(a.value)
                                return (
                                    <button
                                        key={a.value}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => onToggleAllergen(a.value)}
                                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                            on
                                                ? 'bg-rose-dark text-paper'
                                                : 'bg-paper-shade text-ink hover:bg-tan/40'
                                        }`}
                                    >
                                        {a.label}
                                    </button>
                                )
                            })}
                        </div>
                    </fieldset>

                    {/* Require dietary — keep only recipes satisfying all
                        selected attributes. Selected = rust (affirmative). */}
                    <fieldset>
                        <legend className="font-display text-lg text-ink mb-1">Require dietary</legend>
                        <p className="font-serif italic text-sm text-ink/60 mb-3">
                            Show only recipes an author marked as these.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {DIETARY.map(d => {
                                const on = requiredDietary.includes(d.value)
                                return (
                                    <button
                                        key={d.value}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => onToggleDietary(d.value)}
                                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                            on
                                                ? 'bg-rust text-paper'
                                                : 'bg-paper-shade text-ink hover:bg-tan/40'
                                        }`}
                                    >
                                        {d.label}
                                    </button>
                                )
                            })}
                        </div>
                    </fieldset>
                </div>

                <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-paper-shade">
                    <button
                        type="button"
                        onClick={onClear}
                        disabled={activeCount === 0}
                        className="px-4 py-2.5 text-rose-dark hover:text-rose disabled:opacity-40 disabled:cursor-not-allowed font-medium text-sm transition-colors min-h-[44px]"
                    >
                        Clear all
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors min-h-[44px]"
                    >
                        {activeCount === 0
                            ? 'Done'
                            : `Apply ${activeCount} filter${activeCount === 1 ? '' : 's'}`}
                    </button>
                </div>
            </div>
        </div>
    )
}

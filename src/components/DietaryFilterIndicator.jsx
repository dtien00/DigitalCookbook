import { allergenLabel, dietaryLabel } from '../lib/dietaryTags'

// Stage N item 4 — the persistent active-filter indicator in the home grid
// header. Safety-shaped: unlike the fridge basket (a convenience filter that
// can narrow silently), a dietary filter hiding recipes must be VISIBLE and
// explicitly dismissible — a user should never wonder why a recipe isn't
// showing. Renders nothing when no filter is active.
//
// Each named chip removes just that one filter (via the same toggle the modal
// uses); "Clear all" drops everything. `aria-live="polite"` announces the
// current exclusions/requirements as they change, so the filtering is never
// silent for screen-reader users either.
export default function DietaryFilterIndicator({
    excludedAllergens,
    requiredDietary,
    onToggleAllergen,
    onToggleDietary,
    onClearDietaryFilter,
}) {
    if (excludedAllergens.length === 0 && requiredDietary.length === 0) return null

    return (
        <div
            role="status"
            aria-live="polite"
            aria-label="Active dietary filters"
            className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-rose-dark/30 bg-rose-dark/5 px-4 py-3"
        >
            {excludedAllergens.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm text-rose-dark inline-flex items-center gap-1">
                        <span aria-hidden="true">⚠</span> Excluding
                    </span>
                    {excludedAllergens.map(a => (
                        <button
                            key={a}
                            type="button"
                            onClick={() => onToggleAllergen(a)}
                            aria-label={`Stop excluding ${allergenLabel(a)}`}
                            className="inline-flex items-center gap-1 pl-3 pr-2 py-1 rounded-full bg-rose-dark text-paper text-sm font-medium hover:bg-rose transition-colors"
                        >
                            {allergenLabel(a)}
                            <svg aria-hidden="true" viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M4 4l8 8M12 4l-8 8" />
                            </svg>
                        </button>
                    ))}
                </div>
            )}

            {requiredDietary.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm text-ink">Requiring</span>
                    {requiredDietary.map(d => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => onToggleDietary(d)}
                            aria-label={`Stop requiring ${dietaryLabel(d)}`}
                            className="inline-flex items-center gap-1 pl-3 pr-2 py-1 rounded-full bg-rust text-paper text-sm font-medium hover:bg-rust-dark transition-colors"
                        >
                            {dietaryLabel(d)}
                            <svg aria-hidden="true" viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M4 4l8 8M12 4l-8 8" />
                            </svg>
                        </button>
                    ))}
                </div>
            )}

            <button
                type="button"
                onClick={onClearDietaryFilter}
                className="ml-auto text-sm font-medium text-rose-dark hover:text-rose transition-colors min-h-[44px] px-2"
            >
                Clear all
            </button>
        </div>
    )
}

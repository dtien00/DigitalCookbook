import { useState } from 'react'
import { allergenLabel } from '../lib/dietaryTags'

// Stage N item 5 — safety banner on RecipeDetail. The home grid hides recipes
// that declare an excluded allergen, but a direct link (a shared URL, a
// bookmark, the "More from this author" rail) bypasses that filter — so a
// recipe the viewer excluded can still land in front of them. When it does,
// warn plainly: name the conflicting allergen(s) and why it's being flagged.
//
// Dismissible per session, per recipe (sessionStorage keyed by recipe id): a
// user who acknowledges the warning on this recipe shouldn't see it again this
// session, but a DIFFERENT excluded recipe still warns, and a fresh session
// re-warns. `role="alert"` so screen readers announce it immediately —
// silent is the one thing a safety notice must never be.
//
// Mount keyed by recipe.id at the call site so navigating between recipes
// re-evaluates dismissal against the new recipe.
export default function RecipeAllergenWarning({ recipeId, recipeAllergens, excludedAllergens }) {
    const conflicts = (recipeAllergens || []).filter(a => excludedAllergens?.includes(a))
    const storageKey = `cookbook.allergenWarnDismissed.${recipeId}`

    const [dismissed, setDismissed] = useState(() => {
        try { return sessionStorage.getItem(storageKey) === '1' } catch { return false }
    })

    if (conflicts.length === 0 || dismissed) return null

    const list = conflicts.map(allergenLabel).join(', ')

    const dismiss = () => {
        try { sessionStorage.setItem(storageKey, '1') } catch { /* private mode — dismiss in-memory only */ }
        setDismissed(true)
    }

    return (
        <div
            role="alert"
            className="no-print flex items-start gap-3 rounded-lg border border-rose-dark/40 bg-rose-dark/10 px-4 py-3 mb-5 text-left"
        >
            <span aria-hidden="true" className="text-rose-dark text-lg leading-none mt-0.5">⚠</span>
            <p className="flex-1 text-sm text-ink">
                <span className="font-semibold text-rose-dark">This recipe contains {list}.</span>{' '}
                You&rsquo;ve excluded {list.toLowerCase()} in your filters.
            </p>
            <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss allergen warning"
                className="flex-shrink-0 w-8 h-8 -mr-1 -mt-1 rounded-full text-ink/50 hover:text-rose-dark hover:bg-rose-dark/10 flex items-center justify-center transition-colors"
            >
                <svg aria-hidden="true" viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
            </button>
        </div>
    )
}

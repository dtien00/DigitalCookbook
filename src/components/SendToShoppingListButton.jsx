import { toast } from 'react-hot-toast'

// Stage N+2a — adds this recipe's still-needed (unchecked) ingredients to the
// cumulative in-app shopping list (/shopping-list). Sibling to Stage 18's
// ExportIngredientsButton: same unchecked-filter source, but the destination is
// the persistent in-app list instead of the clipboard. In a fresh kitchen
// session nothing is checked yet, so "unchecked" is effectively "everything" —
// the checklist just lets a cook drop items they already have before adding.
//
// Quantities are scaled by the servings multiplier and stored as raw numbers
// (not the fraction-substituted display string from scaleQuantity) so the
// shopping list can sum the same ingredient across recipes. Fraction display
// happens on the page at render time.
function toScaledNumber(quantity, multiplier) {
    if (typeof quantity !== 'number' || Number.isNaN(quantity)) return null
    return parseFloat((quantity * multiplier).toFixed(2))
}

export default function SendToShoppingListButton({
    ingredients,
    checkedIngredients,
    multiplier = 1,
    recipeId,
    recipeTitle,
    onAdd,
}) {
    const unchecked = ingredients.filter(ing => !checkedIngredients.has(ing.id))
    const disabled = unchecked.length === 0

    const handleAdd = () => {
        if (disabled) {
            toast('Everything is already checked off')
            return
        }
        const items = unchecked.map(ing => ({
            name: ing.name,
            unit: ing.unit ?? null,
            quantity: toScaledNumber(ing.quantity, multiplier),
            notes: ing.notes ?? null,
        }))
        onAdd(recipeId, recipeTitle, items)
        const noun = items.length === 1 ? 'ingredient' : 'ingredients'
        toast.success(`Added ${items.length} ${noun} to your shopping list`)
    }

    return (
        <button
            type="button"
            onClick={handleAdd}
            disabled={disabled}
            aria-label="Add unchecked ingredients to shopping list"
            className="no-print inline-flex items-center gap-1.5 px-3 py-2 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <span>Add to shopping list</span>
        </button>
    )
}

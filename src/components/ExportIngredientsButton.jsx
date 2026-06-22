import { toast } from 'react-hot-toast'
import { scaleQuantity } from '../lib/scaleQuantity'
import { copyText } from '../lib/copyText'

// Stage 18 — copies the unchecked ingredients (i.e., the ones the cook still
// needs to acquire) to the clipboard as a plaintext shopping list. Mirrors
// ShareButton's clipboard + toast posture so the affordance feels consistent
// with the rest of the recipe-action surface. Lives inside the Ingredients
// section rather than the action-pill row because the action is scoped to
// that data, not the recipe as a whole.

function formatLine(ing, multiplier) {
    const qty = scaleQuantity(ing.quantity, multiplier)
    const parts = [qty, ing.unit, ing.name].filter(p => p != null && String(p).trim() !== '')
    const head = `- ${parts.join(' ')}`
    return ing.notes ? `${head} (${ing.notes.trim()})` : head
}

export default function ExportIngredientsButton({
    recipeTitle,
    ingredients,
    checkedIngredients,
    multiplier = 1,
}) {
    const unchecked = ingredients.filter(ing => !checkedIngredients.has(ing.id))
    const disabled = unchecked.length === 0

    const handleExport = async () => {
        if (disabled) {
            toast('Everything is already checked off')
            return
        }
        const header = `Shopping list — ${recipeTitle}`
        const body = unchecked.map(ing => formatLine(ing, multiplier)).join('\n')
        const payload = `${header}\n${body}`
        try {
            await copyText(payload)
            const noun = unchecked.length === 1 ? 'ingredient' : 'ingredients'
            toast.success(`Copied ${unchecked.length} ${noun} to clipboard`)
        } catch (error) {
            toast.error('Could not copy list: ' + error.message)
        }
    }

    return (
        <button
            type="button"
            onClick={handleExport}
            disabled={disabled}
            aria-label="Copy unchecked ingredients to clipboard"
            className="no-print inline-flex items-center gap-1.5 px-3 py-2 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>Copy shopping list</span>
        </button>
    )
}

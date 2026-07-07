// Six-dot grip used as the drag handle on reorderable rows — the author-only
// ingredient/step rows in RecipeDetail, and (Stage 21) every row in
// CreateRecipe's ingredient editor.
export default function DragHandleIcon() {
    return (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.6" />
            <circle cx="15" cy="6" r="1.6" />
            <circle cx="9" cy="12" r="1.6" />
            <circle cx="15" cy="12" r="1.6" />
            <circle cx="9" cy="18" r="1.6" />
            <circle cx="15" cy="18" r="1.6" />
        </svg>
    )
}

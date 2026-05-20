// Circular bookmark button. Used on RecipeCard (top-right overlay)
// and on RecipeDetail (larger size). Stops propagation so clicking
// it doesn't also trigger the parent card's onClick.

const SIZE_MAP = {
    sm: { btn: 'w-8 h-8',  icon: 'w-4 h-4' },
    md: { btn: 'w-10 h-10', icon: 'w-5 h-5' },
    lg: { btn: 'w-12 h-12', icon: 'w-6 h-6' },
}

export default function BookmarkButton({ favorited, onClick, size = 'md', className = '' }) {
    const { btn, icon } = SIZE_MAP[size]

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation()
                onClick()
            }}
            aria-label={favorited ? 'Remove bookmark' : 'Save recipe'}
            aria-pressed={favorited}
            className={`${btn} flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow-md hover:bg-white hover:scale-110 active:scale-95 transition-all ${className}`}
        >
            <svg
                className={`${icon} ${favorited ? 'fill-rust stroke-rust' : 'fill-none stroke-ink'} transition-colors`}
                viewBox="0 0 24 24"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
        </button>
    )
}

// Circular "add to meal plan" button for recipe cards. Opens the parent's
// day/meal picker modal. Stops propagation so clicking it doesn't also fire
// the card's onClick (navigation). Chrome mirrors BookmarkButton so the
// top-right cover cluster reads as one set of controls.

const SIZE_MAP = {
    sm: { btn: 'w-8 h-8', icon: 'w-4 h-4' },
    md: { btn: 'w-11 h-11', icon: 'w-5 h-5' },
    lg: { btn: 'w-14 h-14', icon: 'w-6 h-6' },
}

export default function AddToPlanButton({ onClick, size = 'md', className = '' }) {
    const { btn, icon } = SIZE_MAP[size]

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation()
                onClick()
            }}
            aria-label="Add to meal plan"
            className={`${btn} flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow-md hover:bg-white hover:scale-110 active:scale-95 transition-all ${className}`}
        >
            <svg
                className={`${icon} fill-none stroke-ink`}
                viewBox="0 0 24 24"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="12" y1="13" x2="12" y2="18" />
                <line x1="9.5" y1="15.5" x2="14.5" y2="15.5" />
            </svg>
        </button>
    )
}

// Pill-shaped like button: heart icon + the public like count.
// The count is always visible (likes are public information); the
// fill state of the heart reflects whether the *current user* has
// liked the recipe. Anonymous viewers see the count and an outline
// heart — clicking opens the auth view (parent wires that).

const SIZE_MAP = {
    sm: { btn: 'h-11 px-3 text-xs',   icon: 'w-4 h-4', gap: 'gap-1' },
    md: { btn: 'h-10 px-3 text-sm',   icon: 'w-5 h-5', gap: 'gap-1.5' },
    lg: { btn: 'h-12 px-4 text-base', icon: 'w-6 h-6', gap: 'gap-2' },
}

export default function LikeButton({ liked, count, onClick, size = 'md', className = '' }) {
    const { btn, icon, gap } = SIZE_MAP[size]
    const labelSuffix = count === 1 ? '1 like' : `${count} likes`

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation()
                onClick()
            }}
            aria-label={liked ? `Unlike, ${labelSuffix}` : `Like, ${labelSuffix}`}
            aria-pressed={liked}
            className={`${btn} ${gap} inline-flex items-center rounded-full bg-white/90 backdrop-blur-sm shadow-md hover:bg-white hover:scale-105 active:scale-95 transition-all ${className}`}
        >
            <svg
                className={`${icon} ${liked ? 'fill-rose stroke-rose' : 'fill-none stroke-ink'} transition-colors`}
                viewBox="0 0 24 24"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {count > 0 && <span className="font-medium text-gray-800 tabular-nums">{count}</span>}
        </button>
    )
}

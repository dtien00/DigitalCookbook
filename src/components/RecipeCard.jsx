import BookmarkButton from './BookmarkButton'
import LikeButton from './LikeButton'

// Stage 14 item 1 — each recipe card reads as a closed mini-book on a shelf.
// The flat-card chrome is gone; the wrapper is now a `.recipe-book` with a
// spine on the left, page-edges sliver on the right, and the existing image
// (or a cognac leather cover for image-less recipes) as the cover art.
//
// Two variants:
//   1. Image cards   — cover art is the recipe image, with the existing
//      bottom-gradient overlay carrying title / description / tags.
//   2. Image-less    — cognac leather cover with embossed serif title,
//      tan hairline rule, italic description, tag chips.
//
// Bookmark / like / private-badge keep their existing absolute positions on
// the cover (above the page-edges via z-index). Anonymous viewers see both
// action buttons; the parent wires the click to open the auth view instead
// of toggling state.
export default function RecipeCard({
    recipe,
    onClick,
    favorited,
    onToggleFavorite,
    liked,
    likeCount = 0,
    onToggleLike,
}) {
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick?.()
        }
    }

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            aria-label={`Open recipe: ${recipe.title}`}
            className="recipe-book group mb-4 break-inside-avoid cursor-pointer"
        >
            <div className="recipe-book-spine" aria-hidden="true" />
            <div className="recipe-book-pages" aria-hidden="true" />

            {onToggleLike && (
                <LikeButton
                    liked={liked}
                    count={likeCount}
                    onClick={onToggleLike}
                    size="sm"
                    className="absolute top-3 left-3 z-10"
                />
            )}
            {onToggleFavorite && (
                <BookmarkButton
                    favorited={favorited}
                    onClick={onToggleFavorite}
                    className="absolute top-3 right-3 z-10"
                />
            )}
            {recipe.is_public === false && (
                <span
                    aria-label="Private recipe"
                    className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 bg-ink/70 backdrop-blur-sm text-paper text-[10px] font-medium rounded-full px-2 py-0.5"
                >
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
                        <path d="M5 6V4.5a3 3 0 0 1 6 0V6h.5A1.5 1.5 0 0 1 13 7.5v5A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-5A1.5 1.5 0 0 1 4.5 6H5Zm1.5 0h3V4.5a1.5 1.5 0 0 0-3 0V6Z" />
                    </svg>
                    Private
                </span>
            )}

            {recipe.image_url ? (
                <div className="recipe-book-cover relative">
                    <img
                        src={recipe.image_url}
                        alt={recipe.title}
                        loading="lazy"
                        className="block w-full h-auto transition-transform duration-500 ease-out group-hover:scale-105 sepia-[0.08]"
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 via-ink/45 to-transparent p-4">
                        {recipe.description && (
                            <p className="m-0 font-display italic text-paper text-sm leading-snug line-clamp-2 max-h-0 opacity-0 mb-0 group-hover:max-h-16 group-hover:opacity-100 group-hover:mb-2 overflow-hidden transition-all duration-300 ease-out drop-shadow">
                                {recipe.description}
                            </p>
                        )}
                        {recipe.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 max-h-0 opacity-0 mb-0 group-hover:max-h-12 group-hover:opacity-100 group-hover:mb-2 overflow-hidden transition-all duration-300 ease-out">
                                {recipe.tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="px-2 py-0.5 bg-paper/25 backdrop-blur-sm text-paper text-[11px] font-medium rounded-full">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                        <h3 className="m-0 font-display text-paper text-lg font-semibold drop-shadow-md leading-tight">
                            {recipe.title}
                        </h3>
                    </div>
                </div>
            ) : (
                <div className="recipe-book-cover recipe-book-cover-leather">
                    <h3 className="recipe-book-title">{recipe.title}</h3>
                    {recipe.description && (
                        <>
                            <div className="recipe-book-rule" aria-hidden="true" />
                            <p className="recipe-book-description">{recipe.description}</p>
                        </>
                    )}
                    {recipe.tags?.length > 0 && (
                        <div className="recipe-book-tags">
                            {recipe.tags.slice(0, 3).map(tag => (
                                <span key={tag} className="recipe-book-tag">{tag}</span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

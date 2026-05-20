import BookmarkButton from './BookmarkButton'
import LikeButton from './LikeButton'

// Shared recipe card used by the home grid (App.jsx), the Profile
// "My Recipes" section, and the My Bookmarks view. Two layouts:
// image cards use a bottom-gradient overlay with hover-revealed
// description + tags; image-less cards show everything in the body.
//
// Bookmark and like buttons render whenever their handlers are
// provided — anonymous viewers see both (with counts), and the
// parent wires the click to open the auth view instead of toggling
// the state. The bookmark icon sits top-right; the like pill sits
// top-left, so the corners are visually balanced and both are
// reachable without obscuring the title/overlay area.
export default function RecipeCard({
    recipe,
    onClick,
    favorited,
    onToggleFavorite,
    liked,
    likeCount = 0,
    onToggleLike,
}) {
    return (
        <div
            onClick={onClick}
            className="group mb-4 break-inside-avoid cursor-pointer overflow-hidden rounded-lg bg-[#fbf6f1] border border-paper-shade shadow-[0_2px_8px_rgba(30,30,36,0.06)] hover:shadow-[0_8px_20px_rgba(30,30,36,0.12)] transition-shadow duration-300 relative"
        >
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

            {recipe.image_url ? (
                <div className="relative overflow-hidden">
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
                <div className="p-5">
                    <h3 className="m-0 mb-2 font-display text-xl font-semibold text-ink">{recipe.title}</h3>
                    <div className="w-12 h-px bg-tan mb-3" />
                    <p className="m-0 font-display italic text-sm text-rose-dark line-clamp-2">{recipe.description}</p>
                    {recipe.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                            {recipe.tags.slice(0, 3).map(tag => (
                                <span key={tag} className="px-2 py-0.5 bg-tan-soft text-ink text-[11px] font-medium rounded-full">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

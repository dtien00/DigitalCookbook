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
            className="group mb-4 break-inside-avoid cursor-pointer overflow-hidden rounded-2xl bg-white shadow-sm hover:shadow-xl transition-shadow duration-300 relative"
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
                        className="block w-full h-auto transition-transform duration-500 ease-out group-hover:scale-105"
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4">
                        {recipe.description && (
                            <p className="m-0 text-white text-sm leading-snug line-clamp-2 max-h-0 opacity-0 mb-0 group-hover:max-h-16 group-hover:opacity-100 group-hover:mb-2 overflow-hidden transition-all duration-300 ease-out drop-shadow">
                                {recipe.description}
                            </p>
                        )}
                        {recipe.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 max-h-0 opacity-0 mb-0 group-hover:max-h-12 group-hover:opacity-100 group-hover:mb-2 overflow-hidden transition-all duration-300 ease-out">
                                {recipe.tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="px-2 py-0.5 bg-white/25 backdrop-blur-sm text-white text-[11px] font-medium rounded-full">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                        <h3 className="m-0 text-white text-base font-semibold drop-shadow-md leading-tight">
                            {recipe.title}
                        </h3>
                    </div>
                </div>
            ) : (
                <div className="p-5">
                    <h3 className="m-0 mb-2 text-lg font-semibold text-gray-900">{recipe.title}</h3>
                    <p className="m-0 text-sm text-gray-600 line-clamp-2">{recipe.description}</p>
                    {recipe.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                            {recipe.tags.slice(0, 3).map(tag => (
                                <span key={tag} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[11px] font-medium rounded-full">
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

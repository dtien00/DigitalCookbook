import { Link } from 'react-router-dom'

// Stage 17a — horizontal-scroll rail of small recipe thumbnails. Used for
// "More from this author" and "Similar recipes" on RecipeDetail.
//
// Design choice: a lightweight overflow-x-auto row rather than reusing
// <RecipesCarousel>. The carousel is intertwined with the profile
// book-spread's ResizeObserver height contract — forcing it here would
// either pull that complexity along or fragment its API. A rail is
// conceptually different from a paginated collection: it's a hint, not
// a destination.
//
// Empty-state hides the rail entirely (returns null) so parents don't
// need to gate visibility themselves.
export default function RecipeRail({ title, recipes }) {
    if (!recipes || recipes.length === 0) return null

    const headingId = `rail-${slugify(title)}`

    // Stop touch events from bubbling to RecipeDetail's Stage 9 swipe-back
    // handler. Without this, a thumb-scroll rightward on the rail (the same
    // direction as a back-swipe) registers as an 80px+ horizontal gesture
    // on the parent and pops the user out to the home hub mid-browse.
    // Vertical page scroll is unaffected — it's handled natively via
    // touchAction: 'pan-y' on the RecipeDetail root, not through React's
    // synthetic touch tree.
    const stopTouch = (e) => e.stopPropagation()

    return (
        <section className="no-print mt-8" aria-labelledby={headingId}>
            <h3
                id={headingId}
                className="font-display text-ink text-lg font-semibold mb-3"
            >
                {title}
            </h3>
            <div
                className="flex gap-4 overflow-x-auto pb-2 snap-x"
                role="list"
                onTouchStart={stopTouch}
                onTouchMove={stopTouch}
                onTouchEnd={stopTouch}
                onTouchCancel={stopTouch}
            >
                {recipes.map(r => (
                    <Link
                        key={r.id}
                        to={`/recipe/${r.id}`}
                        role="listitem"
                        aria-label={`Open recipe: ${r.title}`}
                        className="flex-shrink-0 w-40 snap-start group focus:outline-none focus-visible:ring-2 focus-visible:ring-rust rounded-md"
                    >
                        {r.image_url ? (
                            <div className="w-40 h-40 overflow-hidden rounded-md bg-paper-shade">
                                <img
                                    src={r.image_url}
                                    alt=""
                                    loading="lazy"
                                    className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                                />
                            </div>
                        ) : (
                            <div className="w-40 h-40 rounded-md bg-tan-soft flex items-center justify-center p-3">
                                <span className="font-display text-ink text-sm text-center line-clamp-3">
                                    {r.title}
                                </span>
                            </div>
                        )}
                        <p className="mt-2 font-display text-ink text-sm font-medium line-clamp-2 group-hover:text-rust transition-colors">
                            {r.title}
                        </p>
                    </Link>
                ))}
            </div>
        </section>
    )
}

function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

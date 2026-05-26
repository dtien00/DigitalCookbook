// Stage 14 item 2 — shared two-column "open book" shell for the profile
// surfaces. Left page = inside-cover utilities (user info / edit forms
// or read-only display); right page = book contents (recipes). Layout
// only — what goes inside each page is the caller's concern.
//
// Consumed by both:
//   /profile         — Profile.jsx           (editable)
//   /profile/:id     — AuthorProfile.jsx     (read-only)
//
// At lg+ the pages sit side-by-side with a visible spine between them.
// Below lg the spread stacks vertically and the spine collapses; the
// right page gains margin-top so the two pages still read as distinct
// surfaces rather than one merged block.
//
// Future Stage 14 items 3+4 will fill the left page with sidebar tabs
// (Account / Appearance / Security / Notifications); this commit keeps
// the existing content split intact and only re-treats the surface.
export default function ProfileBookSpread({ header, leftPage, rightPage }) {
    return (
        <div className="paper-grain min-h-screen">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                {header}
                <div className="book-spread mt-6">
                    <section
                        className="book-page book-page-left"
                        aria-label="Profile information"
                    >
                        {leftPage}
                    </section>
                    <div className="book-spine" aria-hidden="true" />
                    <section
                        className="book-page book-page-right"
                        aria-label="Recipes"
                    >
                        {rightPage}
                    </section>
                </div>
            </div>
        </div>
    )
}

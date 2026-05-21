// Auth style: "Book Cover — Composition Notebook"
//
// Visual metaphor: a closed, cognac-leather-bound cookbook lying on the paper
// background. Aesthetic reference: the classic premium-journal leather cover —
// smooth polished leather, a soft top-center highlight, deepening to saddle
// brown at the edges, with a single blind-embossed brand at the bottom and no
// other ornamentation.
//
//   - Outer frame: smooth cognac leather with a radial light-from-top
//     gradient + faint grain. A darker spine on the left, a thin cream
//     page-edges sliver on the right.
//   - Upper portion holds the email/password form inside a composition-notebook
//     label — marbled tan/ink border, ruled lines behind the fields, serif
//     title at the top. The parchment cartouche inset into the leather where
//     a hand-tooled title plaque would sit.
//   - Lower portion holds OAuth providers as a stitched cloth patch sewn onto
//     the cover — raised edges via layered box-shadows, fuzzy textile weave
//     via repeating radial gradients on paper-shade.
//   - Bottom of the cover carries a blind-embossed brand: a small ✦ glyph
//     above "DIGITAL COOKBOOK" in letter-spaced serif caps, pressed into the
//     leather rather than gilded.
//   - "Back to recipes" floats outside the book at top-left of the page so the
//     book itself reads as a single closed object, not chopped by chrome.
//
// All texture classes are defined in src/index.css under the `.auth-book-*`
// namespace. The cognac palette uses literal hex values (not the rustic-paper
// tokens) since the leather effect needs warmer browns than the rust/rust-dark
// pair can express — captured in CSS rather than promoted to a token because
// it's scoped to this one style.

export default function BookCoverComposition({ form, onBack }) {
    const {
        loading,
        email, setEmail,
        password, setPassword,
        view, setView,
        handleAuth,
        handleOAuth,
    } = form

    const title =
        view === 'signup' ? 'Create Account' :
        view === 'login' ? 'Welcome Back' :
        'Reset Password'

    return (
        <div className="auth-book-page min-h-screen flex items-center justify-center p-4 sm:p-8 relative">
            {/* Back-to-recipes lives outside the book frame so the cover reads
                as a single closed object. Pinned to top-left of the page with
                a paper-shade chip that contrasts against the paper-grain
                background without competing with the rust leather. */}
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    className="auth-book-back"
                >
                    ← Back to recipes
                </button>
            )}

            <div className="auth-book">
                <div className="auth-book-spine" aria-hidden="true" />
                <div className="auth-book-pages" aria-hidden="true" />
                <div className="auth-book-cover">
                    {/* Composition-notebook label — the upper "name plate". */}
                    <section className="auth-comp-label" aria-labelledby="auth-title">
                        <div className="auth-comp-marble" aria-hidden="true" />
                        <div className="auth-comp-inner">
                            <h2
                                id="auth-title"
                                className="font-display text-2xl sm:text-3xl text-ink text-center mb-1 tracking-tight"
                            >
                                {title}
                            </h2>
                            <p className="font-display italic text-rose text-center text-sm mb-5">
                                {view === 'signup' && 'A new page in the cookbook.'}
                                {view === 'login' && 'Open your cookbook.'}
                                {view === 'forgot_password' && 'We\'ll send you a link.'}
                            </p>

                            {/* Form has an id so the clasp <button> on the cover
                                (rendered outside this cartouche) can submit it
                                via the HTML5 `form` attribute — the submit
                                affordance lives on the book's edge, not inside
                                the form. Enter-key submit still works as usual. */}
                            <form id="auth-form" onSubmit={handleAuth} className="auth-comp-form">
                                <div className="auth-comp-field">
                                    <label htmlFor="auth-email" className="font-display text-xs uppercase tracking-wider text-ink/70">Email</label>
                                    <input
                                        id="auth-email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        autoComplete="email"
                                        className="auth-comp-input"
                                    />
                                </div>

                                {view !== 'forgot_password' && (
                                    <div className="auth-comp-field">
                                        <label htmlFor="auth-password" className="font-display text-xs uppercase tracking-wider text-ink/70">Password</label>
                                        <input
                                            id="auth-password"
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
                                            className="auth-comp-input"
                                        />
                                    </div>
                                )}
                            </form>
                        </div>
                    </section>

                    {/* Clasp row — view-toggle links on the left (leather margin
                        notes), submit clasp on the right. Both live in the
                        leather band below the cartouche; the row is the natural
                        eye-line after filling in the form. */}
                    <div className="auth-clasp-row">
                        <div className="auth-view-toggle">
                            {view === 'login' && (
                                <>
                                    <p>
                                        Don't have an account?{' '}
                                        <button type="button" onClick={() => setView('signup')} className="auth-view-toggle-link">Sign Up</button>
                                    </p>
                                    <p>
                                        <button type="button" onClick={() => setView('forgot_password')} className="auth-view-toggle-link auth-view-toggle-link-muted">Forgot Password?</button>
                                    </p>
                                </>
                            )}
                            {view === 'signup' && (
                                <p>
                                    Already have an account?{' '}
                                    <button type="button" onClick={() => setView('login')} className="auth-view-toggle-link">Login</button>
                                </p>
                            )}
                            {view === 'forgot_password' && (
                                <p>
                                    <button type="button" onClick={() => setView('login')} className="auth-view-toggle-link">Back to Login</button>
                                </p>
                            )}
                        </div>

                        {/* Leather strap clasp — submits the in-cartouche form
                            via the HTML5 `form` attribute. Visual metaphor: a
                            person would unfasten this clasp before opening the
                            journal. */}
                        <button
                            type="submit"
                            form="auth-form"
                            disabled={loading}
                            className="auth-clasp"
                            aria-label={
                                loading ? 'Processing' :
                                view === 'signup' ? 'Sign up' :
                                view === 'login' ? 'Unlock and log in' :
                                'Send reset link'
                            }
                        >
                            <span className="auth-clasp-strap">
                                <span className="auth-clasp-stitch auth-clasp-stitch-top" aria-hidden="true" />
                                <span className="auth-clasp-stitch auth-clasp-stitch-bottom" aria-hidden="true" />
                                <span className="auth-clasp-stud" aria-hidden="true" />
                                <span className="auth-clasp-label">
                                    {loading ? '…' :
                                        view === 'signup' ? 'Sign Up' :
                                        view === 'login' ? 'Login' :
                                        'Send'}
                                </span>
                                {/* Wrap shadow at the right end — darkens the
                                    strap as it approaches the book's edge,
                                    reinforcing that the leather is curving
                                    around to the back cover. */}
                                <span className="auth-clasp-wrap" aria-hidden="true" />
                            </span>
                        </button>
                    </div>

                    {/* OAuth — only on login/signup. Forgot-password is email-only.
                        Single brass label-plate panel with scrollwork ends; the
                        two provider cells sit *on top* of the plate as discrete
                        high-contrast cards (cream parchment against dark brass)
                        so each provider reads as its own affordance while still
                        living inside the unified ornate frame. */}
                    {view !== 'forgot_password' && (
                        <section className="auth-plates-section" aria-label="Other sign-in options">
                            <div className="auth-plate-divider" aria-hidden="true">
                                <span>or continue with</span>
                            </div>
                            <div className="auth-plate-panel">
                                <ScrollCap />
                                <div className="auth-plate-cells">
                                    <button
                                        type="button"
                                        onClick={() => handleOAuth('google')}
                                        disabled={loading}
                                        className="auth-plate-cell"
                                    >
                                        <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5">
                                            <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.1s2.69-6.1 6-6.1c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.83 3.31 14.65 2.4 12 2.4 6.92 2.4 2.8 6.52 2.8 11.6S6.92 20.8 12 20.8c6.93 0 9.2-4.86 9.2-7.4 0-.49-.05-.86-.12-1.2H12z"/>
                                        </svg>
                                        <span>Google</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleOAuth('github')}
                                        disabled={loading}
                                        className="auth-plate-cell"
                                    >
                                        <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5">
                                            <path fill="#1e1e24" d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.16-.01-2.1-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.69.08-.69 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18A11.05 11.05 0 0 1 12 6.8c.98 0 1.97.13 2.89.39 2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.27 5.68.41.36.77 1.05.77 2.12 0 1.53-.01 2.77-.01 3.15 0 .31.21.68.8.56 4.56-1.52 7.84-5.83 7.84-10.9C23.5 5.65 18.35.5 12 .5z"/>
                                        </svg>
                                        <span>GitHub</span>
                                    </button>
                                </div>
                                <ScrollCap mirrored />
                            </div>
                            <p className="font-display italic text-tan/90 text-center text-xs mt-2 drop-shadow-[0_1px_0_rgba(30,30,36,0.45)]">
                                Optional · providers configured in Supabase
                            </p>
                        </section>
                    )}

                    {/* Blind-embossed brand at the bottom of the cover. ✦ glyph
                        stands in for the reference's mountain logo; the text
                        is pressed into the leather (no gold), so its color
                        approximates the leather + the text-shadow does the
                        depressed-edge work. */}
                    <div className="auth-book-brand" aria-hidden="true">
                        <span className="auth-book-brand-mark">✦</span>
                        <span className="auth-book-brand-text">Digital Cookbook</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Stylized brass scrollwork — simple S-curves with a central boss + small
// flourishes. Reads as ornate at a glance without trying to be a literal
// acanthus leaf (which would only look right at much larger sizes than we
// have here). Single SVG; the right-side cap re-uses it via scaleX(-1).
function ScrollCap({ mirrored = false }) {
    return (
        <svg
            viewBox="0 0 40 48"
            className={`auth-plate-scroll ${mirrored ? 'auth-plate-scroll-right' : 'auth-plate-scroll-left'}`}
            aria-hidden="true"
        >
            {/* Upper S-curve */}
            <path d="M 6 24 C 6 12, 16 6, 24 12 C 27 14, 27 18, 24 20 C 21 22, 17 19, 19 16"
                  fill="none" stroke="#2a1c0e" strokeWidth="1.3" strokeLinecap="round"/>
            {/* Lower S-curve (mirror of upper) */}
            <path d="M 6 24 C 6 36, 16 42, 24 36 C 27 34, 27 30, 24 28 C 21 26, 17 29, 19 32"
                  fill="none" stroke="#2a1c0e" strokeWidth="1.3" strokeLinecap="round"/>
            {/* Highlight curves on top of dark scrollwork — gives the brass a glint */}
            <path d="M 8 22 C 8 14, 16 9, 22 13"
                  fill="none" stroke="#e8c896" strokeWidth="0.6" strokeLinecap="round" opacity="0.7"/>
            <path d="M 8 26 C 8 34, 16 39, 22 35"
                  fill="none" stroke="#e8c896" strokeWidth="0.6" strokeLinecap="round" opacity="0.55"/>
            {/* Central boss — round metal stud where the scrolls meet */}
            <circle cx="32" cy="24" r="4" fill="#5a4225" stroke="#2a1c0e" strokeWidth="0.8"/>
            <circle cx="32" cy="24" r="1.6" fill="#d6aa6c"/>
            <circle cx="31" cy="23" r="0.6" fill="#f5dca8" opacity="0.85"/>
            {/* Small tendril off the boss toward the surface */}
            <path d="M 36 24 L 39 24" stroke="#2a1c0e" strokeWidth="1" strokeLinecap="round"/>
        </svg>
    )
}

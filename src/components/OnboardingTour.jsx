import { useState, useEffect, useRef } from 'react'

// First-run onboarding tour (Stage M, item 2). A lightweight 3-step centered
// overlay shown once to brand-new signed-in users on the home grid.
//
// Deliberately NOT a spotlight/coachmark tour: anchoring a highlight to the
// masonry cards (which reflow by viewport and library size) would be fragile
// and break at phone width. Instead each step names the affordance in copy
// with a matching glyph — robust across every layout, and the home grid is
// visible behind the scrim so the references land.
//
// Dismissal (Skip link, finishing the last step, backdrop click, or Escape)
// is one-way: the parent's onDismiss persists onboarding_dismissed_at via
// useOnboarding so the tour never returns. The parent also gates rendering
// (signed-in + not-yet-dismissed + on the home route), so this component
// assumes it should be visible whenever it's mounted.

const CardIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
    </svg>
)
const BookmarkIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
)
const PlusIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
)

const STEPS = [
    {
        Icon: CardIcon,
        title: 'Tap any recipe',
        body: 'Tap a card to open the full recipe — ingredients, steps, a servings scaler, and a kitchen-friendly cook mode.',
    },
    {
        Icon: BookmarkIcon,
        title: 'Save your favorites',
        body: 'Tap the bookmark on any card to keep recipes you want to come back to. Find them anytime under Profile → Bookmarks.',
    },
    {
        Icon: PlusIcon,
        title: 'Add your own',
        body: 'Hit “+ New Recipe” to start your own cookbook. Each recipe can be public for everyone or kept private to you.',
    },
]

export default function OnboardingTour({ onDismiss }) {
    const [step, setStep] = useState(0)
    const primaryRef = useRef(null)
    const isLast = step === STEPS.length - 1
    const { Icon, title, body } = STEPS[step]

    // Escape dismisses the whole tour (treated the same as Skip).
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onDismiss() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onDismiss])

    // Move focus to the primary action on mount and whenever the step
    // changes, so keyboard users land inside the dialog and Enter advances.
    useEffect(() => {
        primaryRef.current?.focus()
    }, [step])

    return (
        <div
            // Backdrop. Click anywhere outside the card dismisses (the
            // "skip-on-any-click" affordance from the roadmap), but Back/Next
            // inside the card don't bubble out to here.
            className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-ink/40"
            onClick={onDismiss}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="onboarding-title"
                aria-describedby="onboarding-body"
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm bg-paper border border-paper-shade rounded-lg shadow-xl p-6 text-center"
            >
                <div
                    aria-hidden="true"
                    className="mx-auto mb-5 w-16 h-16 rounded-full bg-tan-soft text-rust flex items-center justify-center"
                >
                    <Icon className="w-8 h-8" />
                </div>

                <h2 id="onboarding-title" className="font-display text-xl text-ink mb-2">
                    {title}
                </h2>
                <p id="onboarding-body" className="font-serif text-ink/70 leading-relaxed mb-6">
                    {body}
                </p>

                {/* Step dots — current step filled rust, the rest quiet. */}
                <div className="flex justify-center gap-2 mb-6" aria-hidden="true">
                    {STEPS.map((_, i) => (
                        <span
                            key={i}
                            className={`w-2 h-2 rounded-full transition-colors ${i === step ? 'bg-rust' : 'bg-paper-shade'}`}
                        />
                    ))}
                </div>

                <div className="flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={onDismiss}
                        className="text-sm font-medium text-rose hover:text-rose-dark transition-colors"
                    >
                        Skip
                    </button>
                    <div className="flex items-center gap-2">
                        {step > 0 && (
                            <button
                                type="button"
                                onClick={() => setStep(s => s - 1)}
                                className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors min-h-[44px]"
                            >
                                Back
                            </button>
                        )}
                        <button
                            ref={primaryRef}
                            type="button"
                            onClick={() => (isLast ? onDismiss() : setStep(s => s + 1))}
                            className="px-5 py-2 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors min-h-[44px]"
                        >
                            {isLast ? 'Got it' : 'Next'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

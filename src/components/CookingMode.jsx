import { useState, useEffect, useRef, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { scaleQuantity } from '../lib/scaleQuantity'
import { groupIngredients } from '../lib/ingredientSections'
import { formatMs } from '../lib/parseDuration'
import { supabase } from '../lib/supabaseClient'

// Stage 15 — full-screen kitchen-focused step view. Launched from the
// "Start cooking" button on RecipeDetail. The recipe's ingredient checklist
// state and step checklist state are owned by the parent and threaded down
// so toggles here persist when the user exits back to the normal view.
//
// Wake Lock contract: acquire on mount, release on unmount, re-acquire on
// tab-visibility-returns. Older Safari (<16.4) and any browser without the
// API silently no-op — the screen may dim, but the rest of the view works.
//
// Gesture contract: same threshold envelope as the Stage 9 swipe-back —
// 80px horizontal travel with <40px vertical drift. Swipe-right (positive
// dx) goes to the previous step; swipe-left (negative dx) advances. Vertical
// scroll inside long step text stays native via touchAction: pan-y and the
// dy>dx abandon check.
export default function CookingMode({
    recipe,
    steps,
    ingredients,
    multiplier,
    checkedIngredients,
    setCheckedIngredients,
    checkedSteps,
    setCheckedSteps,
    onExit,
    onOpenTimerSheet,
    onStartTimer,
}) {
    const [currentStep, setCurrentStep] = useState(0)
    const [showIngredients, setShowIngredients] = useState(false)
    const [swipeX, setSwipeX] = useState(0)
    const touchRef = useRef({ startX: 0, startY: 0, lastX: 0, lastY: 0, tracking: false })
    const wakeLockRef = useRef(null)

    useEffect(() => {
        let cancelled = false

        async function acquire() {
            if (!('wakeLock' in navigator)) return
            try {
                const lock = await navigator.wakeLock.request('screen')
                if (cancelled) {
                    lock.release().catch(() => {})
                    return
                }
                wakeLockRef.current = lock
                lock.addEventListener('release', () => {
                    if (wakeLockRef.current === lock) wakeLockRef.current = null
                })
            } catch {
                // Missing user gesture, page hidden at acquire-time, or
                // unsupported — swallow and let the screen dim normally.
            }
        }

        function onVisibility() {
            if (document.visibilityState === 'visible' && !wakeLockRef.current) {
                acquire()
            }
        }

        acquire()
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
            cancelled = true
            document.removeEventListener('visibilitychange', onVisibility)
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => {})
                wakeLockRef.current = null
            }
        }
    }, [])

    useEffect(() => {
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        // Stage 19 — flag cooking mode so the App-level <TimerWidget> lifts
        // itself above this surface's bottom footer (Previous / dots / Next)
        // instead of overlapping the Previous button. A CSS rule keyed on this
        // class does the shift; see index.css `.timer-widget`.
        document.body.classList.add('cooking-active')
        return () => {
            document.body.style.overflow = previousOverflow
            document.body.classList.remove('cooking-active')
        }
    }, [])

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') {
                if (showIngredients) setShowIngredients(false)
                else onExit()
            } else if (e.key === 'ArrowRight') {
                setCurrentStep(s => Math.min(steps.length - 1, s + 1))
            } else if (e.key === 'ArrowLeft') {
                setCurrentStep(s => Math.max(0, s - 1))
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [steps.length, showIngredients, onExit])

    const handleTouchStart = (e) => {
        if (showIngredients) return
        if (e.touches.length !== 1) return
        const t = e.touches[0]
        touchRef.current = { startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastY: t.clientY, tracking: true }
    }

    const handleTouchMove = (e) => {
        if (!touchRef.current.tracking || e.touches.length !== 1) return
        const t = e.touches[0]
        touchRef.current.lastX = t.clientX
        touchRef.current.lastY = t.clientY
        const dx = t.clientX - touchRef.current.startX
        const dy = Math.abs(t.clientY - touchRef.current.startY)
        if (dy > 40 && dy > Math.abs(dx)) {
            touchRef.current.tracking = false
            setSwipeX(0)
            return
        }
        setSwipeX(Math.max(-200, Math.min(200, dx)))
    }

    const handleTouchEnd = () => {
        if (!touchRef.current.tracking) {
            setSwipeX(0)
            return
        }
        const dx = touchRef.current.lastX - touchRef.current.startX
        const dy = Math.abs(touchRef.current.lastY - touchRef.current.startY)
        touchRef.current.tracking = false
        if (dy < 40) {
            if (dx >= 80 && currentStep > 0) {
                setCurrentStep(s => s - 1)
            } else if (dx <= -80 && currentStep < steps.length - 1) {
                setCurrentStep(s => s + 1)
            }
        }
        setSwipeX(0)
    }

    function toggleChecked(setter, id) {
        setter(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const isFirst = currentStep === 0
    const isLast = currentStep === steps.length - 1
    const progressPct = steps.length > 0 ? Math.round(((currentStep + 1) / steps.length) * 100) : 0

    // React's synthetic event system bubbles through the component tree,
    // not the DOM tree — so even though CookingMode portals to document.body,
    // touches inside it still reach RecipeDetail's swipe-back-to-home
    // handler. Stop propagation at the cooking-mode root so a swipe-right
    // here only navigates between steps, not out of the recipe entirely.
    const stopTouchPropagation = (e) => e.stopPropagation()

    return createPortal(
        <div
            className="fixed inset-0 z-[100] bg-paper paper-grain flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label={`Cooking ${recipe.title}`}
            onTouchStart={stopTouchPropagation}
            onTouchMove={stopTouchPropagation}
            onTouchEnd={stopTouchPropagation}
            onTouchCancel={stopTouchPropagation}
        >
            <div className="flex items-center justify-between gap-3 px-4 py-3 landscape:py-2 border-b border-paper-shade flex-shrink-0">
                <button
                    onClick={onExit}
                    aria-label="Exit cooking mode"
                    className="w-11 h-11 flex items-center justify-center rounded-full bg-paper-shade hover:bg-tan/40 text-ink transition-colors shrink-0"
                >
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
                <div className="flex flex-col items-center min-w-0">
                    <span className="font-display text-xs uppercase tracking-wider text-rust">Cooking</span>
                    <span className="font-serif italic text-sm text-ink/70 truncate max-w-[60vw]">{recipe.title}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {/* Stage 19 — open the timer quick-set sheet. The running
                        timer floats over this surface via the App-level
                        <TimerWidget> (z-[120], above cooking mode's z-[100]). */}
                    <button
                        onClick={onOpenTimerSheet}
                        aria-label="Set a timer"
                        className="w-11 h-11 flex items-center justify-center rounded-full bg-paper-shade hover:bg-tan/40 text-ink transition-colors shrink-0"
                    >
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="13" r="8" />
                            <path d="M12 9v4l2 2" />
                            <path d="M9 2h6" />
                        </svg>
                    </button>
                    <button
                        onClick={() => setShowIngredients(true)}
                        aria-label="View ingredients"
                        className="w-11 h-11 flex items-center justify-center rounded-full bg-paper-shade hover:bg-tan/40 text-ink transition-colors shrink-0"
                    >
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h13" />
                            <path d="M3 12h13" />
                            <path d="M3 18h13" />
                            <circle cx="20" cy="6" r="1" />
                            <circle cx="20" cy="12" r="1" />
                            <circle cx="20" cy="18" r="1" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="px-4 pt-3 landscape:pt-2 flex-shrink-0">
                <div className="flex items-center justify-between text-xs text-ink/60 font-display mb-1.5">
                    <span>Step {currentStep + 1} of {steps.length}</span>
                    <span>{progressPct}%</span>
                </div>
                <div className="h-1.5 bg-paper-shade rounded-full overflow-hidden">
                    <div
                        className="h-full bg-rust transition-[width] duration-200 ease-out"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
            </div>

            {/* Step content as a horizontal carousel — all steps pre-rendered
                in a flex row that translates per currentStep. The user's
                drag moves the row via swipeX, and on commit React batches
                setCurrentStep + setSwipeX(0) into one render so the row
                animates smoothly from "drag position with old step" to
                "rest position with new step" (CSS transition takes over
                once swipeX === 0). Each step has its own overflow-y-auto
                so long instructions can vertical-scroll independently
                without affecting the row's horizontal translation. */}
            <div
                className="flex-1 relative overflow-hidden"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                style={{ touchAction: 'pan-y' }}
            >
                {steps.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center px-6">
                        <p className="font-serif italic text-ink/60">No steps to cook through.</p>
                    </div>
                ) : (
                    <div
                        className="absolute inset-0 flex"
                        style={{
                            width: `${steps.length * 100}%`,
                            transform: `translateX(calc(${(-currentStep * 100) / steps.length}% + ${swipeX}px))`,
                            transition: swipeX !== 0 ? 'none' : 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                    >
                        {steps.map((s, i) => {
                            const sDone = checkedSteps.has(s.id)
                            const isCurrent = i === currentStep
                            // Stage 15 item 1 — step photo (if any) lives
                            // in the bottom-left quadrant; Mark-step-done
                            // pill sits in the bottom-right, vertically
                            // centered. Steps without a photo keep the
                            // original centered layout.
                            const photoUrl = s.photo_path
                                ? supabase.storage.from('recipe-steps').getPublicUrl(s.photo_path).data.publicUrl
                                : null
                            // Stage 19 Phase 2 — a step with an authored
                            // duration offers a one-tap preset timer. Labelled
                            // by step so the floating widget says which step it
                            // belongs to. Steps without a duration show nothing
                            // here; the header clock still starts an ad-hoc one.
                            const timerChip = s.duration_seconds && onStartTimer ? (
                                <button
                                    onClick={() => onStartTimer({ durationMs: s.duration_seconds * 1000, label: `Step ${i + 1}` })}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-full bg-paper-shade text-ink hover:bg-tan/40 transition-colors font-medium"
                                >
                                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <circle cx="12" cy="13" r="8" />
                                        <path d="M12 9v4l2 2" />
                                        <path d="M9 2h6" />
                                    </svg>
                                    Start {formatMs(s.duration_seconds * 1000)} timer
                                </button>
                            ) : null
                            const doneButton = (
                                <button
                                    onClick={() => {toggleChecked(setCheckedSteps, s.id); if (sDone) return; isLast ? onExit() : setCurrentStep(prev => Math.min(steps.length - 1, prev + 1));}}
                                    aria-pressed={sDone}
                                    tabIndex={isCurrent ? 0 : -1}
                                    className={`inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-full font-medium transition-colors ${
                                        sDone
                                            ? 'bg-rust text-paper hover:bg-rust-dark'
                                            : 'bg-paper-shade text-ink hover:bg-tan/40'
                                    }`}
                                >
                                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    {sDone ? 'Done' : 'Mark step done'}
                                </button>
                            )
                            return (
                                <div
                                    key={s.id}
                                    className="overflow-y-auto px-6 py-8 landscape:py-4 flex items-center landscape:items-start justify-center"
                                    style={{ width: `${100 / steps.length}%`, flexShrink: 0 }}
                                    aria-hidden={!isCurrent}
                                >
                                    <div className="max-w-2xl w-full">
                                        <div className="font-display text-rust text-xs uppercase tracking-widest mb-6 landscape:mb-3 text-center">
                                            Step {i + 1}
                                        </div>
                                        <p className={`font-serif text-2xl sm:text-3xl landscape:text-3xl sm:landscape:text-4xl leading-relaxed text-center ${sDone ? 'line-through text-ink/40' : 'text-ink'}`}>
                                            {s.instruction}
                                        </p>
                                        {photoUrl ? (
                                            <div className="mt-8 landscape:mt-4 grid grid-cols-2 gap-4 items-center">
                                                <img
                                                    src={photoUrl}
                                                    alt=""
                                                    className="w-full max-h-64 landscape:max-h-48 object-contain rounded-md justify-self-start"
                                                />
                                                <div className="flex flex-col items-center gap-3">
                                                    {timerChip}
                                                    {doneButton}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-3 mt-10 landscape:mt-6">
                                                {timerChip}
                                                {doneButton}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-4 landscape:py-2 border-t border-paper-shade flex-shrink-0">
                <button
                    onClick={() => setCurrentStep(s => Math.max(0, s - 1))}
                    disabled={isFirst}
                    aria-label="Previous step"
                    className="inline-flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-full bg-paper-shade text-ink font-medium hover:bg-tan/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                    <span className="hidden sm:inline">Previous</span>
                </button>

                {/* Step dots double as quick-jump buttons. Capped at 12 visible
                    so a 30-step recipe doesn't overflow the action row. */}
                <div className="flex items-center gap-1.5 overflow-x-auto px-1 min-w-0">
                    {steps.slice(0, 12).map((s, i) => (
                        <button
                            key={s.id}
                            onClick={() => setCurrentStep(i)}
                            aria-label={`Go to step ${i + 1}`}
                            aria-current={i === currentStep ? 'step' : undefined}
                            className={`w-2.5 h-2.5 rounded-full transition-all shrink-0 ${
                                i === currentStep
                                    ? 'bg-rust scale-125'
                                    : checkedSteps.has(s.id)
                                        ? 'bg-rust/40'
                                        : 'bg-paper-shade border border-ink/10'
                            }`}
                        />
                    ))}
                    {steps.length > 12 && (
                        <span className="text-xs text-ink/40 font-display ml-1">+{steps.length - 12}</span>
                    )}
                </div>

                {isLast ? (
                    <button
                        onClick={onExit}
                        aria-label="Finish cooking"
                        className="inline-flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-full bg-rust text-paper font-semibold hover:bg-rust-dark transition-colors shrink-0"
                    >
                        <span className="hidden sm:inline">Finish</span>
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    </button>
                ) : (
                    <button
                        onClick={() => setCurrentStep(s => Math.min(steps.length - 1, s + 1))}
                        aria-label="Next step"
                        className="inline-flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-full bg-rust text-paper font-medium hover:bg-rust-dark transition-colors shrink-0"
                    >
                        <span className="hidden sm:inline">Next</span>
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    </button>
                )}
            </div>

            {showIngredients && (
                <div
                    className="fixed inset-0 z-[110] flex items-end"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Ingredients checklist"
                >
                    <button
                        type="button"
                        aria-label="Close ingredients"
                        className="absolute inset-0 bg-ink/40 cursor-default"
                        onClick={() => setShowIngredients(false)}
                    />
                    <div className="relative w-full bg-paper paper-grain rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-paper-shade flex-shrink-0">
                            <h2 className="font-display text-lg text-ink m-0">Ingredients</h2>
                            <button
                                onClick={() => setShowIngredients(false)}
                                aria-label="Close ingredients"
                                className="w-10 h-10 flex items-center justify-center rounded-full bg-paper-shade hover:bg-tan/40 text-ink transition-colors"
                            >
                                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                        <ul className="flex-1 overflow-y-auto px-5 py-3 space-y-1 list-none">
                            {/* Stage 21 — same contiguous-run grouping as
                                RecipeDetail, headings only (no collapse: the
                                drawer is already a compact overlay). */}
                            {ingredients.length === 0 ? (
                                <li className="font-serif italic text-ink/60 py-2">No ingredients listed.</li>
                            ) : groupIngredients(ingredients).map(group => (
                                <Fragment key={`${group.startIndex}:${group.section ?? ''}`}>
                                    {group.section && (
                                        <li className="pt-3">
                                            <span className="block font-display text-rust text-xs uppercase tracking-widest border-b border-tan/60 pb-1">
                                                {group.section}
                                            </span>
                                        </li>
                                    )}
                                    {group.items.map(ing => {
                                        const checked = checkedIngredients.has(ing.id)
                                        return (
                                            <li key={ing.id}>
                                                <label className="flex items-start gap-3 cursor-pointer select-none py-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleChecked(setCheckedIngredients, ing.id)}
                                                        className="accent-rust w-5 h-5 mt-1 shrink-0 cursor-pointer"
                                                    />
                                                    <span className={`font-serif text-base ${checked ? 'line-through text-ink/40' : 'text-ink'}`}>
                                                        {scaleQuantity(ing.quantity, multiplier)} {ing.unit} {ing.name}
                                                        {ing.notes && (
                                                            <span className="block italic text-ink/60 text-sm mt-0.5 font-serif">
                                                                {ing.notes}
                                                            </span>
                                                        )}
                                                    </span>
                                                </label>
                                            </li>
                                        )
                                    })}
                                </Fragment>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>,
        document.body
    )
}

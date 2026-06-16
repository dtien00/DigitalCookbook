import { useState, useRef, useEffect } from 'react'
import { toast } from 'react-hot-toast'

// Stage 16 item 1 — "Report" affordance for comments, recipes, and author
// profiles. The button is the public surface; the dialog is internal.
//
// Variants:
//   - 'icon'      — small flag glyph button (used inline alongside other
//                   icon controls, e.g. RecipeDetail action cluster)
//   - 'text'      — minimal text-only "Report" link (used in Comments,
//                   alongside Delete)
//   - 'pill'      — paper-shade pill matching Follow/Unfollow visual weight
//                   (used on AuthorProfile)
//
// Anonymous click routes to onRequireAuth (Auth overlay) — matches the
// Comments form and the Like/Bookmark patterns.
//
// Reporting your own content is hidden upstream (caller passes
// canReport={isOwn ? false : true}) rather than checking inside, because
// the "own content" check needs different shape per target type (comment.
// user_id, recipe.author_id, profile.id) and the caller has cleaner access.
export default function ReportButton({
    targetType,
    targetId,
    targetLabel,
    userId,
    onRequireAuth,
    submitReport,
    variant = 'icon',
}) {
    const [open, setOpen] = useState(false)
    const triggerRef = useRef(null)

    const handleClick = () => {
        if (!userId) {
            onRequireAuth?.()
            return
        }
        setOpen(true)
    }

    return (
        <>
            {variant === 'text' ? (
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={handleClick}
                    className="mt-1 min-h-[44px] flex items-center text-xs text-ink/60 hover:text-rose-dark transition-colors"
                    aria-label={`Report this ${targetType}`}
                >
                    Report
                </button>
            ) : variant === 'pill' ? (
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={handleClick}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-transparent hover:bg-paper-shade text-ink/60 hover:text-rose-dark text-sm font-medium rounded-full transition-colors min-h-[36px]"
                    aria-label={`Report ${targetLabel || 'this profile'}`}
                >
                    <FlagIcon />
                    Report
                </button>
            ) : (
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={handleClick}
                    aria-label={`Report this ${targetType}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-medium rounded-md transition-colors"
                >
                    <FlagIcon />
                    <span className="hidden sm:inline">Report</span>
                </button>
            )}

            {open && (
                <ReportDialog
                    targetType={targetType}
                    targetId={targetId}
                    targetLabel={targetLabel}
                    submitReport={submitReport}
                    onClose={() => {
                        setOpen(false)
                        // Restore focus to the trigger so keyboard users
                        // don't lose their place after the dialog dismisses.
                        triggerRef.current?.focus()
                    }}
                />
            )}
        </>
    )
}

const TARGET_LABELS = {
    comment: 'comment',
    recipe: 'recipe',
    profile: 'author',
}

function ReportDialog({ targetType, targetId, targetLabel, submitReport, onClose }) {
    const [reason, setReason] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const textareaRef = useRef(null)

    // Body scroll lock + Escape handler — mirrors MfaEnrollDialog and
    // FridgeBasket's modal vocabulary so the three modal surfaces feel
    // consistent.
    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const onKey = (e) => { if (e.key === 'Escape' && !submitting) onClose() }
        document.addEventListener('keydown', onKey)
        textareaRef.current?.focus()
        return () => {
            document.body.style.overflow = prev
            document.removeEventListener('keydown', onKey)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleSubmit = async (e) => {
        e.preventDefault()
        const trimmed = reason.trim()
        if (!trimmed || submitting) return
        setSubmitting(true)
        try {
            await submitReport({ target_type: targetType, target_id: targetId, reason: trimmed })
            toast.success(`Reported — thanks for flagging this ${TARGET_LABELS[targetType] || 'item'}.`)
            onClose()
        } catch (error) {
            toast.error(error.message)
            setSubmitting(false)
        }
    }

    const remaining = 1000 - reason.length
    const noun = TARGET_LABELS[targetType] || 'item'

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-dialog-title"
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-ink/40"
            onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose() }}
        >
            <div className="paper-grain w-full max-w-md bg-paper border border-paper-shade rounded-lg shadow-xl p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <h2 id="report-dialog-title" className="font-display text-lg font-semibold text-ink m-0">
                        Report this {noun}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        aria-label="Close report dialog"
                        className="w-8 h-8 rounded-full hover:bg-paper-shade text-ink/70 hover:text-ink flex items-center justify-center transition-colors disabled:opacity-40"
                    >
                        ×
                    </button>
                </div>

                {targetLabel && (
                    <p className="font-serif italic text-ink/70 text-sm mb-3 break-words">
                        “{targetLabel}”
                    </p>
                )}

                <form onSubmit={handleSubmit}>
                    <label htmlFor="report-reason" className="block font-serif text-ink/80 text-sm mb-1.5">
                        What's the problem? An admin will review.
                    </label>
                    <textarea
                        id="report-reason"
                        ref={textareaRef}
                        value={reason}
                        onChange={(e) => setReason(e.target.value.slice(0, 1000))}
                        rows={4}
                        required
                        disabled={submitting}
                        placeholder={`Describe what's wrong with this ${noun}…`}
                        className="w-full px-3 py-2 border border-paper-shade rounded-md text-base bg-[#fbf6f1] focus:outline-none focus:ring-2 focus:ring-rust/40 focus:border-rust resize-y disabled:opacity-60"
                    />
                    <div className="flex justify-between items-center mt-1">
                        <span className={`text-xs ${remaining < 50 ? 'text-rose-dark' : 'text-ink/50'}`}>
                            {remaining} characters left
                        </span>
                    </div>

                    <div className="flex justify-end gap-2 mt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!reason.trim() || submitting}
                            className="px-4 py-2 bg-rose-dark hover:bg-rose text-paper font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? 'Reporting…' : 'Submit report'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

function FlagIcon() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M4 22V4" />
            <path d="M4 4h11l-2 4 2 4H4" />
        </svg>
    )
}

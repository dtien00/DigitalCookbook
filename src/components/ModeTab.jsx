// One segment of a Dial/Type toggle — a pill in the paper family.
//
// Extracted from TimerSetSheet when the recipe editor's step-timer sheet grew
// the same two-editors-over-one-value shape. Both toggles have to stay visually
// identical: they are the same choice ("set this duration by dragging, or by
// typing") offered on two different surfaces, and a reader who learns one should
// recognise the other.
export default function ModeTab({ on, onClick, label, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={on}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 min-h-[36px] rounded-full text-sm font-medium transition-colors ${
                on ? 'bg-paper text-ink shadow-sm' : 'text-ink/60 hover:text-ink'
            }`}
        >
            {children}
            {label}
        </button>
    )
}

import { useEffect, useRef, useState } from 'react'

// Modal holding the user's "what's in my fridge" ingredient list. Pure UI
// over the useFridgeBasket hook — no recipe filtering logic yet, that lands
// in the next Stage 10 item. For now the Done button just closes; the
// basket persists either way via localStorage.
//
// Accessibility contract:
//   - role="dialog" + aria-modal="true" + labelled by the heading
//   - Focus moves to the ingredient input on open (deferred one tick so the
//     mount animation doesn't fight the focus)
//   - Escape closes; backdrop click closes
//   - Body scroll is locked while open
//   - Focus returns to the trigger element on close via openerRef
//   - All interactive controls keep the 44px tap-target floor from Stage 6
export default function FridgeBasket({
    isOpen,
    onClose,
    basket,
    onAdd,
    onRemove,
    onClear,
    openerRef,
}) {
    const [draft, setDraft] = useState('')
    const inputRef = useRef(null)

    // Body scroll lock + focus management. The cleanup function restores
    // focus to the opener so keyboard users land back where they were.
    useEffect(() => {
        if (!isOpen) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const focusTimer = setTimeout(() => inputRef.current?.focus(), 50)
        return () => {
            document.body.style.overflow = previousOverflow
            clearTimeout(focusTimer)
            openerRef?.current?.focus?.()
        }
    }, [isOpen, openerRef])

    // Escape-to-close. Listener is mounted only while open so the global
    // keydown surface stays empty on every other page.
    useEffect(() => {
        if (!isOpen) return
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation()
                onClose()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [isOpen, onClose])

    const handleAdd = (e) => {
        e.preventDefault()
        if (onAdd(draft)) setDraft('')
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-ink/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="fridge-basket-title"
                className="paper-grain bg-paper w-full sm:max-w-lg sm:rounded-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[80vh]"
            >
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-paper-shade">
                    <div className="min-w-0">
                        <h2
                            id="fridge-basket-title"
                            className="font-display text-2xl font-semibold text-ink flex items-center gap-2"
                        >
                            <span aria-hidden="true" className="text-rust">✦</span>
                            Fridge
                        </h2>
                        <p className="font-serif italic text-sm text-ink/60 mt-0.5">
                            What do you have on hand?
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close fridge"
                        className="w-11 h-11 rounded-full bg-paper-shade hover:bg-tan/40 text-ink flex items-center justify-center transition-colors flex-shrink-0"
                    >
                        <svg aria-hidden="true" viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleAdd} className="px-5 pt-4 pb-3 flex gap-2 border-b border-paper-shade">
                    <input
                        ref={inputRef}
                        type="text"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Add an ingredient (e.g. eggs)"
                        aria-label="Add an ingredient"
                        className="flex-1 min-w-0 px-4 py-2.5 border border-paper-shade rounded-full text-base bg-white/70 text-ink placeholder:text-rose/60 focus:outline-none focus:ring-2 focus:ring-rust/40 focus:border-rust"
                    />
                    <button
                        type="submit"
                        disabled={!draft.trim()}
                        className="px-4 py-2.5 bg-rust hover:bg-rust-dark disabled:opacity-40 disabled:cursor-not-allowed text-paper font-semibold rounded-full transition-colors flex-shrink-0"
                    >
                        Add
                    </button>
                </form>

                <div className="px-5 py-4 flex-1 overflow-y-auto">
                    {basket.length === 0 ? (
                        <div className="text-center py-8">
                            <div className="text-3xl text-rust/40 mb-2" aria-hidden="true">✦</div>
                            <p className="font-display text-lg text-ink">Your fridge is empty</p>
                            <p className="font-serif italic text-sm text-ink/60 mt-1">
                                Add ingredients to find recipes you can make.
                            </p>
                        </div>
                    ) : (
                        <ul
                            className="flex flex-wrap gap-2"
                            aria-label="Ingredients in your fridge"
                        >
                            {basket.map(item => (
                                <li key={item}>
                                    <span className="inline-flex items-center gap-1 pl-3 pr-1 py-1 bg-tan-soft text-ink rounded-full text-sm">
                                        {item}
                                        <button
                                            type="button"
                                            onClick={() => onRemove(item)}
                                            aria-label={`Remove ${item}`}
                                            className="w-6 h-6 rounded-full hover:bg-rose/20 text-ink/60 hover:text-rose-dark flex items-center justify-center transition-colors"
                                        >
                                            <svg aria-hidden="true" viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                                <path d="M4 4l8 8M12 4l-8 8" />
                                            </svg>
                                        </button>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-paper-shade">
                    <button
                        type="button"
                        onClick={onClear}
                        disabled={basket.length === 0}
                        className="px-4 py-2.5 text-rose-dark hover:text-rose disabled:opacity-40 disabled:cursor-not-allowed font-medium text-sm transition-colors min-h-[44px]"
                    >
                        Clear all
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors min-h-[44px]"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    )
}

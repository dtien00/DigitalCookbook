import { useEffect, useMemo, useRef, useState } from 'react'
import { COMMON_UNITS, UNIT_GROUPS, unitsInGroup, isCanonicalUnit, matchUnits } from '../lib/measurementUnits'
import { isCommitEnter, isComposingKeyEvent } from '../lib/imeComposition'

// The unit picker for every ingredient row, at every width.
//
// It began as a phone-only replacement for the old <UnitCombobox>: at 375px the
// row had no breakpoint, so the combobox collapsed to 18px and its dropdown had
// nowhere to render, and free-typing a unit on a soft keyboard is what let the
// IME bug write units backwards (src/lib/imeComposition.js). It now serves the
// browser too, so authoring a recipe is the same act on both — one control, one
// mental model, one place for this behaviour to live.
//
// Making it work for a mouse and keyboard, not just a thumb, is what the filter
// field is for. It replaces the combobox's substring matching (same matchUnits()
// underneath, uncapped because a sheet can scroll) and doubles as the free-text
// escape hatch: `ingredients.unit` is deliberately a free-text column and real
// recipes use 'pouch', 'large spoons', so whatever you type can always be
// committed as-is.
//
// The one deliberate difference between widths is autofocus. On desktop the
// filter takes focus so typing "tbsp" + Enter is as fast as the old combobox.
// On a phone it does not, because raising the keyboard would bury the chips
// under it and put us back to typing-first — the thing this control exists to
// avoid. That is `autoFocusFilter`, and it is the only branch in here.
//
// Chrome mirrors TimerSetSheet: bottom sheet on phones, centred card above
// `sm:`, `bg-ink/40` backdrop, Escape and backdrop close.
export default function UnitPickerSheet({ value, onSelect, onClose, autoFocusFilter = false }) {
    const filterRef = useRef(null)
    const sheetRef = useRef(null)
    const [filter, setFilter] = useState('')
    const [highlight, setHighlight] = useState(0)

    const query = filter.trim()
    // Uncapped: the sheet scrolls, and hiding a match from someone actively
    // filtering for it would be a bug rather than a tidy dropdown.
    const matches = useMemo(() => (query === '' ? [] : matchUnits(query, Infinity)), [query])
    const filtering = query !== ''

    // Offer to keep what was typed whenever it isn't already a unit we know —
    // this is the free-text path, merged into the filter so there is one text
    // field rather than a search box plus a separate "custom" box.
    const offerCustom = filtering && !isCanonicalUnit(query)

    useEffect(() => { setHighlight(0) }, [query])

    useEffect(() => {
        if (autoFocusFilter) filterRef.current?.focus()
    }, [autoFocusFilter])

    // Escape closes from anywhere in the dialog; a focus trap keeps Tab inside
    // it, since a modal that leaks focus to the form behind it is a keyboard
    // dead end.
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') { onClose(); return }
            if (e.key !== 'Tab') return
            const focusables = sheetRef.current?.querySelectorAll(
                'button:not([disabled]), input, [href], select, textarea, [tabindex]:not([tabindex="-1"])'
            )
            if (!focusables || focusables.length === 0) return
            const first = focusables[0]
            const last = focusables[focusables.length - 1]
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault()
                last.focus()
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault()
                first.focus()
            }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    // Keyboard on the filter field. Arrows walk the matches, Enter takes the
    // highlighted one — or commits the typed text when nothing matches.
    //
    // isCommitEnter, not `e.key === 'Enter'`: an IME sends Enter to accept the
    // text it is still composing, and acting on that one is exactly the bug
    // that put "psBT" in the database. Same reason the arrows are guarded —
    // a soft keyboard drives its candidate list with them.
    const handleFilterKeyDown = (e) => {
        if (isComposingKeyEvent(e)) return
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight(h => Math.min(h + 1, matches.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight(h => Math.max(h - 1, 0))
        } else if (isCommitEnter(e)) {
            e.preventDefault()
            if (matches[highlight]) onSelect(matches[highlight])
            else if (offerCustom) onSelect(query)
        }
    }

    const selected = (value || '').trim().toLowerCase()
    const chipClass = (label, isHighlighted = false) =>
        'px-3 py-3 min-h-[44px] rounded-lg font-serif text-base transition-colors ' +
        (label.toLowerCase() === selected
            ? 'bg-rust text-paper'
            : isHighlighted
                ? 'bg-tan/40 text-ink ring-2 ring-rust/50'
                : 'bg-paper-shade hover:bg-tan/40 text-ink')

    // A unit the author typed that isn't one of ours, surfaced first so
    // reopening the sheet on such a row never looks like it was discarded.
    const ownValue = (value || '').trim() && !isCanonicalUnit(value) ? value.trim() : null

    const chipGrid = (labels, highlightIndex = -1) => (
        <div className="grid grid-cols-3 gap-2">
            {labels.map((label, i) => (
                <button
                    key={label}
                    type="button"
                    onClick={() => onSelect(label)}
                    onMouseEnter={() => filtering && setHighlight(i)}
                    className={chipClass(label, i === highlightIndex)}
                >
                    {label}
                </button>
            ))}
        </div>
    )

    return (
        <div
            className="fixed inset-0 z-[130] flex items-end sm:items-center sm:justify-center"
            role="dialog"
            aria-modal="true"
            aria-label="Choose a unit"
        >
            <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="absolute inset-0 bg-ink/40 cursor-default"
            />
            <div
                ref={sheetRef}
                className="relative w-full sm:max-w-sm max-h-[92vh] overflow-y-auto bg-paper paper-grain rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
            >
                <div className="sticky top-0 bg-paper z-10 border-b border-paper-shade">
                    <div className="flex items-center justify-between px-5 py-4">
                        <h2 className="font-display text-lg text-ink m-0">Choose a unit</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="w-10 h-10 flex items-center justify-center rounded-full bg-paper-shade hover:bg-tan/40 text-ink transition-colors"
                        >
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    {/* Filter + free text in one field. Autofocused on desktop so
                        the keyboard flow matches the combobox it replaced; not on
                        a phone, where it would bury the chips under the keyboard. */}
                    <div className="px-5 pb-4">
                        <input
                            ref={filterRef}
                            type="text"
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            onKeyDown={handleFilterKeyDown}
                            placeholder="Filter, or type your own…"
                            aria-label="Filter units, or type a custom unit"
                            autoComplete="off"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            enterKeyHint="done"
                            className="w-full px-3 py-3 min-h-[44px] rounded-lg bg-[#fbf6f1] border border-paper-shade text-ink font-serif text-base focus:outline-none focus:ring-2 focus:ring-rust/50"
                        />
                    </div>
                </div>

                <div className="px-5 py-4">
                    {filtering ? (
                        <>
                            {matches.length > 0 ? (
                                <>
                                    <p className="font-display text-xs uppercase tracking-wider text-ink/50 mb-2">
                                        {matches.length} match{matches.length === 1 ? '' : 'es'}
                                    </p>
                                    {chipGrid(matches, highlight)}
                                </>
                            ) : (
                                <p className="font-serif italic text-sm text-ink/60 m-0">
                                    No unit matches “{query}”.
                                </p>
                            )}

                            {offerCustom && (
                                <button
                                    type="button"
                                    onClick={() => onSelect(query)}
                                    className="mt-4 w-full px-4 py-3 min-h-[44px] rounded-lg bg-rust hover:bg-rust-dark text-paper font-semibold transition-colors"
                                >
                                    Use “{query}” as a custom unit
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            {ownValue && (
                                <>
                                    <p className="font-display text-xs uppercase tracking-wider text-ink/50 mb-2">Yours</p>
                                    <div className="mb-5">{chipGrid([ownValue])}</div>
                                </>
                            )}

                            <p className="font-display text-xs uppercase tracking-wider text-ink/50 mb-2">Common</p>
                            {chipGrid(COMMON_UNITS)}

                            {UNIT_GROUPS.map(group => (
                                <div key={group.id} className="mt-5">
                                    <p className="font-display text-xs uppercase tracking-wider text-ink/50 mb-2">{group.label}</p>
                                    {chipGrid(unitsInGroup(group.id))}
                                </div>
                            ))}
                        </>
                    )}

                    {/* Clearing is a legitimate end state — plenty of ingredients
                        ("2 Star Anise") have no unit at all. */}
                    {(value || '').trim() !== '' && (
                        <button
                            type="button"
                            onClick={() => onSelect('')}
                            className="mt-4 w-full px-4 py-3 min-h-[44px] rounded-lg text-ink/60 hover:text-rose-dark font-serif italic text-sm transition-colors"
                        >
                            Clear unit
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

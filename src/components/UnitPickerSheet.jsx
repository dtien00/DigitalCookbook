import { useEffect, useRef, useState } from 'react'
import { COMMON_UNITS, UNIT_GROUPS, unitsInGroup, isCanonicalUnit } from '../lib/measurementUnits'

// Tap-first unit picker for phone-width ingredient rows.
//
// Why a sheet instead of the desktop combobox: at 375px the row had no
// breakpoint, so the combobox collapsed to 18px and its dropdown had nowhere to
// render — the suggestions were unreachable. Beyond the layout, free-typing a
// unit on a soft keyboard is what let the IME bug write units backwards (see
// src/lib/imeComposition.js). Tapping a chip needs no keyboard at all, so the
// common path can't reproduce that class of bug.
//
// Free text is still reachable, because `ingredients.unit` is deliberately a
// free-text column (refs/DATABASE_DECISIONS.md) and real recipes use 'pouch',
// 'thumb', 'large spoons'. It sits behind a disclosure rather than up front —
// the same shape as TimerSetSheet's "Add a custom time" — so the default path
// is taps and typing is the deliberate exception. Text typed here is committed
// explicitly with a Save button rather than being the field itself, so IME
// damage is visible on screen before it can land in the database.
//
// Chrome (backdrop, rounded top, Escape/backdrop close) mirrors TimerSetSheet
// so the app has one sheet idiom, not two.
export default function UnitPickerSheet({ value, onSelect, onClose }) {
    const customInputRef = useRef(null)
    // A value the author typed themselves (not one of our labels) opens the
    // custom field already expanded and filled — otherwise reopening the sheet
    // on such a row would look like the value had been lost.
    const startsCustom = !!(value || '').trim() && !isCanonicalUnit(value)
    const [showCustom, setShowCustom] = useState(startsCustom)
    const [customValue, setCustomValue] = useState(startsCustom ? value : '')

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    // Focus the custom field when it is revealed by tapping the disclosure, but
    // not when it starts open from an existing custom value — that would pop the
    // keyboard over the chips the author probably came here to tap.
    const revealCustom = () => {
        setShowCustom(true)
        setTimeout(() => customInputRef.current?.focus(), 0)
    }

    const commitCustom = () => {
        const trimmed = customValue.trim()
        if (trimmed === '') return
        onSelect(trimmed)
    }

    const selected = (value || '').trim().toLowerCase()
    const chipClass = (label) =>
        'px-3 py-3 min-h-[44px] rounded-lg font-serif text-base transition-colors ' +
        (label.toLowerCase() === selected
            ? 'bg-rust text-paper'
            : 'bg-paper-shade hover:bg-tan/40 text-ink')

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
            <div className="relative w-full sm:max-w-sm max-h-[92vh] overflow-y-auto bg-paper paper-grain rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-paper-shade sticky top-0 bg-paper z-10">
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

                <div className="px-5 py-4">
                    {/* A unit the author typed that isn't one of ours — shown first
                        so reopening the sheet never looks like it was discarded. */}
                    {startsCustom && (
                        <>
                            <p className="font-display text-xs uppercase tracking-wider text-ink/50 mb-2">Yours</p>
                            <div className="grid grid-cols-3 gap-2 mb-5">
                                <button type="button" onClick={() => onSelect(value)} className={chipClass(value)}>
                                    {value}
                                </button>
                            </div>
                        </>
                    )}

                    <p className="font-display text-xs uppercase tracking-wider text-ink/50 mb-2">Common</p>
                    <div className="grid grid-cols-3 gap-2">
                        {COMMON_UNITS.map(label => (
                            <button key={label} type="button" onClick={() => onSelect(label)} className={chipClass(label)}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {UNIT_GROUPS.map(group => (
                        <div key={group.id} className="mt-5">
                            <p className="font-display text-xs uppercase tracking-wider text-ink/50 mb-2">{group.label}</p>
                            <div className="grid grid-cols-3 gap-2">
                                {unitsInGroup(group.id).map(label => (
                                    <button key={label} type="button" onClick={() => onSelect(label)} className={chipClass(label)}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}

                    {/* Free-text escape hatch. `ingredients.unit` accepts anything
                        and real recipes rely on that; it just isn't the default. */}
                    <div className="mt-6 pt-4 border-t border-paper-shade">
                        {!showCustom ? (
                            <button
                                type="button"
                                onClick={revealCustom}
                                className="w-full px-4 py-3 min-h-[44px] rounded-lg bg-paper-shade hover:bg-tan/40 text-ink font-serif text-base transition-colors"
                            >
                                + Type a custom unit
                            </button>
                        ) : (
                            <>
                                <label htmlFor="unit-custom" className="font-display text-xs uppercase tracking-wider text-ink/50 mb-2 block">
                                    Custom unit
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        id="unit-custom"
                                        ref={customInputRef}
                                        type="text"
                                        value={customValue}
                                        onChange={e => setCustomValue(e.target.value)}
                                        placeholder="e.g. pouch"
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                        spellCheck={false}
                                        enterKeyHint="done"
                                        className="flex-1 min-w-0 px-3 py-3 min-h-[44px] rounded-lg bg-[#fbf6f1] border border-paper-shade text-ink font-serif text-base focus:outline-none focus:ring-2 focus:ring-rust/50"
                                    />
                                    <button
                                        type="button"
                                        onClick={commitCustom}
                                        disabled={customValue.trim() === ''}
                                        className="px-5 py-3 min-h-[44px] rounded-lg bg-rust hover:bg-rust-dark text-paper font-semibold transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        Save
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Clearing is a legitimate end state — plenty of ingredients
                        ("2 Star Anise") have no unit at all. */}
                    {(value || '').trim() !== '' && (
                        <button
                            type="button"
                            onClick={() => onSelect('')}
                            className="mt-3 w-full px-4 py-3 min-h-[44px] rounded-lg text-ink/60 hover:text-rose-dark font-serif italic text-sm transition-colors"
                        >
                            Clear unit
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

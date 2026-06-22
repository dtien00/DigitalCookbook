import { useId, useMemo, useRef, useState } from 'react'
import { matchUnits } from '../lib/measurementUnits'

// Filtered unit picker for the CreateRecipe ingredient rows. Owns its own
// open / highlight / filter state; the parent only sees value changes and a
// single onCommit signal.
//
// Keyboard contract (the half of the row's Enter/Tab story that lives here):
//   ↑ / ↓     move the highlight through the substring matches
//   Enter     with a highlighted option -> select it and STOP (no row commit,
//             so a second Enter then commits); with no highlight -> onCommit()
//             so the parent can add/advance a row
//   Escape    close the list, keep the typed text
//   Tab       native focus move; we just close the list
// Free text is always allowed — the input is the source of truth, the list is
// only assistance.
export default function UnitCombobox({ value, onChange, onCommit, inputRef, placeholder }) {
    const [open, setOpen] = useState(false)
    const [highlight, setHighlight] = useState(-1)
    const listId = useId()
    const blurTimer = useRef(null)

    const suggestions = useMemo(() => matchUnits(value), [value])

    const selectOption = (label) => {
        onChange(label)
        setOpen(false)
        setHighlight(-1)
    }

    const handleChange = (e) => {
        onChange(e.target.value)
        setOpen(true)
        setHighlight(-1)
    }

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (!open) { setOpen(true); return }
            setHighlight(h => Math.min(h + 1, suggestions.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight(h => Math.max(h - 1, 0))
        } else if (e.key === 'Enter') {
            // Always block the implicit form submit on Enter inside the row.
            e.preventDefault()
            if (open && highlight >= 0 && suggestions[highlight]) {
                selectOption(suggestions[highlight])
            } else {
                setOpen(false)
                onCommit?.()
            }
        } else if (e.key === 'Escape') {
            if (open) {
                e.preventDefault()
                setOpen(false)
                setHighlight(-1)
            }
        } else if (e.key === 'Tab') {
            setOpen(false)
        }
    }

    const handleBlur = () => {
        // Delay so an option's onMouseDown (which also preventDefaults to keep
        // focus) can fire before the list unmounts.
        blurTimer.current = setTimeout(() => setOpen(false), 120)
    }

    const handleFocus = () => {
        if (blurTimer.current) clearTimeout(blurTimer.current)
        setOpen(true)
    }

    return (
        <div className="unit-combobox">
            <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={open && suggestions.length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={highlight >= 0 ? `${listId}-opt-${highlight}` : undefined}
                autoComplete="off"
                placeholder={placeholder}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
            />
            {open && suggestions.length > 0 && (
                <ul className="unit-suggestions" role="listbox" id={listId}>
                    {suggestions.map((label, i) => (
                        <li
                            key={label}
                            id={`${listId}-opt-${i}`}
                            role="option"
                            aria-selected={i === highlight}
                            className={`unit-suggestion${i === highlight ? ' is-highlighted' : ''}`}
                            onMouseDown={(e) => {
                                // Keep focus on the input so blur doesn't close
                                // the list before the click is handled.
                                e.preventDefault()
                                selectOption(label)
                            }}
                            onMouseEnter={() => setHighlight(i)}
                        >
                            {label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

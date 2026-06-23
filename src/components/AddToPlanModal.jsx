import { useState, useEffect, useMemo } from 'react'
import { toISODate, startOfWeek, addDays } from '../lib/week'

const SLOTS = [
    { key: 'breakfast', label: 'Breakfast' },
    { key: 'lunch', label: 'Lunch' },
    { key: 'dinner', label: 'Dinner' },
]
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Launched from a recipe card's "+ Add to plan" button (home grid). The
// recipe is known; the user picks a day (within a navigable week) and a meal,
// then the parent upserts into meal_plans. A lightweight inverse of /plan's
// cell picker — there you pick the recipe for a known cell, here the cell for
// a known recipe.
export default function AddToPlanModal({ recipe, onClose, onAdd }) {
    const todayISO = toISODate(new Date())
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
    const [selectedDate, setSelectedDate] = useState(todayISO)
    const [selectedSlot, setSelectedSlot] = useState('dinner')
    const [submitting, setSubmitting] = useState(false)

    const days = useMemo(
        () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
        [weekStart]
    )

    // Keep a valid day selected when navigating weeks: if the current
    // selection falls outside the visible week, snap to that week's Monday.
    useEffect(() => {
        const isos = days.map(toISODate)
        if (!isos.includes(selectedDate)) setSelectedDate(isos[0])
    }, [days, selectedDate])

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    const monthDay = (d, opts) => d.toLocaleDateString(undefined, opts)
    const sameMonth = days[0].getMonth() === days[6].getMonth()
    const weekLabel = `${monthDay(days[0], { month: 'short', day: 'numeric' })} – ${monthDay(days[6], sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`

    const handleAdd = async () => {
        setSubmitting(true)
        await onAdd(selectedDate, selectedSlot)
        // Parent unmounts the modal on completion; no state reset needed.
    }

    return (
        <div
            className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Add recipe to meal plan"
        >
            <div
                onClick={e => e.stopPropagation()}
                className="bg-paper border border-paper-shade rounded-lg shadow-lg w-full max-w-md"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-paper-shade gap-3">
                    <div className="min-w-0">
                        <h2 className="font-display text-lg text-ink">Add to plan</h2>
                        <p className="text-sm text-rose truncate">{recipe.title}</p>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="w-8 h-8 rounded-full bg-paper-shade hover:bg-tan/40 text-ink flex items-center justify-center transition-colors flex-shrink-0"
                    >
                        <svg aria-hidden="true" viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                    </button>
                </div>

                <div className="p-5">
                    {/* Week navigator */}
                    <div className="flex items-center justify-between mb-3">
                        <button onClick={() => setWeekStart(w => addDays(w, -7))} aria-label="Previous week" className="w-9 h-9 rounded-full bg-paper-shade hover:bg-tan/40 text-ink flex items-center justify-center transition-colors">
                            <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 stroke-ink fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        </button>
                        <span className="font-display text-ink">{weekLabel}</span>
                        <button onClick={() => setWeekStart(w => addDays(w, 7))} aria-label="Next week" className="w-9 h-9 rounded-full bg-paper-shade hover:bg-tan/40 text-ink flex items-center justify-center transition-colors">
                            <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 stroke-ink fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                    </div>

                    {/* Day picker */}
                    <div className="grid grid-cols-7 gap-1 mb-4">
                        {days.map((d, i) => {
                            const iso = toISODate(d)
                            const isSel = iso === selectedDate
                            const isToday = iso === todayISO
                            return (
                                <button
                                    key={iso}
                                    onClick={() => setSelectedDate(iso)}
                                    aria-pressed={isSel}
                                    className={`rounded-md py-2 text-xs transition-colors ${isSel ? 'bg-rust text-paper' : isToday ? 'bg-tan-soft text-ink hover:bg-tan/40' : 'bg-paper-shade text-ink hover:bg-tan/40'}`}
                                >
                                    <div className="font-semibold">{DOW[i]}</div>
                                    <div>{d.getDate()}</div>
                                </button>
                            )
                        })}
                    </div>

                    {/* Meal picker */}
                    <div className="flex gap-2 mb-5">
                        {SLOTS.map(s => (
                            <button
                                key={s.key}
                                onClick={() => setSelectedSlot(s.key)}
                                aria-pressed={selectedSlot === s.key}
                                className={`flex-1 py-2 text-sm rounded-md transition-colors ${selectedSlot === s.key ? 'bg-rust text-paper' : 'bg-paper-shade text-ink hover:bg-tan/40'}`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex justify-end gap-2">
                        <button onClick={onClose} className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors">Cancel</button>
                        <button onClick={handleAdd} disabled={submitting} className="px-4 py-2 bg-rust hover:bg-rust-dark text-paper font-semibold rounded-md transition-colors disabled:opacity-50">
                            {submitting ? 'Adding…' : 'Add to plan'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

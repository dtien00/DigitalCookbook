// Pure week-grid date helpers shared by the meal planner (/plan) and the
// "Add to plan" modal launched from recipe cards. No React, all local-time.

// Local-time YYYY-MM-DD. Deliberately NOT toISOString(), which converts to
// UTC and can shift the date across midnight depending on timezone — that
// would file a Monday-evening plan under Tuesday.
export function toISODate(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

// Monday of the week containing `d` (local midnight). getDay() is
// 0=Sun..6=Sat; shift so Monday is the anchor.
export function startOfWeek(d) {
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const dow = (date.getDay() + 6) % 7
    date.setDate(date.getDate() - dow)
    return date
}

export function addDays(d, n) {
    const date = new Date(d)
    date.setDate(date.getDate() + n)
    return date
}

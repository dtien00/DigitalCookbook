import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Header bell + dropdown for in-app notifications (Stage 11 item 2).
// Renders only for signed-in users (parent gates on `session`). The
// unread-count badge appears in the bell's top-right corner; clicking
// the bell opens a panel listing the latest 20 notifications, newest
// first. Clicking a notification marks it read and navigates to the
// underlying recipe.
//
// Outside-click + Escape close the dropdown — same pattern as the
// Profile dropdown in App.jsx so the two feel related.
//
// Accessibility:
//   - aria-haspopup="menu", aria-expanded toggles
//   - aria-label includes the unread count for the screen reader
//   - Each notification row is a button (not a link) so the
//     mark-read-and-navigate happens through one onClick handler;
//     a plain <Link> would navigate before the markRead promise resolved.
export default function NotificationsBell({ notifications, unreadCount, markRead, markAllRead }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)
    const navigate = useNavigate()

    useEffect(() => {
        if (!open) return
        const onPointer = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('pointerdown', onPointer)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('pointerdown', onPointer)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    const handleClick = (n) => {
        markRead(n.id)
        setOpen(false)
        if (n.recipe_id) navigate(`/recipe/${n.recipe_id}`)
    }

    const ariaLabel = unreadCount > 0
        ? `Notifications (${unreadCount} unread)`
        : 'Notifications'

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={ariaLabel}
                className="relative w-11 h-11 flex items-center justify-center rounded-full bg-paper-shade hover:bg-tan/40 text-ink transition-colors"
            >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10 21a2 2 0 0 0 4 0" />
                </svg>
                {unreadCount > 0 && (
                    <span
                        aria-hidden="true"
                        className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-rust text-paper text-xs font-semibold flex items-center justify-center"
                    >
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div
                    role="menu"
                    onPointerDown={e => e.stopPropagation()}
                    className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-paper-shade rounded-md shadow-md overflow-hidden z-50"
                >
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-paper-shade">
                        <h3 className="font-display text-sm font-semibold text-ink m-0">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                type="button"
                                onClick={markAllRead}
                                className="text-xs text-rust hover:text-rust-dark underline underline-offset-2 transition-colors"
                            >
                                Mark all read
                            </button>
                        )}
                    </div>

                    {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                            <p className="text-xl text-tan mb-2">✦</p>
                            <p className="font-display italic text-ink/60 text-sm">No notifications yet.</p>
                        </div>
                    ) : (
                        <ul className="max-h-96 overflow-y-auto">
                            {notifications.map(n => (
                                <li key={n.id}>
                                    <button
                                        type="button"
                                        onClick={() => handleClick(n)}
                                        className={`w-full text-left px-4 py-3 hover:bg-paper-shade transition-colors flex flex-col gap-0.5 border-b border-paper-shade/50 last:border-b-0 ${n.read_at ? '' : 'bg-tan-soft/30'}`}
                                    >
                                        <span className="text-sm text-ink">
                                            <span className="font-semibold">{actorName(n.actor)}</span>
                                            {' posted a new recipe: '}
                                            <span className="font-serif italic">{n.recipe?.title || '(removed)'}</span>
                                        </span>
                                        <span className="text-xs text-ink/50 font-serif">{formatRelativeTime(n.created_at)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    )
}

function actorName(actor) {
    if (!actor) return 'Someone'
    return actor.username?.trim() || actor.full_name?.trim() || 'Someone'
}

// Compact relative time. Same shape as Comments uses, kept local to
// avoid cross-component coupling — if a third caller wants this format,
// promote to a shared helper.
function formatRelativeTime(iso) {
    if (!iso) return ''
    const then = new Date(iso).getTime()
    const diff = Date.now() - then
    const s = Math.round(diff / 1000)
    if (s < 60) return 'just now'
    const m = Math.round(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.round(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.round(h / 24)
    if (d < 7) return `${d}d ago`
    const w = Math.round(d / 7)
    if (w < 5) return `${w}w ago`
    return new Date(iso).toLocaleDateString()
}

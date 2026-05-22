import { useState } from 'react'
import toast from 'react-hot-toast'
import { useComments } from '../hooks/useComments'
import { SkeletonComment } from './Skeleton'

// Comment thread for a recipe. Renders below the steps section in
// RecipeDetail. Three responsibilities:
//
//   1. Show the list of existing comments (newest first), each with the
//      author's avatar/initials, username, relative timestamp, content,
//      and a Delete control on the user's own comments.
//   2. Provide an Add-comment form for signed-in users.
//   3. For anonymous viewers, show a Sign In CTA in place of the form —
//      clicking it (or pressing submit anyway) invokes onRequireAuth so
//      the parent can open the Auth overlay.
//
// Props:
//   recipeId         — the recipe whose comments to load
//   userId           — current user's id, or null for anonymous viewers
//   onRequireAuth()  — invoked when an anonymous user attempts to comment

export default function Comments({ recipeId, userId, isAdmin = false, onRequireAuth }) {
    const { comments, addComment, deleteComment, loading } = useComments(recipeId, userId, isAdmin)
    const [draft, setDraft] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!userId) {
            onRequireAuth?.()
            return
        }
        if (!draft.trim()) return

        setSubmitting(true)
        try {
            await addComment(draft)
            setDraft('')
        } catch (error) {
            toast.error('Could not post comment: ' + error.message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <section className="mt-8">
            <h3 className="font-display text-xl text-ink mb-4">
                Comments
                {comments.length > 0 && (
                    <span className="text-ink/60 font-normal ml-2">({comments.length})</span>
                )}
            </h3>

            {/* Add-comment form (signed-in) OR Sign In CTA (anonymous) */}
            {userId ? (
                <form onSubmit={handleSubmit} className="mb-6">
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Share your thoughts..."
                        rows={3}
                        className="w-full px-4 py-3 border border-paper-shade rounded-lg text-base bg-[#fbf6f1] focus:outline-none focus:ring-2 focus:ring-rust/40 focus:border-rust resize-y"
                        disabled={submitting}
                    />
                    <div className="flex justify-end mt-2">
                        <button
                            type="submit"
                            disabled={!draft.trim() || submitting}
                            className="px-5 py-2 bg-rust hover:bg-rust-dark text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? 'Posting...' : 'Post Comment'}
                        </button>
                    </div>
                </form>
            ) : (
                <div className="mb-6 p-4 bg-paper-shade border border-paper-shade rounded-lg flex flex-wrap justify-between items-center gap-3">
                    <p className="text-ink">Sign in to join the conversation.</p>
                    <button
                        onClick={() => onRequireAuth?.()}
                        className="px-5 py-2 bg-rust hover:bg-rust-dark text-white font-semibold rounded-md transition-colors"
                    >
                        Sign In
                    </button>
                </div>
            )}

            {/* Comment list */}
            {loading ? (
                <ul className="space-y-4" role="status" aria-label="Loading comments">
                    <SkeletonComment />
                    <SkeletonComment />
                </ul>
            ) : comments.length === 0 ? (
                <p className="font-display italic text-rose">Be the first to comment.</p>
            ) : (
                <ul className="space-y-4">
                    {comments.map(c => {
                        const isOwn = c.user_id === userId
                        return (
                            <CommentItem
                                key={c.id}
                                comment={c}
                                isOwn={isOwn}
                                canDelete={isOwn || isAdmin}
                                deleteLabel={isAdmin && !isOwn ? 'Delete (admin)' : 'Delete'}
                                onDelete={() => deleteComment(c.id)}
                            />
                        )
                    })}
                </ul>
            )}
        </section>
    )
}

// Single comment row: avatar + username + relative time + content + delete
// (visible to the comment's owner, or to admins as a moderation override).
function CommentItem({ comment, isOwn, canDelete = isOwn, deleteLabel = 'Delete', onDelete }) {
    const username = comment.profiles?.username || 'Unknown user'
    const avatarUrl = comment.profiles?.avatar_url
    const initials = username.slice(0, 2).toUpperCase()

    const handleDeleteClick = () => {
        if (window.confirm('Delete this comment?')) onDelete()
    }

    return (
        <li className="flex gap-3">
            {avatarUrl ? (
                <img
                    src={avatarUrl}
                    alt=""
                    loading="lazy"
                    className="w-10 h-10 rounded-full object-cover bg-paper-shade flex-shrink-0"
                />
            ) : (
                <div aria-hidden="true" className="w-10 h-10 rounded-full bg-tan-soft text-ink flex items-center justify-center text-sm font-semibold flex-shrink-0">
                    {initials}
                </div>
            )}

            <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-semibold text-ink">{username}</span>
                    <span className="text-xs text-ink/60">{formatRelativeTime(comment.created_at)}</span>
                </div>
                <p className="mt-1 text-ink whitespace-pre-wrap break-words">{comment.content}</p>
                {canDelete && (
                    <button
                        onClick={handleDeleteClick}
                        className="mt-1 min-h-[44px] flex items-center text-xs text-rose-dark hover:text-rose transition-colors"
                        aria-label={isOwn ? 'Delete this comment' : 'Admin: delete this comment'}
                    >
                        {deleteLabel}
                    </button>
                )}
            </div>
        </li>
    )
}

// Compact relative time: "just now", "Ns/m/h/d/w ago", or an absolute
// date for anything older than ~30 days. Computed at render time (no
// live ticker) — a recipe page is short-lived enough that re-renders
// on parent updates give "good enough" freshness without a setInterval.
function formatRelativeTime(isoString) {
    const then = new Date(isoString).getTime()
    if (Number.isNaN(then)) return ''
    const seconds = Math.round((Date.now() - then) / 1000)

    if (seconds < 10) return 'just now'
    if (seconds < 60) return `${seconds}s ago`

    const minutes = Math.round(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`

    const hours = Math.round(minutes / 60)
    if (hours < 24) return `${hours}h ago`

    const days = Math.round(hours / 24)
    if (days < 7) return `${days}d ago`
    if (days < 30) return `${Math.round(days / 7)}w ago`

    return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

import { useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useComments } from '../hooks/useComments'
import { supabase } from '../lib/supabaseClient'
import { SkeletonComment } from './Skeleton'
import ReportButton from './ReportButton'
import Lightbox from './Lightbox'

// Public URL for a comment-photos object. Synchronous — Supabase Storage's
// public-URL helper just composes the URL, no network. We store the path in
// the DB (not the full URL) so a future bucket rename / CDN swap doesn't
// require a backfill.
const commentPhotoUrl = (path) =>
    path ? supabase.storage.from('comment-photos').getPublicUrl(path).data.publicUrl : null

// 5 MB ceiling — matches the Storage bucket's file-size limit (migration 020).
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

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

export default function Comments({ recipeId, userId, isAdmin = false, onRequireAuth, submitReport }) {
    const {
        comments,
        addComment,
        deleteComment,
        loading,
        commentLikeCount,
        userLikedComment,
        toggleCommentLike,
    } = useComments(recipeId, userId, isAdmin)
    const [draft, setDraft] = useState('')
    // Submit sub-phases drive button label: idle | uploading | posting.
    // Uploading covers the storage round-trip; posting covers the insert.
    const [submitPhase, setSubmitPhase] = useState('idle')
    const submitting = submitPhase !== 'idle'
    const [photoFile, setPhotoFile] = useState(null)
    const [photoPreview, setPhotoPreview] = useState(null)
    const fileInputRef = useRef(null)
    // Lightbox state lifted to Comments so any CommentItem can open one.
    const [lightboxUrl, setLightboxUrl] = useState(null)

    // Sort by (likes desc, created_at desc): comments with likes float to the
    // top in count order; everything at zero stays in newest-first order, which
    // matches the pre-likes default. Stable sort by virtue of the date tiebreak.
    const sortedComments = useMemo(() => {
        return [...comments].sort((a, b) => {
            const diff = commentLikeCount(b.id) - commentLikeCount(a.id)
            if (diff !== 0) return diff
            return new Date(b.created_at) - new Date(a.created_at)
        })
    }, [comments, commentLikeCount])

    const handleToggleLike = (commentId) => {
        if (!userId) {
            onRequireAuth?.()
            return
        }
        toggleCommentLike(commentId)
    }

    const handlePickPhoto = (e) => {
        const file = e.target.files?.[0]
        // Reset the input so picking the same file twice re-fires onChange
        // (matters for the Replace flow).
        if (fileInputRef.current) fileInputRef.current.value = ''
        if (!file) return
        if (!file.type.startsWith('image/')) {
            toast.error('Please pick an image file.')
            return
        }
        if (file.size > MAX_PHOTO_BYTES) {
            toast.error('Photo must be under 5 MB.')
            return
        }
        if (photoPreview) URL.revokeObjectURL(photoPreview)
        setPhotoFile(file)
        setPhotoPreview(URL.createObjectURL(file))
    }

    const clearPhoto = () => {
        if (photoPreview) URL.revokeObjectURL(photoPreview)
        setPhotoFile(null)
        setPhotoPreview(null)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!userId) {
            onRequireAuth?.()
            return
        }
        if (!draft.trim()) return

        try {
            if (photoFile) {
                setSubmitPhase('uploading')
                // resizeImage runs inside addComment before the upload, then
                // the insert follows. We flip to 'posting' optimistically just
                // before awaiting — the visible window between phases is
                // brief but communicates progress.
                const promise = addComment(draft, photoFile)
                // Tiny delay so the 'uploading' label is visible at least one
                // frame even on very fast connections. Then flip to 'posting'
                // for the DB write; the await below covers both.
                setTimeout(() => setSubmitPhase((p) => (p === 'uploading' ? 'posting' : p)), 250)
                await promise
            } else {
                setSubmitPhase('posting')
                await addComment(draft)
            }
            setDraft('')
            clearPhoto()
        } catch (error) {
            toast.error('Could not post comment: ' + error.message)
        } finally {
            setSubmitPhase('idle')
        }
    }

    const submitLabel = submitPhase === 'uploading' ? 'Uploading…'
        : submitPhase === 'posting' ? 'Posting…'
        : 'Post Comment'

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

                    {photoPreview && (
                        <div className="mt-2 relative inline-block">
                            <img
                                src={photoPreview}
                                alt="Selected photo preview"
                                className="w-32 h-32 object-cover rounded-md border border-paper-shade"
                            />
                            <button
                                type="button"
                                onClick={clearPhoto}
                                disabled={submitting}
                                aria-label="Remove selected photo"
                                className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full bg-ink text-paper text-xs hover:bg-ink/80 disabled:opacity-50"
                            >
                                ×
                            </button>
                        </div>
                    )}

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePickPhoto}
                        className="hidden"
                        disabled={submitting}
                    />
                    <div className="flex justify-between items-center mt-2 gap-3 flex-wrap">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={submitting}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-ink hover:text-rust bg-paper-shade hover:bg-tan-soft rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                            </svg>
                            {photoFile ? 'Replace photo' : 'Add photo'}
                        </button>
                        <button
                            type="submit"
                            disabled={!draft.trim() || submitting}
                            className="px-5 py-2 bg-rust hover:bg-rust-dark text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitLabel}
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
                    {sortedComments.map(c => {
                        const isOwn = c.user_id === userId
                        return (
                            <CommentItem
                                key={c.id}
                                comment={c}
                                isOwn={isOwn}
                                canDelete={isOwn || isAdmin}
                                deleteLabel={isAdmin && !isOwn ? 'Delete (admin)' : 'Delete'}
                                onDelete={() => deleteComment(c.id)}
                                canReport={!isOwn && submitReport}
                                userId={userId}
                                onRequireAuth={onRequireAuth}
                                submitReport={submitReport}
                                likeCount={commentLikeCount(c.id)}
                                liked={userLikedComment(c.id)}
                                onToggleLike={() => {if (!isOwn) {handleToggleLike(c.id)}}}
                                onOpenPhoto={setLightboxUrl}
                            />
                        )
                    })}
                </ul>
            )}

            <Lightbox url={lightboxUrl} ariaLabel="Comment photo" onClose={() => setLightboxUrl(null)} />
        </section>
    )
}

// Single comment row: avatar + username + relative time + content + delete
// (visible to the comment's owner, or to admins as a moderation override).
function CommentItem({ comment, isOwn, canDelete = isOwn, deleteLabel = 'Delete', onDelete, canReport, userId, onRequireAuth, submitReport, likeCount = 0, liked = false, onToggleLike, onOpenPhoto }) {
    const username = comment.profiles?.username || 'Unknown user'
    const avatarUrl = comment.profiles?.avatar_url
    const initials = username.slice(0, 2).toUpperCase()
    const photoUrl = commentPhotoUrl(comment.photo_path)

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
                {photoUrl && (
                    <button
                        type="button"
                        onClick={() => onOpenPhoto?.(photoUrl)}
                        aria-label="Expand comment photo"
                        className="mt-2 block rounded-md overflow-hidden border border-paper-shade hover:border-rust transition-colors focus:outline-none focus:ring-2 focus:ring-rust/40"
                    >
                        <img
                            src={photoUrl}
                            alt=""
                            loading="lazy"
                            className="w-40 h-40 object-cover"
                        />
                    </button>
                )}
                <div className="flex items-center gap-3">
                    <CommentLikeButton
                        liked={liked}
                        count={likeCount}
                        onClick={onToggleLike}
                    />
                    {canDelete && (
                        <button
                            onClick={handleDeleteClick}
                            className="mt-1 min-h-[44px] flex items-center text-xs text-rose-dark hover:text-rose transition-colors"
                            aria-label={isOwn ? 'Delete this comment' : 'Admin: delete this comment'}
                        >
                            {deleteLabel}
                        </button>
                    )}
                    {canReport && (
                        <ReportButton
                            variant="text"
                            targetType="comment"
                            targetId={comment.id}
                            targetLabel={comment.content?.slice(0, 80)}
                            userId={userId}
                            onRequireAuth={onRequireAuth}
                            submitReport={submitReport}
                        />
                    )}
                </div>
            </div>
        </li>
    )
}

// Small inline heart pill for comment rows. Visually quieter than the
// recipe-card LikeButton (no shadow / blur — the comment list isn't on a
// hero image, just a paper surface), and sized for the row's controls.
// Renders the count only when > 0 so unliked comments don't broadcast "0".
function CommentLikeButton({ liked, count, onClick }) {
    const label = count === 1 ? '1 like' : `${count} likes`
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={liked ? `Unlike comment, ${label}` : `Like comment, ${label}`}
            aria-pressed={liked}
            className="mt-1 min-h-[44px] inline-flex items-center gap-1 text-xs text-ink/70 hover:text-rose transition-colors"
        >
            <svg
                className={`w-4 h-4 ${liked ? 'fill-rose stroke-rose' : 'fill-none stroke-current'} transition-colors`}
                viewBox="0 0 24 24"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {count > 0 && <span className="tabular-nums">{count}</span>}
        </button>
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

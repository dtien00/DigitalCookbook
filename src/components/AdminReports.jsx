import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAdminReports } from '../hooks/useAdminReports'
import MfaChallengeGate from './MfaChallengeGate'

// Stage 16 item 1 — admin review surface at /admin/reports.
//
// Triple guard:
//   1. Not signed in → Navigate('/')
//   2. Signed in but not admin → Navigate('/')
//   3. Admin without MFA → point to Profile Security tab
//   4. Admin with MFA at AAL1 → inline challenge
//   5. Admin at AAL2 → list
//
// The MFA pattern mirrors the RecipeDetail admin moderation panel — both
// surfaces gate on the same elevated session, so an admin who already
// challenged on /recipe/:id won't see the gate here in the same session.
export default function AdminReports({ session, sessionLoaded, isAdmin, adminLoading, mfa }) {
    // Session is restored async from localStorage on a fresh tab — without
    // the sessionLoaded sentinel, a deep link (full reload) would Navigate
    // to '/' on the first render before the restore finishes. Same shape
    // applies to useAdmin's loading flag: if we render `!isAdmin → Navigate`
    // before the is_admin fetch resolves, every admin reload would bounce.
    if (!sessionLoaded || adminLoading) {
        return (
            <div className="paper-grain min-h-screen flex items-center justify-center">
                <p className="font-display italic text-rose" role="status">Checking access…</p>
            </div>
        )
    }
    if (!session) return <Navigate to="/" replace />
    if (!isAdmin) return <Navigate to="/" replace />

    return (
        <div className="paper-grain min-h-screen">
            <div className="max-w-5xl mx-auto px-5 py-8">
                <Header />
                {!mfa?.hasVerifiedFactor ? (
                    <PromptEnrollMfa />
                ) : !mfa.isAal2 ? (
                    <div className="mt-4 p-4 bg-paper-shade/60 border border-dashed border-rose-dark/40 rounded-md">
                        <MfaChallengeGate
                            factors={mfa.factors}
                            verifyCode={mfa.verifyCode}
                            hint="Verify with your authenticator app to access reports for this session."
                        />
                    </div>
                ) : (
                    <ReportsList />
                )}
            </div>
        </div>
    )
}

function Header() {
    const navigate = useNavigate()
    return (
        <header className="flex items-center justify-between gap-4 flex-wrap mb-6">
            <div>
                <p className="font-display text-xs uppercase tracking-wide text-rose-dark m-0">Admin</p>
                <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink m-0">Reports</h1>
            </div>
            <button
                onClick={() => navigate('/')}
                className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors"
            >
                ← Back to recipes
            </button>
        </header>
    )
}

function PromptEnrollMfa() {
    return (
        <div className="mt-4 p-4 bg-paper-shade/60 border border-dashed border-rose-dark/40 rounded-md">
            <p className="font-serif italic text-ink/80 text-sm m-0">
                Enable two-factor authentication in your{' '}
                <Link to="/profile" className="underline hover:text-ink">profile Security tab</Link>
                {' '}to access the reports queue.
            </p>
        </div>
    )
}

const FILTERS = [
    { key: 'open', label: 'Open' },
    { key: 'reviewing', label: 'Reviewing' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'dismissed', label: 'Dismissed' },
    { key: 'all', label: 'All' },
]

function ReportsList() {
    const [filter, setFilter] = useState('open')
    const { reports, loading, updateStatus } = useAdminReports(true, filter)

    const handleSetStatus = async (reportId, nextStatus) => {
        try {
            await updateStatus(reportId, nextStatus)
            toast.success(`Marked ${nextStatus}`)
        } catch (error) {
            toast.error('Could not update report: ' + error.message)
        }
    }

    return (
        <section>
            <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Filter reports by status">
                {FILTERS.map(f => {
                    const active = filter === f.key
                    return (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            aria-pressed={active}
                            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                                active
                                    ? 'bg-rust text-paper font-semibold'
                                    : 'bg-paper-shade hover:bg-tan/40 text-ink'
                            }`}
                        >
                            {f.label}
                        </button>
                    )
                })}
            </div>

            {loading ? (
                <p className="font-display italic text-rose" role="status">Loading reports…</p>
            ) : reports.length === 0 ? (
                <EmptyState filter={filter} />
            ) : (
                <ul className="space-y-3">
                    {reports.map(r => (
                        <ReportRow key={r.id} report={r} onSetStatus={handleSetStatus} />
                    ))}
                </ul>
            )}
        </section>
    )
}

function EmptyState({ filter }) {
    const copy = filter === 'open'
        ? 'No open reports. Nothing needs your attention right now.'
        : filter === 'all'
            ? 'No reports have been filed yet.'
            : `No reports in “${filter}”.`
    return (
        <div className="text-center py-12">
            <p className="text-2xl text-tan mb-2">✦</p>
            <p className="font-display italic text-rose">{copy}</p>
        </div>
    )
}

function ReportRow({ report, onSetStatus }) {
    const { target } = report
    const reporterName = report.reporter?.username?.trim() || report.reporter?.full_name?.trim() || 'Unknown reporter'
    const filed = formatRelativeTime(report.created_at)

    return (
        <li className="p-4 bg-paper border border-paper-shade rounded-md">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <TargetTypeChip type={report.target_type} />
                    <StatusBadge status={report.status} />
                </div>
                <span className="text-xs text-ink/60">{filed}</span>
            </div>

            <p className="font-serif text-ink whitespace-pre-wrap break-words mb-3">
                {report.reason}
            </p>

            <div className="text-sm text-ink/70 mb-3">
                Filed by{' '}
                <Link
                    to={`/profile/${report.reporter_id}`}
                    className="text-rust hover:text-rust-dark underline underline-offset-2 transition-colors"
                >
                    {reporterName}
                </Link>
            </div>

            <TargetSummary target={target} reportId={report.id} />

            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-paper-shade">
                {report.status !== 'reviewing' && (
                    <button
                        onClick={() => onSetStatus(report.id, 'reviewing')}
                        className="px-3 py-1.5 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-medium rounded-md transition-colors"
                    >
                        Mark reviewing
                    </button>
                )}
                {report.status !== 'resolved' && (
                    <button
                        onClick={() => onSetStatus(report.id, 'resolved')}
                        className="px-3 py-1.5 bg-rust hover:bg-rust-dark text-paper text-sm font-semibold rounded-md transition-colors"
                    >
                        Resolve
                    </button>
                )}
                {report.status !== 'dismissed' && (
                    <button
                        onClick={() => onSetStatus(report.id, 'dismissed')}
                        className="px-3 py-1.5 bg-rose-dark hover:bg-rose text-paper text-sm font-semibold rounded-md transition-colors"
                    >
                        Dismiss
                    </button>
                )}
                {report.status !== 'open' && (
                    <button
                        onClick={() => onSetStatus(report.id, 'open')}
                        className="px-3 py-1.5 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-medium rounded-md transition-colors"
                    >
                        Reopen
                    </button>
                )}
            </div>
        </li>
    )
}

function TargetSummary({ target }) {
    if (!target || target.missing) {
        return <p className="font-serif italic text-ink/50 text-sm">Target no longer exists (deleted).</p>
    }
    if (target.kind === 'recipe') {
        return (
            <div className="text-sm">
                <span className="text-ink/60">Recipe: </span>
                <Link
                    to={`/recipe/${target.id}`}
                    className="text-rust hover:text-rust-dark underline underline-offset-2 transition-colors break-words"
                >
                    {target.title || 'Untitled recipe'}
                </Link>
                {target.is_public === false && (
                    <span className="ml-2 text-xs bg-ink/70 text-paper rounded-full px-2 py-0.5">Private</span>
                )}
            </div>
        )
    }
    if (target.kind === 'profile') {
        const name = target.username?.trim() || target.full_name?.trim() || 'Anonymous chef'
        return (
            <div className="text-sm">
                <span className="text-ink/60">Author: </span>
                <Link
                    to={`/profile/${target.id}`}
                    className="text-rust hover:text-rust-dark underline underline-offset-2 transition-colors"
                >
                    {name}
                </Link>
            </div>
        )
    }
    if (target.kind === 'comment') {
        return (
            <div className="text-sm">
                <span className="text-ink/60">Comment on recipe: </span>
                <Link
                    to={`/recipe/${target.recipe_id}`}
                    className="text-rust hover:text-rust-dark underline underline-offset-2 transition-colors"
                >
                    open recipe →
                </Link>
                {target.content && (
                    <blockquote className="mt-1.5 pl-3 border-l-2 border-paper-shade italic text-ink/70 break-words">
                        “{target.content.slice(0, 240)}{target.content.length > 240 ? '…' : ''}”
                    </blockquote>
                )}
            </div>
        )
    }
    return null
}

const TARGET_TYPE_LABEL = {
    comment: 'Comment',
    recipe: 'Recipe',
    profile: 'Author',
}

function TargetTypeChip({ type }) {
    return (
        <span className="inline-flex items-center px-2 py-0.5 bg-tan-soft text-ink text-xs font-medium rounded-full uppercase tracking-wide">
            {TARGET_TYPE_LABEL[type] || type}
        </span>
    )
}

const STATUS_STYLE = {
    open: 'bg-rose-dark text-paper',
    reviewing: 'bg-tan-soft text-ink',
    resolved: 'bg-rust text-paper',
    dismissed: 'bg-paper-shade text-ink/70',
}

function StatusBadge({ status }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full uppercase tracking-wide ${STATUS_STYLE[status] || 'bg-paper-shade text-ink'}`}>
            {status}
        </span>
    )
}

function formatRelativeTime(isoString) {
    const then = new Date(isoString).getTime()
    if (Number.isNaN(then)) return ''
    const seconds = Math.round((Date.now() - then) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.round(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(isoString).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// Non-production environment indicator. Renders a thin sticky strip at the
// top of the viewport whenever VITE_ENV_LABEL is set — typically scoped to
// Vercel Preview deployments via the dashboard, so Production stays unset
// and renders nothing. z-[60] sits above the Auth overlay (z-50) so the
// warning remains visible during sign-in — the moment the test/prod mistake
// would actually happen.
export default function EnvBanner() {
    const label = import.meta.env.VITE_ENV_LABEL
    if (!label) return null
    return (
        <div
            role="status"
            aria-label={`${label} environment — not production`}
            className="no-print fixed top-0 inset-x-0 z-[60] bg-rust-dark text-paper text-xs font-semibold tracking-wide text-center py-1 shadow-sm"
        >
            {label.toUpperCase()} ENVIRONMENT · use seeded test accounts only
        </div>
    )
}

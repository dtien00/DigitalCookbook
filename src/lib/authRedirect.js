// Resolves the `redirectTo` URL handed to Supabase auth flows (OAuth, magic
// link, password reset). Two reasons this exists instead of inlining
// `window.location.origin` at every call site:
//
//   1. Supabase's Auth → URL Configuration only honors *allowlisted* origins.
//      `window.location.origin` works on localhost and Production but fails
//      silently on Preview deployments (each *.vercel.app URL is a fresh
//      origin). `VITE_SITE_URL`, set per-env in Vercel, lets us pin the
//      redirect back to the canonical origin regardless of which Preview the
//      user started from — matching what we already allowlisted in Supabase.
//
//   2. The user's underlying route matters. OAuth is invoked from an Auth
//      overlay layered over `/recipe/:id` (Stage 8); landing back at `/`
//      drops their context. Defaulting to the current pathname preserves it.
//
// Pass an explicit `path` only when a flow needs a fixed landing page
// (password reset → a future `/auth/update-password`, magic link → `/`).
export function getAuthRedirectURL(path) {
    const base = import.meta.env.VITE_SITE_URL || window.location.origin
    const target = path ?? window.location.pathname
    return base.replace(/\/$/, '') + (target.startsWith('/') ? target : '/' + target)
}

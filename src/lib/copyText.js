// Shared clipboard helper. Modern async Clipboard API first; falls back to a
// hidden textarea + execCommand when the page is not a secure context (e.g.,
// LAN-IP dev access at http://192.168.x.x:5175 — Stage 6's `server: { host:
// true }` makes this path reachable) or when the async API throws for any
// other reason. The fallback path requires sync execution inside the user
// gesture, so it runs as a regular (non-await) branch.
//
// Extracted from Stage 18's ExportIngredientsButton so the Stage N+2a shopping
// list page can reuse the exact same copy behaviour.
export async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text)
            return
        } catch {
            // fall through to legacy path
        }
    }
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.top = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    try {
        const ok = document.execCommand('copy')
        if (!ok) throw new Error('Clipboard write rejected')
    } finally {
        document.body.removeChild(ta)
    }
}

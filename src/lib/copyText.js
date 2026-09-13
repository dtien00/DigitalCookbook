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

// Escape the five characters that can break out of HTML text/attribute
// context. Ingredient names and notes are user-authored free text, so they
// reach the text/html flavour below unsanitised otherwise.
export function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

// Copy BOTH flavours: `text/html` for rich targets (mail clients, Docs, Slack,
// Notion) and `text/plain` for everything else. A rich target renders the HTML
// — so a URL can arrive as a titled hyperlink instead of a wall of base64 —
// while a plain target (Notepad, SMS, the browser address bar) still receives
// exactly `plain`, unchanged.
//
// Degrades in two steps rather than failing: browsers without `ClipboardItem`
// or `clipboard.write` (and any insecure context) fall through to `copyText`,
// which keeps its own execCommand fallback. So the plain-text behaviour is
// never worse than before this existed — the rich flavour is purely additive.
export async function copyRich(html, plain) {
    if (
        window.isSecureContext &&
        navigator.clipboard &&
        typeof navigator.clipboard.write === 'function' &&
        typeof ClipboardItem !== 'undefined'
    ) {
        try {
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([plain], { type: 'text/plain' }),
                }),
            ])
            return
        } catch {
            // fall through — plain-text copy is better than no copy
        }
    }
    await copyText(plain)
}

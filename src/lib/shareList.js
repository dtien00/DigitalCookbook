// Stage N+2a (share) — pure, React-free encode/decode for putting a shopping
// list into a shareable URL and reading it back out.
//
// The list is localStorage-only (no server, no auth — see useShoppingList), so a
// shared link has to *carry* the data itself. We serialise the items into a
// compact payload and stash it in the URL **hash fragment** (`#list=<encoded>`),
// NOT a query param: fragments are never sent to servers, referrers, or the
// OG-unfurl middleware, so freeform ingredient notes stay off access logs.
//
// Transport shape (short keys to keep the URL small):
//   { v: 1, i: [ { n, u?, q?, o? } ] }
//     v = format version (bump + branch in decode when the shape changes)
//     n = name (required)   u = unit   q = quantity (number)   o = notes
//
// Zero-dep by design (base64url of minified JSON). Lists at this project's scale
// are short, so plain base64url fits comfortably under MAX_SHARE_PAYLOAD. If real
// lists start overflowing, swap the two base64url helpers for lz-string's
// compressToEncodedURIComponent / decompressFromEncodedURIComponent — the wire
// shape and the rest of this module don't change.

export const SHARE_VERSION = 1

// Conservative ceiling on the encoded payload length. The oldest browsers cap
// URLs near ~2048 chars; the full link adds ~50 for origin + `/shopping-list#list=`.
// Past this the caller falls back to copy-as-text instead of a broken link.
export const MAX_SHARE_PAYLOAD = 2000

// --- UTF-8-safe base64url (ingredient names / notes can be non-ASCII) ---

function toBase64Url(str) {
    const bytes = new TextEncoder().encode(str)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s) {
    let b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder().decode(bytes)
}

// Project a shopping item down to the wire shape. Only `name` is required; empty
// optional fields are omitted so they don't cost URL length. Returns null when
// there's no usable name (the row is dropped from the share).
function toWire(item) {
    if (!item || typeof item !== 'object') return null
    const n = typeof item.name === 'string' ? item.name.trim() : ''
    if (!n) return null
    const w = { n }
    if (item.unit != null && String(item.unit).trim() !== '') w.u = String(item.unit).trim()
    if (typeof item.quantity === 'number' && !Number.isNaN(item.quantity)) w.q = item.quantity
    if (item.notes != null && String(item.notes).trim() !== '') w.o = String(item.notes).trim()
    return w
}

// Reverse of toWire — back to the clean { name, unit, quantity, notes } the
// shopping-list core expects (nulls for absent fields). Null when unusable.
function fromWire(w) {
    if (!w || typeof w !== 'object') return null
    const name = typeof w.n === 'string' ? w.n.trim() : ''
    if (!name) return null
    return {
        name,
        unit: w.u != null && String(w.u).trim() !== '' ? String(w.u).trim() : null,
        quantity: typeof w.q === 'number' && !Number.isNaN(w.q) ? w.q : null,
        notes: w.o != null && String(w.o).trim() !== '' ? String(w.o).trim() : null,
    }
}

// Encode a list of shopping items into the base64url payload that goes after
// `#list=`. Drops rows with no name; never throws for normal input.
export function encodeList(items) {
    const wire = (Array.isArray(items) ? items : [])
        .map(toWire)
        .filter(Boolean)
    return toBase64Url(JSON.stringify({ v: SHARE_VERSION, i: wire }))
}

// Decode a payload back into clean items.
//   - returns Item[]  on success (may be [] — a valid but empty list)
//   - returns null    on ANY failure: not a string, bad base64, bad JSON,
//                      wrong/unknown version, or a non-array item list
// The null-vs-[] split lets the caller tell "chat app truncated the link"
// (null → warn the user) apart from "valid empty list" ([] → quietly no-op).
export function decodeList(encoded) {
    if (typeof encoded !== 'string' || encoded === '') return null
    let json
    try { json = fromBase64Url(encoded) } catch { return null }
    let parsed
    try { parsed = JSON.parse(json) } catch { return null }
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.v !== SHARE_VERSION) return null
    if (!Array.isArray(parsed.i)) return null
    return parsed.i.map(fromWire).filter(Boolean)
}

// Stable short hash of an encoded payload (djb2 → base36). Used to build a
// synthetic recipeId (`shared:<hash>`) for the import so re-opening the SAME link
// replaces its prior contribution via addRecipe's replace-on-recipeId semantics
// instead of summing quantities a second time. Identical payload → identical id.
export function payloadHash(encoded) {
    const s = typeof encoded === 'string' ? encoded : ''
    let h = 5381
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) | 0
    }
    return (h >>> 0).toString(36)
}

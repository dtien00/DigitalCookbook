// Parse a user-typed ingredient quantity into the number stored in the
// NUMERIC `quantity` column, and render a stored number back to a friendly
// fraction for edit-mode prefill. Quantities are stored as plain numbers so
// the shopping list can sum the same ingredient across recipes; the fraction
// glyphs are an input/display concern only (scaleQuantity re-derives them for
// the reader). The glyph table mirrors scaleQuantity.js — kept in sync by hand
// since the two files serve opposite directions of the same conversion.
const GLYPH_TO_VALUE = {
    '½': 0.5,
    '⅓': 1 / 3,
    '⅔': 2 / 3,
    '¼': 0.25,
    '¾': 0.75,
    '⅛': 0.125,
    '⅜': 0.375,
    '⅝': 0.625,
    '⅞': 0.875,
}

// Round-trip pair for quantityToDisplay. Two-decimal keys match the rounding
// scaleQuantity uses, so 1/3 (0.33) and 2/3 (0.67) reverse cleanly.
const VALUE_TO_GLYPH = { 0.5: '½', 0.25: '¼', 0.75: '¾', 0.33: '⅓', 0.67: '⅔', 0.13: '⅛', 0.38: '⅜', 0.63: '⅝', 0.88: '⅞' }

// "1 1/2", "1/2", "1.5", "2", "½", "1 ½", "1-1/2" -> number | null.
// Returns null for empty or unparseable input so callers can decide on a
// fallback (CreateRecipe stores `?? 0` to preserve the legacy empty -> 0).
export function parseQuantity(input) {
    if (input == null) return null
    // Already a number (edit-mode value passed straight through).
    if (typeof input === 'number') return Number.isFinite(input) ? input : null

    let str = String(input).trim()
    if (str === '') return null

    // Expand any unicode fraction glyph into its " a/b"-equivalent decimal so
    // the rest of the parser only deals with ASCII. A glyph can be bare ("½")
    // or follow a whole number ("1½" / "1 ½").
    let glyphValue = 0
    for (const [glyph, value] of Object.entries(GLYPH_TO_VALUE)) {
        if (str.includes(glyph)) {
            glyphValue += value
            str = str.replace(glyph, ' ')
        }
    }
    str = str.trim()

    // Only a glyph was supplied (e.g. "½" or "1 ½" where "1" stays in str).
    if (str === '') return glyphValue || null

    // Mixed number: whole part separated from a fraction by a space or hyphen,
    // e.g. "1 1/2" or "1-1/2".
    const mixed = str.match(/^(\d+)[\s-]+(\d+)\s*\/\s*(\d+)$/)
    if (mixed) {
        const [, whole, num, den] = mixed
        const d = Number(den)
        if (d === 0) return null
        return Number(whole) + Number(num) / d + glyphValue
    }

    // Simple fraction "a/b".
    const frac = str.match(/^(\d+)\s*\/\s*(\d+)$/)
    if (frac) {
        const [, num, den] = frac
        const d = Number(den)
        if (d === 0) return null
        return Number(num) / d + glyphValue
    }

    // Plain whole or decimal number.
    const n = Number(str)
    if (Number.isFinite(n)) return n + glyphValue

    return null
}

// Inverse of parseQuantity for prefilling the text field in edit mode:
// 0.5 -> "½", 1.5 -> "1 ½", 2 -> "2". Falls back to the rounded decimal when
// the fractional part has no glyph (e.g. 1.2 -> "1.2"). null/0 -> "".
export function quantityToDisplay(quantity) {
    if (quantity == null || quantity === '') return ''
    const num = Number(quantity)
    if (!Number.isFinite(num) || num === 0) return ''

    const whole = Math.floor(num)
    const decimal = parseFloat((num - whole).toFixed(2))
    if (decimal === 0) return String(whole)

    const glyph = VALUE_TO_GLYPH[decimal]
    if (glyph) return whole === 0 ? glyph : `${whole} ${glyph}`

    // No clean glyph — show the rounded decimal as typed.
    return String(parseFloat(num.toFixed(2)))
}

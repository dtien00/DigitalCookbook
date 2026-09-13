// Scale a numeric ingredient quantity by the current multiplier and render
// common fractions (½ ¼ ¾ ⅓ ⅔ ⅛ ⅜ ⅝ ⅞) so "0.5 cups" reads as "½ cups" after
// scaling. Quantities are stored as NUMERIC in Postgres so the input is always
// a number or null.
//
// The fraction keys are the *2-dp-rounded* decimals, matching the toFixed(2)
// below: thirds land on 0.33/0.67 and eighths on 0.13/0.38/0.63/0.88 (0.125
// rounds to 0.13). Mirrors parseQuantity.js's VALUE_TO_GLYPH by hand — the two
// files render opposite directions of the same conversion.
export function scaleQuantity(quantity, multiplier) {
    if (!quantity) return quantity
    const raw = parseFloat((quantity * multiplier).toFixed(2))
    const whole = Math.floor(raw)
    const decimal = parseFloat((raw - whole).toFixed(2))
    if (decimal === 0) return String(whole)
    const FRACS = {
        0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.67: '⅔',
        0.13: '⅛', 0.38: '⅜', 0.63: '⅝', 0.88: '⅞',
    }
    const frac = FRACS[decimal]
    if (frac) return whole === 0 ? frac : `${whole} ${frac}`
    return String(raw)
}

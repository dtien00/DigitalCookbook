// Scale a numeric ingredient quantity by the current multiplier and render
// common fractions (½ ¼ ¾ ⅓ ⅔) so "0.5 cups" reads as "½ cups" after scaling.
// Quantities are stored as NUMERIC in Postgres so the input is always a
// number or null.
export function scaleQuantity(quantity, multiplier) {
    if (!quantity) return quantity
    const raw = parseFloat((quantity * multiplier).toFixed(2))
    const whole = Math.floor(raw)
    const decimal = parseFloat((raw - whole).toFixed(2))
    if (decimal === 0) return String(whole)
    const FRACS = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.67: '⅔' }
    const frac = FRACS[decimal]
    if (frac) return whole === 0 ? frac : `${whole} ${frac}`
    return String(raw)
}

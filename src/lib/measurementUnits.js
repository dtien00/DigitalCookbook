// Canonical cooking measurement units for the CreateRecipe unit autocomplete.
// `label` is the value stored in the (free-text) `ingredients.unit` column;
// `aliases` widen substring matching so typing "tbsp" surfaces "tablespoon".
// Client-side only — the DB never validates against this list, so authors can
// still type anything (the combobox accepts free text).
export const MEASUREMENT_UNITS = [
    // Volume
    { label: 'teaspoon', aliases: ['tsp', 'teaspoons'] },
    { label: 'tablespoon', aliases: ['tbsp', 'tbs', 'tablespoons'] },
    { label: 'cup', aliases: ['cups', 'c'] },
    { label: 'fluid ounce', aliases: ['fl oz', 'floz', 'fluid ounces'] },
    { label: 'pint', aliases: ['pt', 'pints'] },
    { label: 'quart', aliases: ['qt', 'quarts'] },
    { label: 'gallon', aliases: ['gal', 'gallons'] },
    { label: 'milliliter', aliases: ['ml', 'milliliters', 'millilitre'] },
    { label: 'liter', aliases: ['l', 'liters', 'litre'] },
    { label: 'drop', aliases: ['drops'] },
    { label: 'dash', aliases: ['dashes'] },
    { label: 'pinch', aliases: ['pinches'] },
    { label: 'splash', aliases: ['splashes'] },

    // Weight
    { label: 'gram', aliases: ['g', 'grams', 'gr'] },
    { label: 'kilogram', aliases: ['kg', 'kilograms', 'kilo'] },
    { label: 'milligram', aliases: ['mg', 'milligrams'] },
    { label: 'ounce', aliases: ['oz', 'ounces'] },
    { label: 'pound', aliases: ['lb', 'lbs', 'pounds'] },

    // Count / pieces
    { label: 'piece', aliases: ['pieces', 'pcs', 'pc'] },
    { label: 'slice', aliases: ['slices'] },
    { label: 'clove', aliases: ['cloves'] },
    { label: 'can', aliases: ['cans'] },
    { label: 'jar', aliases: ['jars'] },
    { label: 'package', aliases: ['pkg', 'packages', 'pack'] },
    { label: 'stick', aliases: ['sticks'] },
    { label: 'bunch', aliases: ['bunches'] },
    { label: 'head', aliases: ['heads'] },
    { label: 'sprig', aliases: ['sprigs'] },
    { label: 'leaf', aliases: ['leaves'] },
    { label: 'stalk', aliases: ['stalks'] },
    { label: 'ear', aliases: ['ears'] },
    { label: 'fillet', aliases: ['fillets', 'filet'] },
    { label: 'handful', aliases: ['handfuls'] },
    { label: 'scoop', aliases: ['scoops'] },
    { label: 'whole', aliases: [] },
    { label: 'to taste', aliases: [] },
]

export const MAX_SUGGESTIONS = 8

// Return up to MAX_SUGGESTIONS unit labels whose label OR an alias contains the
// (case-insensitive) query as a substring. An empty/whitespace query returns
// the head of the full list so the dropdown can open on focus. Results are
// ordered so labels matching at the start ("cup" before "fluid ounce" for "c")
// surface first.
export function matchUnits(query) {
    const q = (query || '').trim().toLowerCase()
    if (q === '') return MEASUREMENT_UNITS.slice(0, MAX_SUGGESTIONS).map(u => u.label)

    const scored = []
    for (const unit of MEASUREMENT_UNITS) {
        const haystacks = [unit.label, ...unit.aliases]
        let best = Infinity
        for (const h of haystacks) {
            const idx = h.toLowerCase().indexOf(q)
            if (idx !== -1 && idx < best) best = idx
        }
        if (best !== Infinity) scored.push({ label: unit.label, rank: best })
    }
    return scored
        .sort((a, b) => a.rank - b.rank)
        .slice(0, MAX_SUGGESTIONS)
        .map(s => s.label)
}

// Every string the unit field legitimately accepts, lowercased: canonical
// labels plus their aliases. Built once — the list is static.
const KNOWN_UNIT_STRINGS = new Set()
for (const unit of MEASUREMENT_UNITS) {
    KNOWN_UNIT_STRINGS.add(unit.label.toLowerCase())
    for (const alias of unit.aliases) KNOWN_UNIT_STRINGS.add(alias.toLowerCase())
}

// Canonical label for a lowercased unit string ('tbsp' -> 'tablespoon'), or
// null if it isn't one of ours.
function canonicalUnit(lower) {
    for (const unit of MEASUREMENT_UNITS) {
        if (unit.label.toLowerCase() === lower) return unit.label
        if (unit.aliases.some(a => a.toLowerCase() === lower)) return unit.label
    }
    return null
}

// Detect (and name the repair for) a unit that was typed backwards.
//
// A phone IME bug let characters accumulate at offset 0 of the unit field, so
// "TBsp" reached the database as "psBT" — see src/lib/imeComposition.js for the
// mechanism and the fix. This recognises the damage after the fact: a value
// that is NOT a unit we know, but whose reverse IS, can only have been produced
// that way. Returns the canonical label to repair it to, or null to leave it
// alone.
//
// The "not already known" test is what makes this safe to run over every row:
// it means a palindromic unit ('g', 'l', 'c') is never rewritten, and neither
// is legitimate free text like 'pouch' or 'large spoons' — authors may type
// anything into this column and only recognisable reversals get touched.
export function repairReversedUnit(value) {
    const trimmed = (value || '').trim()
    if (trimmed === '') return null

    const lower = trimmed.toLowerCase()
    if (KNOWN_UNIT_STRINGS.has(lower)) return null

    const reversed = [...lower].reverse().join('')
    return canonicalUnit(reversed)
}

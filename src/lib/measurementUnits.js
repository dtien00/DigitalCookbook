// Canonical cooking measurement units for the CreateRecipe unit autocomplete.
// `label` is the value stored in the (free-text) `ingredients.unit` column;
// `aliases` widen substring matching so typing "tbsp" surfaces "tablespoon".
// `group` is what the section comments below used to say in prose — promoted
// to data so the mobile unit sheet can render Volume / Weight / Count sections
// without a second, drifting copy of the same knowledge.
// Client-side only — the DB never validates against this list, so authors can
// still type anything (the combobox accepts free text).
export const MEASUREMENT_UNITS = [
    // Volume
    { group: 'volume', label: 'teaspoon', aliases: ['tsp', 'teaspoons'] },
    { group: 'volume', label: 'tablespoon', aliases: ['tbsp', 'tbs', 'tablespoons'] },
    { group: 'volume', label: 'cup', aliases: ['cups', 'c'] },
    { group: 'volume', label: 'fluid ounce', aliases: ['fl oz', 'floz', 'fluid ounces'] },
    { group: 'volume', label: 'pint', aliases: ['pt', 'pints'] },
    { group: 'volume', label: 'quart', aliases: ['qt', 'quarts'] },
    { group: 'volume', label: 'gallon', aliases: ['gal', 'gallons'] },
    { group: 'volume', label: 'milliliter', aliases: ['ml', 'milliliters', 'millilitre'] },
    { group: 'volume', label: 'liter', aliases: ['l', 'liters', 'litre'] },
    { group: 'volume', label: 'drop', aliases: ['drops'] },
    { group: 'volume', label: 'dash', aliases: ['dashes'] },
    { group: 'volume', label: 'pinch', aliases: ['pinches'] },
    { group: 'volume', label: 'splash', aliases: ['splashes'] },

    // Weight
    { group: 'weight', label: 'gram', aliases: ['g', 'grams', 'gr'] },
    { group: 'weight', label: 'kilogram', aliases: ['kg', 'kilograms', 'kilo'] },
    { group: 'weight', label: 'milligram', aliases: ['mg', 'milligrams'] },
    { group: 'weight', label: 'ounce', aliases: ['oz', 'ounces'] },
    { group: 'weight', label: 'pound', aliases: ['lb', 'lbs', 'pounds'] },

    // Count / pieces
    { group: 'count', label: 'piece', aliases: ['pieces', 'pcs', 'pc'] },
    { group: 'count', label: 'slice', aliases: ['slices'] },
    { group: 'count', label: 'clove', aliases: ['cloves'] },
    { group: 'count', label: 'can', aliases: ['cans'] },
    { group: 'count', label: 'jar', aliases: ['jars'] },
    { group: 'count', label: 'package', aliases: ['pkg', 'packages', 'pack'] },
    { group: 'count', label: 'stick', aliases: ['sticks'] },
    { group: 'count', label: 'bunch', aliases: ['bunches'] },
    { group: 'count', label: 'head', aliases: ['heads'] },
    { group: 'count', label: 'sprig', aliases: ['sprigs'] },
    { group: 'count', label: 'leaf', aliases: ['leaves'] },
    { group: 'count', label: 'stalk', aliases: ['stalks'] },
    { group: 'count', label: 'ear', aliases: ['ears'] },
    { group: 'count', label: 'fillet', aliases: ['fillets', 'filet'] },
    { group: 'count', label: 'handful', aliases: ['handfuls'] },
    { group: 'count', label: 'scoop', aliases: ['scoops'] },
    { group: 'count', label: 'whole', aliases: [] },
    { group: 'count', label: 'to taste', aliases: [] },
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


// ---- mobile unit sheet -----------------------------------------------------

// Section order + display names for the unit picker sheet. Keyed by the `group`
// field above; a unit with an unrecognised group would simply not render, so
// GROUP_ORDER is the single place that decides what the sheet shows.
export const UNIT_GROUPS = [
    { id: 'volume', label: 'Volume' },
    { id: 'weight', label: 'Weight' },
    { id: 'count', label: 'Count' },
]

// The chip grid at the top of the sheet: the units this cookbook actually uses,
// most-used first. Derived from a one-off count over the live `ingredients`
// table (teaspoon 54, tablespoon 37, cup 36, pound/gram 10, clove 7, ounce 6,
// stalk 5, piece 3) rather than guessed, so the first tap is usually the right
// one. Nine fits a 3x3 grid at phone width. Re-derive if the library's shape
// changes; nothing breaks if it drifts, the chips just get less useful.
export const COMMON_UNITS = [
    'teaspoon', 'tablespoon', 'cup',
    'pound', 'gram', 'clove',
    'ounce', 'stalk', 'piece',
]

// Units belonging to `groupId`, in declaration order.
export function unitsInGroup(groupId) {
    return MEASUREMENT_UNITS.filter(u => u.group === groupId).map(u => u.label)
}

// True when `value` is one of our canonical labels — i.e. the sheet can show it
// as a selected chip. Anything else is the author's own free text and gets
// surfaced separately so it is never silently dropped.
export function isCanonicalUnit(value) {
    const lower = (value || '').trim().toLowerCase()
    return MEASUREMENT_UNITS.some(u => u.label.toLowerCase() === lower)
}

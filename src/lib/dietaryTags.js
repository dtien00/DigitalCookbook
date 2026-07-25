// Canonical allergen + dietary vocabularies for Stage N's author-declared
// filter. `value` is the slug stored in the recipes.allergens / recipes.dietary
// TEXT[] columns (migration 025) and in the profiles.* preference columns;
// `label` is the human-facing chip text.
//
// These are a FIXED list, not free text (unlike tags): allergens are
// safety-critical, so a typo can't be allowed to silently spawn a bucket that
// a filter then misses. Every authoring and filtering surface renders from
// this one source, so the slugs stay in lockstep across the app and the DB.

// The "Big 9" US FDA major allergens plus a few high-signal extras (gluten as
// distinct from wheat; pork and alcohol for dietary/religious avoidance).
export const ALLERGENS = [
    { value: 'dairy', label: 'Dairy' },
    { value: 'eggs', label: 'Eggs' },
    { value: 'fish', label: 'Fish' },
    { value: 'shellfish', label: 'Shellfish' },
    { value: 'tree_nuts', label: 'Tree nuts' },
    { value: 'peanuts', label: 'Peanuts' },
    { value: 'wheat', label: 'Wheat' },
    { value: 'soy', label: 'Soy' },
    { value: 'sesame', label: 'Sesame' },
    { value: 'gluten', label: 'Gluten' },
    { value: 'pork', label: 'Pork' },
    { value: 'alcohol', label: 'Alcohol' },
]

// Positive attributes a recipe SATISFIES — filtered with "require all"
// semantics, the opposite direction from allergens' "exclude any".
export const DIETARY = [
    { value: 'vegetarian', label: 'Vegetarian' },
    { value: 'vegan', label: 'Vegan' },
]

const ALLERGEN_LABELS = Object.fromEntries(ALLERGENS.map(a => [a.value, a.label]))
const DIETARY_LABELS = Object.fromEntries(DIETARY.map(d => [d.value, d.label]))

// value -> label lookups for read surfaces (filter chips, safety banner).
// Unknown slugs (e.g. a value retired from the list but still on old rows)
// fall back to the raw slug so nothing renders blank.
export const allergenLabel = (value) => ALLERGEN_LABELS[value] ?? value
export const dietaryLabel = (value) => DIETARY_LABELS[value] ?? value

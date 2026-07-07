// Pure, React-free helpers for Stage 21 ingredient sections — kept here
// (mirroring dragSortCore / shoppingListCore) so the grouping and editor
// row-mapping logic is unit-testable with plain data under vitest's default
// 'node' environment.
//
// The data model: each ingredient row carries a nullable `section` label
// (migration 024). Grouping is derived from contiguous runs of the same
// label — never stored structurally — so a recipe with no sections is just
// one null-section run and renders exactly as before the feature existed.

// Group an ordered ingredient array into contiguous runs of the same section
// label. Returns [{ section: string|null, items, startIndex }], where
// startIndex is the flat index of the run's first item — renderers that also
// drive index-based drag reordering (RecipeDetail) need the flat position of
// every row to keep matching the underlying array.
export function groupIngredients(ingredients) {
    const groups = []
    for (let i = 0; i < ingredients.length; i++) {
        const section = ingredients[i].section ?? null
        const last = groups[groups.length - 1]
        if (last && last.section === section) {
            last.items.push(ingredients[i])
        } else {
            groups.push({ section, items: [ingredients[i]], startIndex: i })
        }
    }
    return groups
}

// True when grouping would change anything visually — at least one ingredient
// carries a label. Lets renderers skip the heading machinery entirely for
// legacy/unsectioned recipes.
export function hasSections(ingredients) {
    return ingredients.some(ing => (ing.section ?? null) !== null)
}

// ---- Editor row mapping (CreateRecipe) -------------------------------------
//
// The editor's state is a heterogeneous row list: ingredient rows as before,
// plus section rows ({ type: 'section', name }). Section rows are never
// persisted — on save each ingredient inherits the nearest section row above
// it, and on edit-load the rows are reconstructed from the contiguous runs.

// Flatten editor rows to ingredient objects with `section` stamped. Blank
// section names are dropped (their ingredients inherit whatever named section
// sat above, mirroring how blank-named ingredients are dropped on save);
// section labels are trimmed. Ingredient filtering (blank names) stays the
// caller's job so this mirrors the existing save pipeline exactly.
export function rowsToIngredients(rows) {
    let current = null
    const out = []
    for (const row of rows) {
        if (row.type === 'section') {
            const name = (row.name || '').trim()
            if (name) current = name
            continue
        }
        const { type: _type, ...ing } = row
        out.push({ ...ing, section: current })
    }
    return out
}

// Reconstruct editor rows from stored ingredients: a section row is inserted
// wherever a new non-null contiguous run starts. Weird data (a null-section
// run after a named one) round-trips as rows without a section marker, which
// on the next save silently normalizes into the section above — acceptable,
// since the editor can't author that shape.
export function ingredientsToRows(ingredients) {
    const rows = []
    let current = null
    for (const ing of ingredients) {
        const section = ing.section ?? null
        if (section !== null && section !== current) {
            rows.push({ type: 'section', name: section })
        }
        current = section
        const { section: _dropped, ...rest } = ing
        rows.push({ type: 'ingredient', ...rest })
    }
    return rows
}

// ---- Viewer drag rule (RecipeDetail) ---------------------------------------

// After an ingredient is dragged to flat index `to`, it adopts the section it
// landed in: the section of the row now above it, or — dropped at the very
// top — the section of the row now below (the old first row). Returns a new
// array; no-op (same reference semantics as input, but always a fresh copy)
// when the section already matches.
export function adoptSectionAt(ingredients, to) {
    const next = [...ingredients]
    const neighbor = to > 0 ? next[to - 1] : next[1]
    const section = neighbor ? (neighbor.section ?? null) : (next[to].section ?? null)
    next[to] = { ...next[to], section }
    return next
}

// Pure, React-free recipe-import parsing for Stage 22 — kept here (mirroring
// ingredientSections / dragSortCore / shoppingListCore) so the format sniffing
// and text heuristics are unit-testable with plain data under vitest's default
// 'node' environment.
//
// One entry point: parseRecipeImport(raw). The paste is sniffed in order —
// schema.org Recipe JSON-LD (bare, in an @graph, or embedded in pasted page
// source), this app's own-export shape (migration 016), then heuristic plain
// text. All three normalize to the same shape the CreateRecipe form consumes:
//
//   { title, description, servings, tags,
//     ingredients: [{ name, quantity, unit, notes, section }],
//     steps: [{ instruction }] }
//
// `quantity` stays a *display string* ("1 ½"), not a number — the form's qty
// inputs hold what the author would type, and parseQuantity converts on save
// exactly as it does for hand-entered rows. Parser mistakes are cheap by
// design: the form is the preview/correction surface, so a mis-split line
// costs one edit, never a bad row.

import { parseQuantity, quantityToDisplay } from './parseQuantity'
import { MEASUREMENT_UNITS } from './measurementUnits'

// Generous but bounded — whole-page view-source pastes (for the embedded
// JSON-LD path) can legitimately run hundreds of KB.
const MAX_INPUT = 500_000

// Exact-word unit lookup (word -> canonical label). Deliberately NOT the
// substring matchUnits() used by the autocomplete — "c" as a substring would
// match half the dictionary; an importer needs whole-token certainty.
const UNIT_LOOKUP = new Map()
for (const u of MEASUREMENT_UNITS) {
    UNIT_LOOKUP.set(u.label.toLowerCase(), u.label)
    for (const a of u.aliases) UNIT_LOOKUP.set(a.toLowerCase(), u.label)
}

const BULLET_RE = /^[-*•▢☐✓✔○◦·–—]+\s+/
const ING_HEADER_RE = /^ingredients?\s*:?\s*$/i
const STEP_HEADER_RE = /^(?:instructions?|directions?|method|steps?|preparation)\s*:?\s*$/i
const SKIP_HEADER_RE = /^(?:notes?|tips?|nutrition(?:\s+facts)?|equipment)\s*:?\s*$/i
const SERVINGS_RE = /(?:serves|servings?|yields?)\s*[:-]?\s*(\d+)/i
const NUMBERED_STEP_RE = /^(\d{1,3})[.)]\s+(.+)$/
const STEP_PREFIX_RE = /^step\s+\d+\s*[:.)-]?\s*/i

// ---- shared text cleanup ----------------------------------------------------

const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', deg: '°',
    frac12: '½', frac13: '⅓', frac23: '⅔', frac14: '¼', frac34: '¾', frac18: '⅛',
}

function decodeEntities(s) {
    return s.replace(/&(#x?[0-9a-f]+|[a-z]+[0-9]*);/gi, (match, body) => {
        if (body[0] === '#') {
            const code = body[1].toLowerCase() === 'x'
                ? parseInt(body.slice(2), 16)
                : parseInt(body.slice(1), 10)
            return Number.isFinite(code) ? String.fromCodePoint(code) : match
        }
        return NAMED_ENTITIES[body.toLowerCase()] ?? match
    })
}

// JSON-LD string fields often carry markup ("<p>Preheat…</p>") and entities.
function cleanText(v) {
    if (v == null) return ''
    return decodeEntities(String(v).replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
}

// recipeYield arrives as 4, "4", "4 servings", or an array of those.
function parseServingsValue(v) {
    if (v == null) return null
    if (Array.isArray(v)) {
        for (const item of v) {
            const n = parseServingsValue(item)
            if (n) return n
        }
        return null
    }
    const m = String(v).match(/\d+/)
    if (!m) return null
    const n = parseInt(m[0], 10)
    return n >= 1 && n <= 999 ? n : null
}

function normalizeTags(values) {
    const out = []
    for (const v of values) {
        const tag = cleanText(v).toLowerCase()
        if (tag && tag.length <= 40 && !out.includes(tag)) out.push(tag)
        if (out.length >= 10) break
    }
    return out
}

// ---- ingredient-line splitting ----------------------------------------------

// Peel a leading quantity ("1 1/2", "½", "1 ½", "2.5") off a line, keeping the
// author's spelling as the display string. Longest candidate first so mixed
// numbers win over their whole part. parseQuantity is the single source of
// truth for what counts as a quantity.
function peelQuantity(str) {
    const tokens = str.split(/\s+/).filter(Boolean)
    for (const take of [2, 1]) {
        if (tokens.length < take) continue
        const cand = tokens.slice(0, take).join(' ')
        if (!/[\d½⅓⅔¼¾⅛⅜⅝⅞]/.test(cand)) continue
        if (parseQuantity(cand) !== null) {
            return { quantity: cand, rest: tokens.slice(take).join(' ') }
        }
    }
    return null
}

// Peel a leading unit word (or two-word unit like "fl oz") and an optional
// following "of" ("2 cups of flour"). Exact match against the canonical list,
// dots stripped ("tbsp." -> "tbsp").
function peelUnit(str) {
    const tokens = str.split(/\s+/).filter(Boolean)
    const norm = (s) => s.toLowerCase().replace(/\./g, '')
    for (const take of [2, 1]) {
        if (tokens.length < take) continue
        const label = UNIT_LOOKUP.get(norm(tokens.slice(0, take).join(' ')))
        if (label) {
            let idx = take
            if (tokens[idx] && tokens[idx].toLowerCase() === 'of') idx++
            return { unit: label, rest: tokens.slice(idx).join(' ') }
        }
    }
    return null
}

// "2 tbsp olive oil (extra-virgin)" -> { name, quantity, unit, notes, section }.
// Also used for JSON-LD recipeIngredient strings (section = null there).
export function parseIngredientLine(line, section = null) {
    let str = cleanText(line).replace(BULLET_RE, '')

    // A short trailing parenthetical is the classic substitution/prep note —
    // exactly what the ingredients.notes column exists for.
    let notes = ''
    const paren = str.match(/\(([^()]{1,60})\)\s*$/)
    if (paren) {
        notes = paren[1].trim()
        str = str.slice(0, paren.index).trim()
    }

    let quantity = ''
    let unit = ''
    const q = peelQuantity(str)
    if (q) {
        quantity = q.quantity
        str = q.rest
        const u = peelUnit(str)
        if (u) {
            unit = u.unit
            str = u.rest
        }
    } else {
        // No quantity, but "pinch of salt" style lines still start with a unit.
        const u = peelUnit(str)
        if (u) {
            unit = u.unit
            str = u.rest
        }
    }

    return { name: str.trim(), quantity, unit, notes, section }
}

// ---- JSON-LD ------------------------------------------------------------------

function isRecipeNode(node) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false
    const t = node['@type']
    return Array.isArray(t) ? t.includes('Recipe') : t === 'Recipe'
}

// Recipes hide in @graph arrays, mainEntity wrappers, or arrays of ld+json
// blocks — a bounded recursive walk finds the first Recipe node anywhere.
function findRecipeNode(json, depth = 0) {
    if (depth > 6 || json == null || typeof json !== 'object') return null
    if (isRecipeNode(json)) return json
    const children = Array.isArray(json) ? json : Object.values(json)
    for (const child of children) {
        const found = findRecipeNode(child, depth + 1)
        if (found) return found
    }
    return null
}

// recipeInstructions: string | HowToStep | HowToSection | ItemList | arrays of
// any of those. Flatten to plain instruction strings; section names are
// dropped (Stage 21 sections are an ingredients concept, not a steps one).
function flattenInstructions(node, out = [], depth = 0) {
    if (depth > 6 || node == null) return out
    if (typeof node === 'string') {
        for (const part of node.split(/\n+/)) {
            const text = cleanText(part)
            if (text) out.push(text)
        }
        return out
    }
    if (Array.isArray(node)) {
        for (const item of node) flattenInstructions(item, out, depth + 1)
        return out
    }
    if (typeof node === 'object') {
        if (node.itemListElement) return flattenInstructions(node.itemListElement, out, depth + 1)
        const text = cleanText(node.text ?? node.name)
        if (text) out.push(text)
    }
    return out
}

function mapJsonLd(node) {
    const ingredientLines = node.recipeIngredient ?? node.ingredients ?? []
    const tagSources = []
    for (const key of ['keywords', 'recipeCategory', 'recipeCuisine']) {
        const v = node[key]
        if (typeof v === 'string') tagSources.push(...v.split(','))
        else if (Array.isArray(v)) tagSources.push(...v.filter(x => typeof x === 'string'))
    }
    return {
        title: cleanText(node.name),
        description: cleanText(node.description),
        servings: parseServingsValue(node.recipeYield),
        tags: normalizeTags(tagSources),
        ingredients: (Array.isArray(ingredientLines) ? ingredientLines : [ingredientLines])
            .map(l => parseIngredientLine(l, null)),
        steps: flattenInstructions(node.recipeInstructions).map(instruction => ({ instruction })),
    }
}

// ---- own-export shape (migration 016) -----------------------------------------

function looksLikeExportRecipe(obj) {
    return obj && typeof obj === 'object' && !Array.isArray(obj)
        && typeof obj.title === 'string' && Array.isArray(obj.ingredients)
}

function mapExportRecipe(obj) {
    const ingredients = [...obj.ingredients]
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map(i => ({
            name: cleanText(i.name),
            quantity: quantityToDisplay(i.quantity),
            unit: typeof i.unit === 'string' ? i.unit : '',
            notes: typeof i.notes === 'string' ? i.notes : '',
            // The export RPC predates migration 024, so `section` is usually
            // absent — ?? null keeps those rows unsectioned, which renders
            // identically to the pre-Stage-21 world.
            section: i.section ?? null,
        }))
    const steps = [...(Array.isArray(obj.steps) ? obj.steps : [])]
        .sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0))
        .map(s => ({ instruction: cleanText(s.instruction) }))
    return {
        title: cleanText(obj.title),
        description: cleanText(obj.description),
        servings: parseServingsValue(obj.servings),
        tags: normalizeTags(Array.isArray(obj.tags) ? obj.tags : []),
        ingredients,
        steps,
    }
}

// ---- plain-text heuristics -----------------------------------------------------

function mapText(text, warnings) {
    const lines = text.split('\n').map(l => decodeEntities(l).trim())

    let title = null
    const descLines = []
    const ingredients = []
    const steps = []
    let servings = null
    let currentSection = null
    let skipped = 0
    let stepBuffer = []
    // 'start' -> 'description' -> 'ingredients' -> 'steps' (headers or
    // line-shape flips move the zone forward; 'skip' swallows notes/nutrition).
    let zone = 'start'

    const flushStep = () => {
        if (stepBuffer.length) {
            steps.push({ instruction: stepBuffer.join(' ') })
            stepBuffer = []
        }
    }

    // A short line ending in ":" reads as an authored sub-heading —
    // "For the sauce:" (Stage 21 section labels come from exactly this).
    const sectionLabel = (line) =>
        line.length <= 60 && /^(.+):$/.test(line) ? line.slice(0, -1).trim() : null

    for (const line of lines) {
        if (line === '') {
            if (zone === 'steps') flushStep()
            continue
        }
        if (servings === null && line.length <= 40 && SERVINGS_RE.test(line)) {
            servings = parseInt(line.match(SERVINGS_RE)[1], 10)
            continue
        }
        if (ING_HEADER_RE.test(line)) { zone = 'ingredients'; currentSection = null; continue }
        if (STEP_HEADER_RE.test(line)) { flushStep(); zone = 'steps'; continue }
        if (SKIP_HEADER_RE.test(line)) { flushStep(); zone = 'skip'; continue }
        if (zone === 'skip') { skipped++; continue }

        // "1. Preheat the oven" — a numbered line is a step wherever it
        // appears (the punctuation after the number is what separates it
        // from "1 cup flour").
        const numbered = line.match(NUMBERED_STEP_RE)
        if (numbered) {
            flushStep()
            zone = 'steps'
            stepBuffer = [numbered[2]]
            continue
        }

        if (zone === 'steps') {
            stepBuffer.push(line.replace(STEP_PREFIX_RE, ''))
            continue
        }

        if (zone === 'start') {
            zone = 'description'
            if (line.length <= 120) { title = line; continue }
            warnings.push('First line was too long to be a title — it landed in Description.')
            descLines.push(line)
            continue
        }

        const section = sectionLabel(line)

        if (zone === 'description') {
            // The ingredient list announces itself by shape: a section
            // heading, a bulleted line, or a quantity-leading line.
            const bulleted = BULLET_RE.test(line)
            if (section) { zone = 'ingredients'; currentSection = section; continue }
            if (bulleted || peelQuantity(line.replace(BULLET_RE, ''))) {
                zone = 'ingredients'
                ingredients.push(parseIngredientLine(line, currentSection))
                continue
            }
            descLines.push(line)
            continue
        }

        // zone === 'ingredients'
        if (section) { currentSection = section; continue }
        // A long prose line with no quantity is almost certainly the first
        // step of an unlabeled instructions block.
        if (line.length >= 90 && !peelQuantity(line.replace(BULLET_RE, ''))) {
            zone = 'steps'
            stepBuffer = [line.replace(STEP_PREFIX_RE, '')]
            continue
        }
        ingredients.push(parseIngredientLine(line, currentSection))
    }
    flushStep()

    if (skipped > 0) warnings.push(`Skipped ${skipped} line${skipped === 1 ? '' : 's'} under a notes/nutrition heading.`)
    const description = descLines.join('\n').trim()
    if (description.length > 600) warnings.push('Long intro text landed in Description — trim as needed.')

    return { title: title ?? '', description, servings, tags: [], ingredients, steps }
}

// ---- entry point ----------------------------------------------------------------

function extractLdJsonBlocks(html) {
    const blocks = []
    const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    let m
    while ((m = re.exec(html)) !== null) blocks.push(m[1])
    return blocks
}

function finalize(recipe, source, warnings) {
    const cleaned = {
        title: (recipe.title || '').trim(),
        description: (recipe.description || '').trim(),
        servings: recipe.servings ?? null,
        tags: recipe.tags ?? [],
        ingredients: recipe.ingredients.filter(i => i.name || i.quantity || i.unit || i.notes),
        steps: recipe.steps.filter(s => s.instruction && s.instruction.trim() !== ''),
    }
    if (!cleaned.title && cleaned.ingredients.length === 0 && cleaned.steps.length === 0) {
        return { recipe: null, source, warnings, error: "Couldn't find a recipe in that paste." }
    }
    if (!cleaned.title) warnings.push('No title detected.')
    if (cleaned.ingredients.length === 0) warnings.push('No ingredients detected — add them by hand or adjust the paste.')
    if (cleaned.steps.length === 0) warnings.push('No steps detected — add them by hand or adjust the paste.')
    return { recipe: cleaned, source, warnings, error: null }
}

export function parseRecipeImport(raw) {
    const warnings = []
    const fail = (error) => ({ recipe: null, source: null, warnings, error })

    if (raw == null || String(raw).trim() === '') return fail('Nothing to import — paste a recipe first.')
    if (String(raw).length > MAX_INPUT) return fail('That paste is too large to import.')

    const text = String(raw).replace(/\r\n?/g, '\n').trim()

    // 1) Bare JSON: schema.org Recipe (any nesting) or this app's own export.
    if (text[0] === '{' || text[0] === '[') {
        let json
        try {
            json = JSON.parse(text)
        } catch {
            return fail("That looks like JSON but couldn't be read — check the paste is complete.")
        }
        const node = findRecipeNode(json)
        if (node) return finalize(mapJsonLd(node), 'json-ld', warnings)
        if (json && Array.isArray(json.recipes)) {
            if (json.recipes.length === 0) return fail('That export contains no recipes.')
            if (json.recipes.length > 1) warnings.push(`Export contains ${json.recipes.length} recipes — imported the first ("${json.recipes[0].title}").`)
            return finalize(mapExportRecipe(json.recipes[0]), 'export', warnings)
        }
        if (looksLikeExportRecipe(json)) return finalize(mapExportRecipe(json), 'export', warnings)
        return fail("Pasted JSON doesn't contain a recipe.")
    }

    // 2) Pasted page source: hunt for embedded JSON-LD before anything else.
    if (/<script/i.test(text)) {
        for (const block of extractLdJsonBlocks(text)) {
            try {
                const node = findRecipeNode(JSON.parse(block.trim()))
                if (node) return finalize(mapJsonLd(node), 'json-ld', warnings)
            } catch {
                // Malformed block — keep trying the rest.
            }
        }
    }
    const looksLikeHtml = /^<(!doctype|html)/i.test(text) || (text.match(/<\/?\w+[^>]*>/g) || []).length > 20
    if (looksLikeHtml) {
        return fail('This looks like a web page without embedded recipe data — copy the recipe text itself instead.')
    }

    // 3) Plain text heuristics (stray markup stripped line-by-line).
    return finalize(mapText(text.replace(/<[^>]*>/g, ' '), warnings), 'text', warnings)
}

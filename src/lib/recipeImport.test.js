import { describe, it, expect } from 'vitest'
import { parseRecipeImport, parseIngredientLine } from './recipeImport'

// ---- ingredient-line splitting ----------------------------------------------

describe('parseIngredientLine', () => {
    it('splits qty / unit / name and canonicalizes unit aliases', () => {
        expect(parseIngredientLine('2 tbsp olive oil')).toEqual({
            name: 'olive oil', quantity: '2', unit: 'tablespoon', notes: '', section: null,
        })
    })

    it('keeps mixed numbers as the typed display string', () => {
        const ing = parseIngredientLine('▢ 1 1/2 cups all-purpose flour (spooned and leveled)')
        expect(ing.quantity).toBe('1 1/2')
        expect(ing.unit).toBe('cup')
        expect(ing.name).toBe('all-purpose flour')
        expect(ing.notes).toBe('spooned and leveled')
    })

    it('handles unicode fractions and "of" after the unit', () => {
        expect(parseIngredientLine('½ cup of sugar')).toMatchObject({
            quantity: '½', unit: 'cup', name: 'sugar',
        })
    })

    it('peels a leading unit even without a quantity', () => {
        expect(parseIngredientLine('pinch of salt')).toMatchObject({
            quantity: '', unit: 'pinch', name: 'salt',
        })
    })

    it('leaves unparseable ranges intact in the name', () => {
        expect(parseIngredientLine('2-3 cups broth')).toMatchObject({
            quantity: '', name: '2-3 cups broth',
        })
    })

    it('stamps the given section', () => {
        expect(parseIngredientLine('1 egg', 'For the glaze').section).toBe('For the glaze')
    })
})

// ---- plain text ---------------------------------------------------------------

const SECTIONED_TEXT = `Pasta alla Norma

Serves 4

For the sauce:
- 2 tbsp olive oil
- 1 large eggplant (cubed)
- ½ tsp chili flakes

For the pasta:
- 400 g rigatoni
- salt to taste

Instructions
1. Salt the eggplant and let it drain for 30 minutes.
2. Simmer the tomatoes.
Serve hot.`

describe('parseRecipeImport — plain text', () => {
    it('maps a sectioned recipe: title, servings, sections, steps', () => {
        const { recipe, source, error } = parseRecipeImport(SECTIONED_TEXT)
        expect(error).toBeNull()
        expect(source).toBe('text')
        expect(recipe.title).toBe('Pasta alla Norma')
        expect(recipe.servings).toBe(4)
        expect(recipe.ingredients).toHaveLength(5)
        expect(recipe.ingredients.map(i => i.section)).toEqual([
            'For the sauce', 'For the sauce', 'For the sauce', 'For the pasta', 'For the pasta',
        ])
        expect(recipe.ingredients[0]).toMatchObject({ quantity: '2', unit: 'tablespoon', name: 'olive oil' })
        expect(recipe.ingredients[1].notes).toBe('cubed')
        expect(recipe.ingredients[3]).toMatchObject({ quantity: '400', unit: 'gram', name: 'rigatoni' })
        expect(recipe.ingredients[4].name).toBe('salt to taste')
        // Unnumbered trailing line joins the step it follows (paragraph rule).
        expect(recipe.steps).toEqual([
            { instruction: 'Salt the eggplant and let it drain for 30 minutes.' },
            { instruction: 'Simmer the tomatoes. Serve hot.' },
        ])
    })

    it('infers zones without headers: qty lines start ingredients, long prose starts steps', () => {
        const { recipe } = parseRecipeImport(
            'Weeknight Fried Rice\n' +
            'Quick and forgiving.\n' +
            '2 cups cooked rice\n' +
            '1 tbsp soy sauce\n' +
            '2 eggs\n' +
            'Heat a wok over high heat and scramble the eggs, then fold in the rice and soy sauce until everything is glossy.'
        )
        expect(recipe.title).toBe('Weeknight Fried Rice')
        expect(recipe.description).toBe('Quick and forgiving.')
        expect(recipe.ingredients).toHaveLength(3)
        expect(recipe.ingredients[2]).toMatchObject({ quantity: '2', name: 'eggs', unit: '' })
        expect(recipe.steps).toHaveLength(1)
    })

    it('does not drop an uncommitted step when steps precede an Ingredients header', () => {
        // Regression: a steps -> `Ingredients`-header transition leaves the
        // buffer un-flushed; a long quantity-less line in that block used to
        // overwrite (and silently lose) the pending step. The flush before the
        // long-prose reassignment keeps the first step alive.
        const { recipe } = parseRecipeImport(
            'Quick Sauce\n' +
            'Instructions\n' +
            'Warm the butter and whisk in the flour until it turns pale gold and smells nutty\n' +
            'Ingredients\n' +
            'You will want everything measured out and at room temperature before you even start cooking\n' +
            '2 cups milk'
        )
        expect(recipe.steps[0].instruction).toBe(
            'Warm the butter and whisk in the flour until it turns pale gold and smells nutty'
        )
    })

    it('skips notes/nutrition blocks with a warning', () => {
        const { recipe, warnings } = parseRecipeImport(
            'Toast\nIngredients\n1 slice bread\nSteps\n1. Toast it.\nNotes\nGood with butter.\nAlso jam.'
        )
        expect(recipe.steps).toHaveLength(1)
        expect(warnings.some(w => w.includes('Skipped 2 lines'))).toBe(true)
    })

    it('degrades a bare line to a title-only recipe with warnings', () => {
        const { recipe, warnings, error } = parseRecipeImport('just a lonely line')
        expect(error).toBeNull()
        expect(recipe.title).toBe('just a lonely line')
        expect(warnings.some(w => w.includes('No ingredients'))).toBe(true)
        expect(warnings.some(w => w.includes('No steps'))).toBe(true)
    })
})

// ---- JSON-LD --------------------------------------------------------------------

const JSON_LD = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'B&#233;chamel',
    description: '<p>The mother sauce.</p>',
    recipeYield: ['4', '4 servings'],
    keywords: 'sauce, French, basics',
    recipeCuisine: 'French',
    recipeIngredient: ['2 tbsp butter', '2 tbsp flour', '1 &frac12; cups milk'],
    recipeInstructions: [
        { '@type': 'HowToStep', text: 'Melt the butter.' },
        { '@type': 'HowToStep', text: 'Whisk in flour &amp; cook.' },
    ],
})

describe('parseRecipeImport — JSON-LD', () => {
    it('maps a bare Recipe node with entity/tag cleanup', () => {
        const { recipe, source, error } = parseRecipeImport(JSON_LD)
        expect(error).toBeNull()
        expect(source).toBe('json-ld')
        expect(recipe.title).toBe('Béchamel')
        expect(recipe.description).toBe('The mother sauce.')
        expect(recipe.servings).toBe(4)
        expect(recipe.tags).toEqual(['sauce', 'french', 'basics'])
        expect(recipe.ingredients[2]).toMatchObject({ quantity: '1 ½', unit: 'cup', name: 'milk' })
        expect(recipe.steps[1].instruction).toBe('Whisk in flour & cook.')
    })

    it('finds the Recipe inside @graph and array @type', () => {
        const { recipe, source } = parseRecipeImport(JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
                { '@type': 'WebPage', name: 'noise' },
                {
                    '@type': ['Recipe', 'Thing'],
                    name: 'Graph Cake',
                    recipeIngredient: ['1 cup sugar'],
                    recipeInstructions: 'Mix.\nBake.',
                },
            ],
        }))
        expect(source).toBe('json-ld')
        expect(recipe.title).toBe('Graph Cake')
        expect(recipe.steps).toEqual([{ instruction: 'Mix.' }, { instruction: 'Bake.' }])
    })

    it('extracts JSON-LD out of pasted page source', () => {
        const html = `<!doctype html><html><head>
<script type="application/ld+json">{"@type":"Organization","name":"Some Site"}</script>
<script type="application/ld+json">${JSON_LD}</script>
</head><body><h1>A recipe page</h1><p>lots</p><p>of</p><p>markup</p></body></html>`
        const { recipe, source } = parseRecipeImport(html)
        expect(source).toBe('json-ld')
        expect(recipe.title).toBe('Béchamel')
    })

    it('flattens HowToSection instruction groupings', () => {
        const { recipe } = parseRecipeImport(JSON.stringify({
            '@type': 'Recipe',
            name: 'Layered',
            recipeIngredient: ['1 thing'],
            recipeInstructions: [{
                '@type': 'HowToSection',
                name: 'Make the base',
                itemListElement: [
                    { '@type': 'HowToStep', text: 'Do the first thing.' },
                    { '@type': 'HowToStep', text: 'Do the second thing.' },
                ],
            }],
        }))
        expect(recipe.steps).toEqual([
            { instruction: 'Do the first thing.' },
            { instruction: 'Do the second thing.' },
        ])
    })
})

// ---- own-export shape -------------------------------------------------------------

describe('parseRecipeImport — own export', () => {
    const exportRecipe = {
        title: 'Exported Soup',
        description: 'From my data export.',
        servings: 2,
        tags: ['soup', 'cozy'],
        ingredients: [
            { name: 'lentils', quantity: 1, unit: 'cup', notes: null, order_index: 1 },
            { name: 'olive oil', quantity: 0.5, unit: 'tablespoon', notes: 'or butter', order_index: 0 },
        ],
        steps: [
            { step_number: 2, instruction: 'Simmer until tender.' },
            { step_number: 1, instruction: 'Sweat the aromatics.' },
        ],
    }

    it('maps a single export recipe, ordering rows and prettifying quantities', () => {
        const { recipe, source, error } = parseRecipeImport(JSON.stringify(exportRecipe))
        expect(error).toBeNull()
        expect(source).toBe('export')
        expect(recipe.ingredients[0]).toEqual({
            name: 'olive oil', quantity: '½', unit: 'tablespoon', notes: 'or butter', section: null,
        })
        expect(recipe.steps.map(s => s.instruction)).toEqual([
            'Sweat the aromatics.', 'Simmer until tender.',
        ])
    })

    it('takes the first recipe from a full export blob with a warning', () => {
        const blob = { export_version: 1, recipes: [exportRecipe, { ...exportRecipe, title: 'Second' }] }
        const { recipe, warnings } = parseRecipeImport(JSON.stringify(blob))
        expect(recipe.title).toBe('Exported Soup')
        expect(warnings.some(w => w.includes('2 recipes'))).toBe(true)
    })
})

// ---- failure modes ------------------------------------------------------------------

describe('parseRecipeImport — failure modes', () => {
    it('rejects empty input', () => {
        expect(parseRecipeImport('   ').error).toMatch(/Nothing to import/)
    })

    it('rejects oversized input', () => {
        expect(parseRecipeImport('x'.repeat(600_000)).error).toMatch(/too large/)
    })

    it('rejects broken JSON instead of parsing it as text', () => {
        expect(parseRecipeImport('{"name": "half a paste').error).toMatch(/couldn't be read/)
    })

    it('rejects JSON with no recipe in it', () => {
        expect(parseRecipeImport('{"foo": 1}').error).toMatch(/doesn't contain a recipe/)
    })

    it('rejects an HTML page without embedded recipe data', () => {
        const html = '<!doctype html><html><body>' + '<p>filler</p>'.repeat(30) + '</body></html>'
        expect(parseRecipeImport(html).error).toMatch(/web page/)
    })
})

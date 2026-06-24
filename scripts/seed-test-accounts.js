// Seed test accounts to exercise the library-size-adaptive grid density
// tiers (see refs/COSMETICS.md) plus an admin account for moderation
// testing.
//
// Requires:
//   - VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
//   - "Confirm email" DISABLED in Supabase Auth settings, so signup
//     returns a session immediately (no email click-through needed).
//   - Migration 008 applied (admin schema + bootstrap_admin RPC).
//     Without it, the admin account is created but never promoted —
//     log lines will note this so it's recoverable.
//
// Idempotent: re-running clears each test account's existing recipes
// before inserting fresh ones. Only operates on the hardcoded test
// emails — never touches your real account.
//
// Usage: npm run seed:test

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Parse .env.local without adding a dotenv dependency
function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local')
  const raw = readFileSync(envPath, 'utf8')
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

const env = loadEnv()
const SUPABASE_URL = env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

// All seed-account credentials live in .env.local (gitignored) rather
// than the repo. The literals were previously embedded; once the repo
// went public on GitHub anyone reading the diff could sign into the
// live Supabase project as any of the seeded users (admin included).
// The accounts have since been rotated in Supabase and the literals
// removed from source. The seed script fails loudly if any var is
// missing so silent partial-seed runs are caught immediately.
const TEST_PASSWORD = env.TEST_PASSWORD
const ADMIN_EMAIL = env.ADMIN_EMAIL
const ADMIN_PASSWORD = env.ADMIN_PASSWORD
if (!TEST_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing seed credentials in .env.local — cannot seed.')
  console.error('Add these lines to .env.local (use the current values from the Supabase Dashboard):')
  console.error('  TEST_PASSWORD=<password shared by the five test-* accounts>')
  console.error('  ADMIN_EMAIL=<admin account email>')
  console.error('  ADMIN_PASSWORD=<admin account password>')
  process.exit(1)
}

const ACCOUNTS = [
  { email: 'test-tiny@example.com',   username: 'tiny_tim',     full_name: 'Tiny Tim',     recipeCount: 2,  bio: 'Just getting started.',                isPublic: false, password: TEST_PASSWORD },
  { email: 'test-small@example.com',  username: 'small_sam',    full_name: 'Small Sam',    recipeCount: 6,  bio: 'Cooks on weekends.',                   isPublic: false, password: TEST_PASSWORD },
  { email: 'test-medium@example.com', username: 'medium_mia',   full_name: 'Medium Mia',   recipeCount: 14, bio: 'Has a few go-tos.',                    isPublic: false, password: TEST_PASSWORD },
  { email: 'test-large@example.com',  username: 'large_lou',    full_name: 'Large Lou',    recipeCount: 28, bio: 'Recipe collector.',                    isPublic: false, password: TEST_PASSWORD },
  { email: 'test-public@example.com', username: 'public_paula', full_name: 'Public Paula', recipeCount: 6,  bio: 'Shares everything she cooks.',         isPublic: true,  password: TEST_PASSWORD },
  // Admin account — no recipes of its own, used to exercise moderation
  // controls (delete any recipe / comment, reset likes & bookmarks per
  // recipe, delete any user). Promoted to admin via the bootstrap_admin
  // RPC after signup; the RPC's email allowlist gates self-promotion to
  // exactly this seed email. See supabase_migration_008_admin.sql.
  { email: ADMIN_EMAIL,                username: 'admin_aria',   full_name: 'Admin Aria',   recipeCount: 0,  bio: 'Site moderator.',                      isPublic: false, password: ADMIN_PASSWORD, isAdmin: true },
]

// Each template carries full ingredients + steps so seeded recipes are
// previewable end-to-end (detail page, servings scaler, fridge basket, etc.).
// ingredients: { name, quantity, unit, notes? }  — order_index is assigned from array position
// steps:       { instruction }                   — step_number is assigned from array position + 1
const RECIPE_TEMPLATES = [
  {
    title: 'Lemon Herb Roast Chicken',
    description: 'Crispy-skinned whole chicken roasted with thyme, garlic, and a bright lemon glaze.',
    tags: ['dinner', 'chicken', 'weeknight'],
    ingredients: [
      { name: 'whole chicken',      quantity: 1,    unit: null,   notes: 'about 4 lbs' },
      { name: 'lemons',             quantity: 2,    unit: null,   notes: null },
      { name: 'garlic cloves',      quantity: 6,    unit: null,   notes: null },
      { name: 'fresh thyme',        quantity: 4,    unit: 'sprigs', notes: null },
      { name: 'olive oil',          quantity: 2,    unit: 'tbsp', notes: null },
      { name: 'unsalted butter',    quantity: 2,    unit: 'tbsp', notes: 'softened' },
      { name: 'kosher salt',        quantity: 1,    unit: 'tsp',  notes: null },
      { name: 'black pepper',       quantity: 0.5,  unit: 'tsp',  notes: null },
    ],
    steps: [
      { instruction: 'Preheat oven to 425°F (220°C). Pat the chicken completely dry with paper towels — this is the key to crispy skin.' },
      { instruction: 'Zest one lemon and mix with softened butter, minced garlic, thyme leaves, salt, and pepper. Loosen the skin over the breasts and rub half the butter mixture directly onto the meat.' },
      { instruction: 'Rub the remaining butter mixture all over the outside. Halve both lemons and stuff the cavity with them along with the garlic cloves and thyme sprigs.' },
      { instruction: 'Drizzle with olive oil and season generously with salt and pepper. Tie the legs with kitchen twine.' },
      { instruction: 'Roast on a rack in a roasting pan for 55–65 minutes, until the thigh reads 165°F. Baste once halfway through.' },
      { instruction: 'Rest uncovered for 10 minutes before carving. Squeeze the roasted lemon halves over the top.' },
    ],
  },
  {
    title: 'Spicy Tomato Pasta',
    description: 'A quick weeknight pasta with garlic, chili flakes, and a deep slow-roasted tomato sauce.',
    tags: ['pasta', 'weeknight', 'spicy'],
    ingredients: [
      { name: 'rigatoni',                      quantity: 400,  unit: 'g',    notes: 'or any short pasta' },
      { name: 'canned whole San Marzano tomatoes', quantity: 2, unit: '28oz cans', notes: 'crushed by hand' },
      { name: 'garlic cloves',                 quantity: 6,    unit: null,   notes: 'thinly sliced' },
      { name: 'red chili flakes',              quantity: 1,    unit: 'tsp',  notes: 'plus more to taste' },
      { name: 'olive oil',                     quantity: 0.25, unit: 'cup',  notes: null },
      { name: 'kosher salt',                   quantity: 1,    unit: 'tsp',  notes: null },
      { name: 'Parmigiano-Reggiano',           quantity: 0.5,  unit: 'cup',  notes: 'freshly grated, plus more to serve' },
      { name: 'fresh basil leaves',            quantity: null, unit: null,   notes: 'torn, for finishing' },
    ],
    steps: [
      { instruction: 'Crush the canned tomatoes by hand into a bowl, reserving all juices. Thinly slice the garlic.' },
      { instruction: 'In a large cold skillet, combine garlic, chili flakes, and olive oil. Set over medium heat. Let the garlic slowly sizzle and turn golden — about 3–4 minutes. Starting cold draws out maximum flavor.' },
      { instruction: 'Add crushed tomatoes and all their juices. Season with salt. Simmer over medium-low, stirring occasionally, for 25–30 minutes until the sauce is thick and deepened in color.' },
      { instruction: 'Meanwhile, cook pasta in heavily salted boiling water until 2 minutes shy of al dente. Reserve 1 cup of pasta water before draining.' },
      { instruction: 'Add drained pasta to the sauce with a splash of pasta water. Toss over medium heat for 2 minutes until glossy and well coated.' },
      { instruction: 'Remove from heat, stir in the Parmesan, and finish with torn basil.' },
    ],
  },
  {
    title: 'Chocolate Tahini Cookies',
    description: 'Fudgy cookies with a nutty edge from toasted tahini and a sprinkle of flaky salt.',
    tags: ['dessert', 'cookies', 'chocolate'],
    ingredients: [
      { name: 'tahini',             quantity: 1,    unit: 'cup',  notes: 'well-stirred' },
      { name: 'granulated sugar',   quantity: 0.75, unit: 'cup',  notes: null },
      { name: 'eggs',               quantity: 2,    unit: null,   notes: null },
      { name: 'vanilla extract',    quantity: 1,    unit: 'tsp',  notes: null },
      { name: 'cocoa powder',       quantity: 0.25, unit: 'cup',  notes: 'Dutch-process' },
      { name: 'baking soda',        quantity: 0.5,  unit: 'tsp',  notes: null },
      { name: 'kosher salt',        quantity: 0.25, unit: 'tsp',  notes: null },
      { name: 'dark chocolate chips', quantity: 0.5, unit: 'cup', notes: null },
      { name: 'flaky sea salt',     quantity: null, unit: null,   notes: 'for finishing' },
    ],
    steps: [
      { instruction: 'Preheat oven to 350°F (175°C). Line two baking sheets with parchment.' },
      { instruction: 'Whisk together tahini, sugar, eggs, and vanilla until smooth and glossy.' },
      { instruction: 'Stir in cocoa powder, baking soda, and salt until fully combined. Fold in chocolate chips. The dough will be thick and slightly sticky.' },
      { instruction: 'Roll heaped tablespoons of dough into balls and place 2 inches apart on the sheets. Press each ball gently to flatten slightly.' },
      { instruction: 'Sprinkle a pinch of flaky salt on each cookie.' },
      { instruction: 'Bake for 10–12 minutes until edges are set but centers look underdone — they firm up as they cool.' },
      { instruction: 'Cool on the pan for 5 minutes before transferring to a wire rack. The cookies become fudgier as they cool completely.' },
    ],
  },
  {
    title: 'Miso-Glazed Salmon',
    description: 'Sweet-savory glaze on flaky salmon, broiled until caramelized and served over rice.',
    tags: ['dinner', 'fish', 'asian'],
    ingredients: [
      { name: 'salmon fillets',     quantity: 4,    unit: null,   notes: '6 oz each, skin-on' },
      { name: 'white miso paste',   quantity: 3,    unit: 'tbsp', notes: null },
      { name: 'mirin',              quantity: 2,    unit: 'tbsp', notes: null },
      { name: 'sake',               quantity: 1,    unit: 'tbsp', notes: 'or dry sherry' },
      { name: 'brown sugar',        quantity: 1,    unit: 'tbsp', notes: null },
      { name: 'sesame oil',         quantity: 1,    unit: 'tsp',  notes: null },
      { name: 'green onions',       quantity: 2,    unit: null,   notes: 'sliced, for garnish' },
      { name: 'sesame seeds',       quantity: null, unit: null,   notes: 'for garnish' },
      { name: 'steamed rice',       quantity: null, unit: null,   notes: 'to serve' },
    ],
    steps: [
      { instruction: 'Whisk together miso, mirin, sake, brown sugar, and sesame oil until smooth.' },
      { instruction: 'Pat salmon dry. Place in a shallow dish, spoon glaze over top and sides, and marinate in the fridge for at least 30 minutes (up to overnight).' },
      { instruction: 'Position oven rack 6 inches from broiler. Preheat broiler on high.' },
      { instruction: 'Line a baking sheet with foil and lightly oil it. Place salmon skin-side down and spoon any remaining marinade on top.' },
      { instruction: 'Broil for 8–10 minutes until the glaze is caramelized with dark spots and the fish flakes easily. Watch closely — the sugars can burn quickly.' },
      { instruction: 'Serve over steamed rice, garnished with green onions and sesame seeds.' },
    ],
  },
  {
    title: 'Mushroom Risotto',
    description: 'Slow-stirred arborio rice with mixed mushrooms, white wine, and parmesan.',
    tags: ['dinner', 'vegetarian', 'italian'],
    ingredients: [
      { name: 'arborio rice',       quantity: 1.5,  unit: 'cups', notes: null },
      { name: 'mixed mushrooms',    quantity: 1,    unit: 'lb',   notes: 'cremini, shiitake, or oyster' },
      { name: 'chicken or vegetable stock', quantity: 4, unit: 'cups', notes: 'kept warm' },
      { name: 'dry white wine',     quantity: 1,    unit: 'cup',  notes: null },
      { name: 'yellow onion',       quantity: 1,    unit: null,   notes: 'finely diced' },
      { name: 'garlic cloves',      quantity: 3,    unit: null,   notes: 'minced' },
      { name: 'Parmigiano-Reggiano', quantity: 0.5, unit: 'cup',  notes: 'freshly grated' },
      { name: 'unsalted butter',    quantity: 3,    unit: 'tbsp', notes: 'divided' },
      { name: 'olive oil',          quantity: 2,    unit: 'tbsp', notes: null },
      { name: 'fresh thyme',        quantity: null, unit: null,   notes: 'a few sprigs' },
      { name: 'kosher salt',        quantity: 1,    unit: 'tsp',  notes: null },
    ],
    steps: [
      { instruction: 'Warm stock in a small saucepan over low heat. Keep it at a bare simmer throughout.' },
      { instruction: 'In a wide heavy-bottomed pan, heat 1 tbsp butter with the olive oil over medium-high. Sauté mushrooms without stirring for 3–4 minutes until browned. Season with salt and thyme, cook 2 more minutes. Remove to a plate.' },
      { instruction: 'In the same pan over medium heat, melt remaining butter and cook onion until soft and translucent, about 5 minutes. Add garlic and cook 1 minute more.' },
      { instruction: 'Add rice and stir to coat in the fat for 2 minutes until the edges look translucent.' },
      { instruction: 'Pour in wine and stir until fully absorbed. Then add warm stock one ladleful at a time, stirring almost continuously, letting each addition absorb before adding the next. This takes about 20 minutes.' },
      { instruction: 'When the rice is al dente and the risotto flows like lava, fold in the cooked mushrooms and Parmesan. Adjust seasoning and serve immediately.' },
    ],
  },
  {
    title: 'Caramelized Onion Tart',
    description: 'Buttery puff pastry topped with deeply caramelized onions and a drizzle of balsamic.',
    tags: ['appetizer', 'vegetarian', 'french'],
    ingredients: [
      { name: 'puff pastry sheet',  quantity: 1,    unit: null,   notes: 'thawed if frozen' },
      { name: 'large yellow onions', quantity: 3,   unit: null,   notes: 'thinly sliced' },
      { name: 'unsalted butter',    quantity: 3,    unit: 'tbsp', notes: null },
      { name: 'olive oil',          quantity: 1,    unit: 'tbsp', notes: null },
      { name: 'sugar',              quantity: 1,    unit: 'tsp',  notes: null },
      { name: 'fresh thyme leaves', quantity: 2,    unit: 'tsp',  notes: null },
      { name: 'balsamic vinegar',   quantity: 1,    unit: 'tbsp', notes: 'plus extra for drizzling' },
      { name: 'egg',                quantity: 1,    unit: null,   notes: 'for egg wash' },
      { name: 'goat cheese',        quantity: 2,    unit: 'oz',   notes: 'optional' },
      { name: 'kosher salt',        quantity: 0.5,  unit: 'tsp',  notes: null },
    ],
    steps: [
      { instruction: 'Melt butter with olive oil in a large skillet over medium heat. Add onions and salt. Cook, stirring occasionally, for 30–40 minutes until deep golden and jam-like. Add sugar and thyme in the last 10 minutes. Deglaze with balsamic, stir, and cook 2 more minutes. Cool slightly.' },
      { instruction: 'Preheat oven to 400°F (200°C). Line a baking sheet with parchment.' },
      { instruction: 'Unfold the puff pastry onto the baking sheet. Score a 1-inch border around the edge with a knife, pressing lightly — don\'t cut all the way through.' },
      { instruction: 'Beat the egg with 1 tbsp water and brush the border with egg wash.' },
      { instruction: 'Spread caramelized onions evenly inside the border. Crumble goat cheese on top if using.' },
      { instruction: 'Bake for 20–25 minutes until the pastry is deep golden and puffed around the edges.' },
      { instruction: 'Drizzle with a little extra balsamic before serving. Cut into squares and serve warm or at room temperature.' },
    ],
  },
  {
    title: 'Thai Basil Stir Fry',
    description: 'Quick stir fry with ground chicken, holy basil, garlic, chili, and a fried egg on top.',
    tags: ['dinner', 'asian', 'spicy', 'weeknight'],
    ingredients: [
      { name: 'ground chicken',     quantity: 1,    unit: 'lb',   notes: 'or pork' },
      { name: 'fresh Thai basil leaves', quantity: 1, unit: 'cup', notes: 'holy basil preferred' },
      { name: 'garlic cloves',      quantity: 4,    unit: null,   notes: null },
      { name: 'Thai chilies',       quantity: 3,    unit: null,   notes: 'or to taste' },
      { name: 'oyster sauce',       quantity: 2,    unit: 'tbsp', notes: null },
      { name: 'fish sauce',         quantity: 1,    unit: 'tbsp', notes: null },
      { name: 'dark soy sauce',     quantity: 1,    unit: 'tbsp', notes: null },
      { name: 'sugar',              quantity: 1,    unit: 'tsp',  notes: null },
      { name: 'vegetable oil',      quantity: 2,    unit: 'tbsp', notes: null },
      { name: 'eggs',               quantity: 2,    unit: null,   notes: 'fried, one per serving' },
      { name: 'jasmine rice',       quantity: null, unit: null,   notes: 'steamed, to serve' },
    ],
    steps: [
      { instruction: 'Pound or mince the garlic and chilies together into a rough paste.' },
      { instruction: 'Heat oil in a wok over very high heat until just smoking. Add the garlic-chili paste and stir-fry for 30 seconds until fragrant.' },
      { instruction: 'Add ground chicken. Let it sear without stirring for 1 minute for browning, then break it up and cook through, about 3 more minutes.' },
      { instruction: 'Mix oyster sauce, fish sauce, soy sauce, and sugar in a small bowl. Pour over the chicken and toss to coat. Cook 1 more minute.' },
      { instruction: 'Remove from heat and fold in the Thai basil leaves. The residual heat will wilt them.' },
      { instruction: 'In a separate pan, fry eggs in a generous splash of oil over medium-high until the whites are crispy and set but the yolks are still runny.' },
      { instruction: 'Serve over jasmine rice, topped with a crispy fried egg.' },
    ],
  },
  {
    title: 'Roasted Sweet Potato Tacos',
    description: 'Warm corn tortillas, smoky roasted sweet potato, lime crema, and pickled onions.',
    tags: ['dinner', 'vegetarian', 'mexican'],
    ingredients: [
      { name: 'sweet potatoes',     quantity: 2,    unit: null,   notes: 'medium, cut into 1-inch cubes' },
      { name: 'cumin',              quantity: 1,    unit: 'tsp',  notes: null },
      { name: 'smoked paprika',     quantity: 1,    unit: 'tsp',  notes: null },
      { name: 'chipotle powder',    quantity: 0.5,  unit: 'tsp',  notes: null },
      { name: 'olive oil',          quantity: 2,    unit: 'tbsp', notes: null },
      { name: 'small corn tortillas', quantity: 8,  unit: null,   notes: null },
      { name: 'sour cream',         quantity: 0.5,  unit: 'cup',  notes: null },
      { name: 'lime',               quantity: 1,    unit: null,   notes: 'zested and juiced' },
      { name: 'pickled red onions', quantity: 0.25, unit: 'cup',  notes: null },
      { name: 'fresh cilantro',     quantity: null, unit: null,   notes: 'to taste' },
      { name: 'kosher salt',        quantity: 0.5,  unit: 'tsp',  notes: null },
    ],
    steps: [
      { instruction: 'Preheat oven to 425°F (220°C). Toss sweet potato cubes with olive oil, cumin, smoked paprika, chipotle, and salt. Spread on a baking sheet in a single layer.' },
      { instruction: 'Roast for 25–30 minutes, flipping once halfway, until tender and caramelized at the edges.' },
      { instruction: 'Make the lime crema: mix sour cream with lime zest, half the lime juice, and a pinch of salt.' },
      { instruction: 'Warm tortillas directly over a gas flame or in a dry skillet until charred in spots. Keep wrapped in a clean towel.' },
      { instruction: 'Assemble tacos: spoon roasted sweet potato into each tortilla, dollop with lime crema, and top with pickled onions and cilantro.' },
      { instruction: 'Squeeze the remaining lime over the top before serving.' },
    ],
  },
  {
    title: 'Olive Oil Cake',
    description: 'Tender single-layer cake with a citrus zing — surprisingly simple, deeply satisfying.',
    tags: ['dessert', 'cake', 'italian'],
    ingredients: [
      { name: 'all-purpose flour',  quantity: 1.5,  unit: 'cups', notes: null },
      { name: 'granulated sugar',   quantity: 1,    unit: 'cup',  notes: null },
      { name: 'good olive oil',     quantity: 0.75, unit: 'cup',  notes: 'fruity, not grassy' },
      { name: 'eggs',               quantity: 3,    unit: null,   notes: null },
      { name: 'whole milk',         quantity: 0.75, unit: 'cup',  notes: null },
      { name: 'orange',             quantity: 1,    unit: null,   notes: 'zested and juiced' },
      { name: 'baking powder',      quantity: 1.5,  unit: 'tsp',  notes: null },
      { name: 'kosher salt',        quantity: 0.25, unit: 'tsp',  notes: null },
      { name: 'powdered sugar',     quantity: null, unit: null,   notes: 'for serving' },
    ],
    steps: [
      { instruction: 'Preheat oven to 350°F (175°C). Grease a 9-inch round cake pan and line the bottom with parchment.' },
      { instruction: 'Whisk together flour, baking powder, and salt in a bowl.' },
      { instruction: 'In a large bowl, whisk eggs and sugar until pale and slightly thick, about 2 minutes. Drizzle in the olive oil while whisking, then whisk in milk, orange juice, and zest.' },
      { instruction: 'Add the dry ingredients to the wet and fold gently until just combined — a few streaks of flour are fine.' },
      { instruction: 'Pour into the prepared pan and bake for 35–40 minutes until a skewer comes out clean and the top is deep golden.' },
      { instruction: 'Cool in the pan for 10 minutes, then turn out onto a rack. Serve warm or at room temperature, dusted with powdered sugar.' },
    ],
  },
  {
    title: 'Cucumber Smash Salad',
    description: 'Smashed Persian cucumbers tossed with sesame, garlic, soy, and a kick of chili crisp.',
    tags: ['side', 'salad', 'asian'],
    ingredients: [
      { name: 'Persian cucumbers',  quantity: 4,    unit: null,   notes: 'or 1 English cucumber' },
      { name: 'garlic cloves',      quantity: 2,    unit: null,   notes: 'minced' },
      { name: 'soy sauce',          quantity: 1.5,  unit: 'tbsp', notes: null },
      { name: 'rice vinegar',       quantity: 1,    unit: 'tbsp', notes: null },
      { name: 'sesame oil',         quantity: 1,    unit: 'tbsp', notes: null },
      { name: 'sugar',              quantity: 1,    unit: 'tsp',  notes: null },
      { name: 'chili crisp',        quantity: 1,    unit: 'tbsp', notes: 'plus more to taste' },
      { name: 'toasted sesame seeds', quantity: 1,  unit: 'tsp',  notes: null },
      { name: 'green onions',       quantity: 2,    unit: null,   notes: 'sliced' },
      { name: 'kosher salt',        quantity: 0.5,  unit: 'tsp',  notes: 'for drawing out moisture' },
    ],
    steps: [
      { instruction: 'Using the flat side of a knife or a rolling pin, smash each cucumber firmly until it cracks and splits. Tear into rough 1-inch pieces.' },
      { instruction: 'Toss the smashed cucumber pieces with ½ tsp kosher salt and let drain in a colander for 10 minutes to remove excess moisture.' },
      { instruction: 'Whisk together garlic, soy sauce, rice vinegar, sesame oil, and sugar until the sugar dissolves.' },
      { instruction: 'Pat cucumbers dry and transfer to a bowl. Pour dressing over and toss to coat.' },
      { instruction: 'Top with chili crisp, sesame seeds, and green onions.' },
      { instruction: 'Taste and add more chili crisp or a pinch of salt if needed. Serve immediately or marinate in the fridge up to 30 minutes.' },
    ],
  },
  {
    title: 'Shakshuka',
    description: 'Eggs poached in a spiced tomato-pepper sauce with feta and crusty bread for dipping.',
    tags: ['breakfast', 'vegetarian', 'middle-eastern'],
    ingredients: [
      { name: 'eggs',               quantity: 6,    unit: null,   notes: null },
      { name: 'canned diced tomatoes', quantity: 2, unit: '14oz cans', notes: null },
      { name: 'red bell pepper',    quantity: 1,    unit: null,   notes: 'diced' },
      { name: 'yellow onion',       quantity: 1,    unit: null,   notes: 'diced' },
      { name: 'garlic cloves',      quantity: 4,    unit: null,   notes: 'minced' },
      { name: 'cumin',              quantity: 1,    unit: 'tsp',  notes: null },
      { name: 'smoked paprika',     quantity: 1,    unit: 'tsp',  notes: null },
      { name: 'coriander',          quantity: 0.5,  unit: 'tsp',  notes: null },
      { name: 'cayenne pepper',     quantity: 0.25, unit: 'tsp',  notes: null },
      { name: 'olive oil',          quantity: 2,    unit: 'tbsp', notes: null },
      { name: 'feta cheese',        quantity: 100,  unit: 'g',    notes: 'crumbled' },
      { name: 'fresh parsley or cilantro', quantity: null, unit: null, notes: 'for garnish' },
      { name: 'crusty bread',       quantity: null, unit: null,   notes: 'to serve' },
    ],
    steps: [
      { instruction: 'Heat olive oil in a wide skillet with a lid over medium heat. Add onion and bell pepper; cook until soft, about 7 minutes. Add garlic and all spices; stir and cook 1 more minute.' },
      { instruction: 'Add canned tomatoes with their juices. Season with salt and simmer, stirring occasionally, for 10–15 minutes until the sauce thickens.' },
      { instruction: 'Use a spoon to make 6 shallow wells in the sauce. Crack one egg into each well. Season each egg with a small pinch of salt.' },
      { instruction: 'Cover the pan and cook over medium-low for 5–8 minutes — 5 for runny yolks, 8 for fully set.' },
      { instruction: 'Remove from heat. Scatter feta and fresh herbs over the top.' },
      { instruction: 'Bring the pan to the table and serve directly from it, with crusty bread for scooping.' },
    ],
  },
  {
    title: 'Brown Butter Pancakes',
    description: 'Fluffy buttermilk pancakes deepened with the nutty notes of browned butter.',
    tags: ['breakfast', 'sweet'],
    ingredients: [
      { name: 'all-purpose flour',  quantity: 1.5,  unit: 'cups', notes: null },
      { name: 'baking powder',      quantity: 2,    unit: 'tsp',  notes: null },
      { name: 'baking soda',        quantity: 0.5,  unit: 'tsp',  notes: null },
      { name: 'kosher salt',        quantity: 0.5,  unit: 'tsp',  notes: null },
      { name: 'granulated sugar',   quantity: 2,    unit: 'tbsp', notes: null },
      { name: 'buttermilk',         quantity: 1.25, unit: 'cups', notes: null },
      { name: 'eggs',               quantity: 2,    unit: null,   notes: null },
      { name: 'unsalted butter',    quantity: 4,    unit: 'tbsp', notes: 'browned' },
      { name: 'vanilla extract',    quantity: 1,    unit: 'tsp',  notes: null },
      { name: 'maple syrup',        quantity: null, unit: null,   notes: 'to serve' },
    ],
    steps: [
      { instruction: 'Brown the butter: melt it in a small saucepan over medium heat, swirling often, until it smells nutty and the milk solids turn golden-brown. Pour into a bowl and cool for 5 minutes.' },
      { instruction: 'Whisk together flour, baking powder, baking soda, salt, and sugar in a large bowl.' },
      { instruction: 'In another bowl, whisk buttermilk, eggs, and vanilla. Add the cooled brown butter and whisk to combine.' },
      { instruction: 'Pour wet ingredients into dry and fold with a spatula just until combined — lumpy batter is correct. Overmixing makes tough pancakes.' },
      { instruction: 'Heat a nonstick pan or griddle over medium heat and lightly butter it. Drop ¼ cup of batter per pancake. Cook until bubbles form across the surface and edges look matte, about 2–3 minutes. Flip and cook 1–2 minutes more.' },
      { instruction: 'Keep finished pancakes warm on a baking sheet in a 200°F oven while you cook the rest. Serve with maple syrup.' },
    ],
  },
  {
    title: 'Garlic Confit',
    description: 'Whole garlic cloves slowly cooked in olive oil until jammy and spreadable.',
    tags: ['pantry', 'condiment'],
    ingredients: [
      { name: 'garlic heads',       quantity: 3,    unit: null,   notes: 'cloves separated and peeled (~45 cloves)' },
      { name: 'olive oil',          quantity: 1,    unit: 'cup',  notes: null },
      { name: 'fresh thyme',        quantity: 4,    unit: 'sprigs', notes: null },
      { name: 'fresh rosemary',     quantity: 2,    unit: 'sprigs', notes: null },
      { name: 'whole black peppercorns', quantity: 0.5, unit: 'tsp', notes: null },
      { name: 'bay leaf',           quantity: 1,    unit: null,   notes: null },
      { name: 'kosher salt',        quantity: 0.25, unit: 'tsp',  notes: null },
    ],
    steps: [
      { instruction: 'Separate and peel all garlic cloves. A quick 30-second blanch in boiling water makes the skins slip right off.' },
      { instruction: 'Add garlic, olive oil, thyme, rosemary, peppercorns, bay leaf, and salt to a small saucepan. The garlic should be fully submerged.' },
      { instruction: 'Set over the lowest possible heat. The oil should be between 180–200°F — barely a shimmer, no bubbles. Cook for 45 minutes to 1 hour, stirring occasionally, until cloves are completely tender and just starting to turn golden at the edges.' },
      { instruction: 'Remove from heat and let cool to room temperature. Discard the herb sprigs and bay leaf.' },
      { instruction: 'Transfer garlic and all the infused oil to a clean glass jar. The oil is equally valuable — use it for cooking, drizzling, or bread dipping. Store in the fridge for up to 2 weeks.' },
    ],
  },
  {
    title: 'Lemon Bars',
    description: 'Tangy lemon curd over a shortbread crust, with a thick dusting of powdered sugar.',
    tags: ['dessert', 'baking'],
    ingredients: [
      { name: 'all-purpose flour',  quantity: 1.25, unit: 'cups', notes: 'divided: 1 cup crust, ¼ cup filling' },
      { name: 'powdered sugar',     quantity: 0.25, unit: 'cup',  notes: 'for crust, plus more for dusting' },
      { name: 'cold unsalted butter', quantity: 0.5, unit: 'cup', notes: 'cubed' },
      { name: 'eggs',               quantity: 4,    unit: null,   notes: null },
      { name: 'granulated sugar',   quantity: 1.5,  unit: 'cups', notes: null },
      { name: 'fresh lemon juice',  quantity: 0.75, unit: 'cup',  notes: 'about 4–5 lemons' },
      { name: 'lemon zest',         quantity: 1,    unit: 'tbsp', notes: null },
      { name: 'kosher salt',        quantity: 0.5,  unit: 'tsp',  notes: 'divided between crust and filling' },
    ],
    steps: [
      { instruction: 'Preheat oven to 350°F (175°C). Line an 8×8 pan with parchment, leaving overhang on two sides for easy lifting.' },
      { instruction: 'Make the crust: pulse 1 cup flour, powdered sugar, and ¼ tsp salt in a food processor. Add cold butter and pulse until it resembles coarse sand. Press firmly into the pan in an even layer.' },
      { instruction: 'Bake the crust for 18–20 minutes until pale golden at the edges.' },
      { instruction: 'While the crust bakes, whisk eggs, granulated sugar, and ¼ cup flour until smooth. Add lemon juice, zest, and remaining salt and whisk to combine.' },
      { instruction: 'Pour the filling over the hot crust immediately after it comes out of the oven — the heat helps them bond. Bake for 22–25 minutes until just set with a slight wobble in the center.' },
      { instruction: 'Cool completely in the pan, then refrigerate for at least 1 hour. Lift out with the parchment, dust generously with powdered sugar, and cut into 16 squares with a clean knife.' },
    ],
  },
  {
    title: 'Korean Beef Bowls',
    description: 'Sweet-soy ground beef over rice with cucumber, scrambled egg, and gochujang.',
    tags: ['dinner', 'asian', 'beef', 'weeknight'],
    ingredients: [
      { name: 'ground beef',        quantity: 1,    unit: 'lb',   notes: null },
      { name: 'soy sauce',          quantity: 0.25, unit: 'cup',  notes: null },
      { name: 'brown sugar',        quantity: 2,    unit: 'tbsp', notes: null },
      { name: 'sesame oil',         quantity: 1,    unit: 'tbsp', notes: null },
      { name: 'gochujang',          quantity: 1,    unit: 'tbsp', notes: 'Korean chili paste' },
      { name: 'garlic cloves',      quantity: 4,    unit: null,   notes: 'minced' },
      { name: 'fresh ginger',       quantity: 1,    unit: 'tsp',  notes: 'grated' },
      { name: 'Persian cucumber',   quantity: 0.5,  unit: 'cup',  notes: 'sliced' },
      { name: 'eggs',               quantity: 2,    unit: null,   notes: 'lightly scrambled' },
      { name: 'short-grain rice',   quantity: null, unit: null,   notes: 'steamed, to serve' },
      { name: 'sesame seeds',       quantity: null, unit: null,   notes: 'for garnish' },
      { name: 'green onions',       quantity: null, unit: null,   notes: 'sliced, for garnish' },
    ],
    steps: [
      { instruction: 'Whisk together soy sauce, brown sugar, sesame oil, gochujang, garlic, and ginger in a small bowl.' },
      { instruction: 'Brown ground beef in a skillet over medium-high heat, breaking it up as it cooks, about 5 minutes. Drain excess fat.' },
      { instruction: 'Pour sauce over the beef and stir. Cook for 2–3 more minutes until the sauce is absorbed and the beef looks glossy and slightly sticky.' },
      { instruction: 'In a separate small pan, scramble the eggs until just set and still slightly custardy. Season with a pinch of salt.' },
      { instruction: 'Assemble bowls: a scoop of steamed rice, a generous heap of sauced beef, scrambled egg on the side, and sliced cucumber.' },
      { instruction: 'Garnish with sesame seeds and green onions. Add an extra drizzle of gochujang on top for more heat.' },
    ],
  },
]

// Heights vary so the masonry layout actually looks masonry-ish in tests
const IMAGE_HEIGHTS = [500, 620, 740, 860, 580, 720, 640, 820, 560, 780]

function makeImageUrl(accountSlug, index) {
  const h = IMAGE_HEIGHTS[index % IMAGE_HEIGHTS.length]
  return `https://picsum.photos/seed/cookbook-${accountSlug}-${index}/600/${h}`
}

function makeRecipes(account) {
  return Array.from({ length: account.recipeCount }, (_, i) => {
    const tIdx = i % RECIPE_TEMPLATES.length
    const template = RECIPE_TEMPLATES[tIdx]
    const repeat = Math.floor(i / RECIPE_TEMPLATES.length)
    return {
      title: repeat === 0 ? template.title : `${template.title} (v${repeat + 1})`,
      description: template.description,
      tags: template.tags,
      image_url: makeImageUrl(account.username, i),
      servings: 2 + (i % 6),
      is_public: account.isPublic ?? false,
      _templateIndex: tIdx, // stripped before DB insert; used for ingredient/step lookup
    }
  })
}

async function seedAccount(account, index) {
  console.log(`\n[${index + 1}/${ACCOUNTS.length}] ${account.email} (${account.recipeCount} recipes${account.isAdmin ? ', admin' : ''})`)
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Try signup. If email-confirm is enabled, Supabase returns user-no-session.
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: account.email,
    password: account.password,
    options: {
      data: {
        username: account.username,
        full_name: account.full_name,
      },
    },
  })

  const alreadyRegistered =
    signUpError && /already registered|already exists/i.test(signUpError.message)

  if (signUpError && !alreadyRegistered) {
    console.error(`  ✗ Signup failed: ${signUpError.message}`)
    return false
  }

  if (signUpData && signUpData.user && !signUpData.session && !alreadyRegistered) {
    console.error(`  ✗ Signup returned no session — "Confirm email" is enabled in Supabase.`)
    console.error(`    Disable it: Dashboard → Authentication → Providers → Email → "Confirm email" → OFF`)
    return false
  }

  // Sign in to make sure we have a session for the inserts below
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })
  if (signInError) {
    console.error(`  ✗ Sign-in failed: ${signInError.message}`)
    if (/email.*not.*confirm/i.test(signInError.message)) {
      console.error(`    Disable "Confirm email" in Supabase Auth settings and re-run.`)
    }
    return false
  }
  const userId = signInData.user.id
  console.log(`  ✓ ${alreadyRegistered ? 'Signed in to existing account' : 'Account created'}`)

  // Update profile bio (the auto-create trigger sets username/full_name but
  // not bio). Also pre-dismiss the first-run onboarding tour (migration 022):
  // seed accounts aren't the "new user" the tour is meant to greet, so a
  // dismissed timestamp keeps test logins tour-free. Verify the tour itself
  // with a genuine fresh signup (its onboarding_dismissed_at starts NULL).
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ bio: account.bio, onboarding_dismissed_at: new Date().toISOString() })
    .eq('id', userId)
  if (profileError) {
    console.warn(`  ⚠ Couldn't update bio: ${profileError.message}`)
  }

  // Promote to admin via the SECURITY DEFINER bootstrap_admin RPC. The
  // RPC's email allowlist gates self-promotion to known seed emails only;
  // any other caller gets RAISE EXCEPTION. Idempotent — running it on a
  // already-admin account is a no-op UPDATE.
  if (account.isAdmin) {
    const { error: bootstrapError } = await supabase.rpc('bootstrap_admin')
    if (bootstrapError) {
      console.warn(`  ⚠ Couldn't promote to admin: ${bootstrapError.message}`)
      console.warn(`    Likely cause: migration 008 hasn't been applied yet.`)
      console.warn(`    Run supabase_migration_008_admin.sql in the SQL editor, then re-run this script.`)
    } else {
      console.log(`  ✓ Promoted to admin`)
    }
  }

  // Clear existing recipes for this user — keeps the script idempotent.
  // Scoped to author_id = userId, so only this test account's data is touched.
  const { error: deleteError } = await supabase
    .from('recipes')
    .delete()
    .eq('author_id', userId)
  if (deleteError) {
    console.error(`  ✗ Failed to clear existing recipes: ${deleteError.message}`)
    return false
  }

  // Insert fresh recipes (skipped when recipeCount = 0, e.g. the admin)
  if (account.recipeCount > 0) {
    const recipesWithMeta = makeRecipes(account).map(r => ({ ...r, author_id: userId }))
    // Strip the internal tracking field before sending to Supabase
    const recipeRows = recipesWithMeta.map(({ _templateIndex: _t, ...rest }) => rest)

    const { data: insertedRecipes, error: insertError } = await supabase
      .from('recipes')
      .insert(recipeRows)
      .select('id')
    if (insertError) {
      console.error(`  ✗ Recipe insert failed: ${insertError.message}`)
      return false
    }
    console.log(`  ✓ Inserted ${recipeRows.length} recipes`)

    // Build and insert all ingredients across every recipe in one batch
    const allIngredients = insertedRecipes.flatMap((row, i) => {
      const template = RECIPE_TEMPLATES[recipesWithMeta[i]._templateIndex]
      return template.ingredients.map((ing, orderIdx) => ({
        recipe_id: row.id,
        name: ing.name,
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        notes: ing.notes ?? null,
        order_index: orderIdx,
      }))
    })
    const { error: ingError } = await supabase.from('ingredients').insert(allIngredients)
    if (ingError) {
      console.error(`  ✗ Ingredient insert failed: ${ingError.message}`)
      return false
    }
    console.log(`  ✓ Inserted ${allIngredients.length} ingredients`)

    // Build and insert all steps across every recipe in one batch
    const allSteps = insertedRecipes.flatMap((row, i) => {
      const template = RECIPE_TEMPLATES[recipesWithMeta[i]._templateIndex]
      return template.steps.map((step, stepIdx) => ({
        recipe_id: row.id,
        step_number: stepIdx + 1,
        instruction: step.instruction,
      }))
    })
    const { error: stepError } = await supabase.from('steps').insert(allSteps)
    if (stepError) {
      console.error(`  ✗ Step insert failed: ${stepError.message}`)
      return false
    }
    console.log(`  ✓ Inserted ${allSteps.length} steps`)
  }

  await supabase.auth.signOut()
  return true
}

async function main() {
  console.log(`Seeding test accounts against ${SUPABASE_URL}`)

  const results = []
  for (let i = 0; i < ACCOUNTS.length; i++) {
    const ok = await seedAccount(ACCOUNTS[i], i)
    results.push(ok)
  }

  const succeeded = results.filter(Boolean).length
  console.log(`\n--- ${succeeded}/${ACCOUNTS.length} accounts seeded ---`)
  if (succeeded === ACCOUNTS.length) {
    console.log(`\nTest accounts share the password: ${TEST_PASSWORD}`)
    console.log(`Admin account password: (see .env.local — ADMIN_PASSWORD)\n`)
    ACCOUNTS.forEach(a => {
      const visibility = a.isAdmin ? '  admin' : (a.isPublic ? 'public ' : 'private')
      console.log(`  ${a.email.padEnd(28)} — ${a.recipeCount.toString().padStart(2)} ${visibility} recipes (${a.username})`)
    })
    console.log('\nLog in with any of these to see the corresponding density tier,')
    console.log('or open the app without signing in to browse test-public\'s public set.')
  } else {
    console.log('\nSee errors above. Fix the issue and re-run — the script is safe to re-run.')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

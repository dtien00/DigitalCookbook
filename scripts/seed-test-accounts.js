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

const TEST_PASSWORD = 'TestPass123!'
const ADMIN_PASSWORD = 'AdminPass123!'

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
  { email: 'admin@example.com',       username: 'admin_aria',   full_name: 'Admin Aria',   recipeCount: 0,  bio: 'Site moderator.',                      isPublic: false, password: ADMIN_PASSWORD, isAdmin: true },
]

const RECIPE_TEMPLATES = [
  { title: 'Lemon Herb Roast Chicken',     description: 'Crispy-skinned whole chicken roasted with thyme, garlic, and a bright lemon glaze.',     tags: ['dinner', 'chicken', 'weeknight'] },
  { title: 'Spicy Tomato Pasta',           description: 'A quick weeknight pasta with garlic, chili flakes, and a deep slow-roasted tomato sauce.', tags: ['pasta', 'weeknight', 'spicy'] },
  { title: 'Chocolate Tahini Cookies',     description: 'Fudgy cookies with a nutty edge from toasted tahini and a sprinkle of flaky salt.',     tags: ['dessert', 'cookies', 'chocolate'] },
  { title: 'Miso-Glazed Salmon',           description: 'Sweet-savory glaze on flaky salmon, broiled until caramelized and served over rice.',    tags: ['dinner', 'fish', 'asian'] },
  { title: 'Mushroom Risotto',             description: 'Slow-stirred arborio rice with mixed mushrooms, white wine, and parmesan.',              tags: ['dinner', 'vegetarian', 'italian'] },
  { title: 'Caramelized Onion Tart',       description: 'Buttery puff pastry topped with deeply caramelized onions and a drizzle of balsamic.',   tags: ['appetizer', 'vegetarian', 'french'] },
  { title: 'Thai Basil Stir Fry',          description: 'Quick stir fry with ground chicken, holy basil, garlic, chili, and a fried egg on top.', tags: ['dinner', 'asian', 'spicy', 'weeknight'] },
  { title: 'Roasted Sweet Potato Tacos',   description: 'Warm corn tortillas, smoky roasted sweet potato, lime crema, and pickled onions.',      tags: ['dinner', 'vegetarian', 'mexican'] },
  { title: 'Olive Oil Cake',               description: 'Tender single-layer cake with a citrus zing — surprisingly simple, deeply satisfying.',  tags: ['dessert', 'cake', 'italian'] },
  { title: 'Cucumber Smash Salad',         description: 'Smashed Persian cucumbers tossed with sesame, garlic, soy, and a kick of chili crisp.',  tags: ['side', 'salad', 'asian'] },
  { title: 'Shakshuka',                    description: 'Eggs poached in a spiced tomato-pepper sauce with feta and crusty bread for dipping.',   tags: ['breakfast', 'vegetarian', 'middle-eastern'] },
  { title: 'Brown Butter Pancakes',        description: 'Fluffy buttermilk pancakes deepened with the nutty notes of browned butter.',           tags: ['breakfast', 'sweet'] },
  { title: 'Garlic Confit',                description: 'Whole garlic cloves slowly cooked in olive oil until jammy and spreadable.',             tags: ['pantry', 'condiment'] },
  { title: 'Lemon Bars',                   description: 'Tangy lemon curd over a shortbread crust, with a thick dusting of powdered sugar.',     tags: ['dessert', 'baking'] },
  { title: 'Korean Beef Bowls',            description: 'Sweet-soy ground beef over rice with cucumber, scrambled egg, and gochujang.',           tags: ['dinner', 'asian', 'beef', 'weeknight'] },
]

// Heights vary so the masonry layout actually looks masonry-ish in tests
const IMAGE_HEIGHTS = [500, 620, 740, 860, 580, 720, 640, 820, 560, 780]

function makeImageUrl(accountSlug, index) {
  const h = IMAGE_HEIGHTS[index % IMAGE_HEIGHTS.length]
  return `https://picsum.photos/seed/cookbook-${accountSlug}-${index}/600/${h}`
}

function makeRecipes(account) {
  return Array.from({ length: account.recipeCount }, (_, i) => {
    const template = RECIPE_TEMPLATES[i % RECIPE_TEMPLATES.length]
    const repeat = Math.floor(i / RECIPE_TEMPLATES.length)
    return {
      title: repeat === 0 ? template.title : `${template.title} (v${repeat + 1})`,
      description: template.description,
      tags: template.tags,
      image_url: makeImageUrl(account.username, i),
      servings: 2 + (i % 6),
      is_public: account.isPublic ?? false,
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

  // Update profile bio (the auto-create trigger sets username/full_name but not bio)
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ bio: account.bio })
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
    const recipes = makeRecipes(account).map(r => ({ ...r, author_id: userId }))
    const { error: insertError } = await supabase.from('recipes').insert(recipes)
    if (insertError) {
      console.error(`  ✗ Insert failed: ${insertError.message}`)
      return false
    }
    console.log(`  ✓ Inserted ${recipes.length} recipes`)
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
    console.log(`Admin account password: ${ADMIN_PASSWORD}\n`)
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

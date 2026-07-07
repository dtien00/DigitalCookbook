# Instacart Shoppable Recipes — Research

> **Status:** Research only. Nothing here is implemented. This document evaluates
> whether and how to make Digital Cookbook recipes "shoppable" via Instacart, what
> it could earn, and what we'd have to build and maintain to support it.
>
> **Date:** 2026-06-25 · **Source brief:** the user-supplied
> [Shoppable Recipes PDF](https://company.instacart.com/static/pdfs/shoppable-recipes.pdf)
> and the official Instacart developer + affiliate docs (see [Sources](#sources)).

---

## TL;DR

- There are **two separate things** that get conflated under "Tastemakers":
  1. **The technical integration** — the *Instacart Developer Platform (IDP)* API that turns a recipe's ingredient list into a hosted, add-to-cart "shoppable recipe" page. This is the engineering work.
  2. **The monetization** — the affiliate program that pays you a cut of resulting Instacart orders. **Tastemakers (launched July 2023) has been retired; the program moved to Impact.** You enroll separately to actually *earn*.
- **The "copy-paste JavaScript snippet"** advertised in the PDF is aimed at **WordPress / static recipe blogs** (via plugins like Tasty Recipes / WP Recipe Maker). Digital Cookbook is a **React + Vite SPA with a Supabase backend and dynamic, user-generated recipes** — for us, the clean path is the **IDP API**, not a pasted `<script>`. We generate a shoppable link per recipe and render Instacart's branded button.
- **Revenue is real but small at our scale:** ~**5% commission** on qualifying Instacart orders (historically a 7-day attribution window), or a per-new-customer bounty. With a portfolio-stage audience this is **effectively $0 until there's meaningful traffic**. Treat it as a *resume/feature* play first, a *revenue* play second.
- **Required scaffolding is modest but non-trivial:** the API key **must not** ship in the client bundle, so we need a **server-side proxy** (a Supabase **Edge Function** is the natural fit — we're already on Supabase) plus a small `InstacartButton` component, URL caching, and affiliate enrollment. Our existing ingredient model maps almost 1:1 onto the API payload.

---

## 1. How it works

### 1.1 The two layers

| Layer | What it is | What it gives you | Where you sign up |
|---|---|---|---|
| **Instacart Developer Platform (IDP)** | A REST API (`connect.instacart.com`) | Generates a hosted **shoppable recipe page** on Instacart and returns a `products_link_url` | [docs.instacart.com](https://docs.instacart.com/developer_platform_api) → "Get an API key" |
| **Affiliate program** (was *Tastemakers* → now **Impact**) | A commission/payout program | Pays you a % of orders driven by your shoppable links | [Impact](https://impact.com) marketplace (search "Instacart") |

You can technically do the API integration without enrolling in the affiliate program — you'd just be adding a convenience feature with no payout. To *earn*, you need both.

### 1.2 The "shoppable recipe" user journey

1. A cook opens a recipe in Digital Cookbook.
2. They tap **"Shop with Instacart" / "Get Recipe Ingredients."**
3. They land on an **Instacart-hosted recipe page** that has already matched our ingredient strings (e.g. `"2 cup all-purpose flour"`) to purchasable products, with a **"You may already have"** pantry section and a store/retailer selector.
4. They pick a store, adjust the cart, and check out **on Instacart**. We never touch payments, inventory, or fulfillment.
5. If the click carried our affiliate attribution, a qualifying order pays us a commission.

The matching, cart, retailer selection, and checkout are **entirely Instacart's** hosted experience. Our only job is to (a) send a well-formed ingredient list to the API and (b) render the link as a compliant button.

### 1.3 The API call (the core of the integration)

**Endpoint:** `POST https://connect.instacart.com/idp/v1/products/recipe`
(dev server: `https://connect.dev.instacart.tools`)

**Auth:** `Authorization: Bearer <API-KEY>` — **server-side only** (see [§3.1](#31-the-api-key-cannot-live-in-the-client-bundle)).

**Request body (abridged):**

```jsonc
{
  "title": "Brown Butter Chocolate Chip Cookies",
  "image_url": "https://<supabase-cdn>/recipe-images/abc.jpg",
  "link_type": "recipe",
  "instructions": ["Preheat oven to 350°F…", "Cream butter and sugar…"],
  "ingredients": [
    {
      "name": "all-purpose flour",          // used for product matching
      "display_text": "All-purpose flour",   // optional, shown to the user
      "measurements": [{ "quantity": 2, "unit": "cup" }]
    }
  ],
  "landing_page_configuration": {
    "partner_linkback_url": "https://digital-cookbook-ruddy.vercel.app/recipe/abc",
    "enable_pantry_items": true
  }
}
```

**Response:**

```jsonc
{
  "products_link_url": "https://www.instacart.com/store/recipes/396179?aff_id=...&affiliate_platform=idp_partner"
}
```

That `products_link_url` is what the button links to. Notes from the docs worth remembering:

- The **`name` field is always required** (it drives product matching); `display_text` only overrides what the cook *sees*. Pass **generic** names — no brand, no quantity baked into the name. Brand/health filters are separate optional fields.
- You can pass **multiple `measurements`** per ingredient to give Instacart unit flexibility.
- **Link expiry / caching:** Instacart recommends treating these links as cacheable. For recipes that rarely change (ours), use a **long expiry (>31 days)** and store the returned URL; for frequently-edited recipes use a **short expiry (<14 days)**. → This means we should **cache `products_link_url` per recipe** and only regenerate when ingredients change (see [§3.3](#33-caching-the-generated-link)).
- Optional **`?retailer_key=`** can pre-select a store (requires a prior `get_nearby_retailers` call with a postal code).

### 1.4 The button / branding

Instacart requires their shoppable links to be presented as an **official "Shop with Instacart" / "Get Recipe Ingredients" button** with their carrot logo and approved styling — you can't just hyperlink raw text. The exact asset specs and brand guidelines weren't fully enumerated in the public docs I could read and **must be confirmed against Instacart's brand/partner guidelines before shipping** (they gate program approval on compliance). Practically: expect to use an Instacart-provided button image/SVG and follow color/clear-space rules, rather than styling it into our rustic-paper palette.

### 1.5 Why *not* the copy-paste `<script>` for us

The PDF's "add a snippet, done" pitch assumes a **server-rendered page with static, marked-up recipe HTML** (a WordPress post). Their plugins read structured recipe data already in the DOM. Digital Cookbook:

- renders recipes **client-side** from Supabase (no recipe HTML in the initial document),
- has **dynamic, user-generated** recipes (new ones appear constantly), and
- needs the API key kept secret.

A pasted third-party `<script>` would have nothing reliable to scrape and couldn't safely hold a key. The **API path gives us a clean, supported integration** that fits our architecture — and reuses the ingredient data we already have.

---

## 2. Potential revenue

### 2.1 The commission structure

| Lever | Figure (per public sources, verify on enrollment) |
|---|---|
| Commission rate | **~5%** of qualifying Instacart order value |
| Alternative model | Sometimes a **per-new-customer bounty** (~$10/first order) instead of/alongside % |
| Attribution window | Historically **7 days** from click (cookie-based) |
| Payout rail | **Impact** (was Tastemakers); standard affiliate net-30-ish terms |
| Eligibility | **18+, U.S. resident** |

> ⚠️ These numbers come from third-party affiliate write-ups and Instacart's older Tastemakers messaging. Because the program migrated to **Impact**, **confirm the live rate, window, and terms in the Impact offer before quoting them anywhere.**

### 2.2 What revenue would realistically look like *here*

Commission revenue is the product of a funnel:

```
recipe views
  × button-click rate          (single-digit %)
  × checkout conversion        (a fraction of clickers)
  × average order value        ($40–$120 typical grocery basket)
  × ~5% commission
  × 7-day attribution capture
```

Rough illustrative math (**not a promise — every factor is a guess at our stage**):

| Monthly recipe views | Clicks @ 3% | Orders @ 8% of clicks | AOV | Commission @ 5% |
|---:|---:|---:|---:|---:|
| 1,000 | 30 | ~2 | $75 | **~$8/mo** |
| 10,000 | 300 | ~24 | $75 | **~$90/mo** |
| 100,000 | 3,000 | ~240 | $75 | **~$900/mo** |

**Honest read:** Digital Cookbook is a portfolio/personal project. Until it has a real, recurring U.S. audience in the thousands of monthly recipe views, this earns **single-digit dollars or nothing**. The compelling reasons to do it now are:

- **Portfolio value** — "integrated a third-party commerce API with a serverless proxy and affiliate attribution" is a strong, demonstrable full-stack story.
- **Genuine UX win** — one-tap "buy these ingredients" is a real feature cooks want, independent of payout.
- **Optionality** — if traffic ever grows, the monetization is already wired.

Treat revenue as **upside, not justification**.

---

## 3. Maintenance & scaffolding required

This is the part that actually affects our codebase. Good news: it's **additive** and slots beside the ingredient-action buttons we already ship.

### 3.1 The API key cannot live in the client bundle

Our Supabase client reads `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
([src/lib/supabaseClient.js](src/lib/supabaseClient.js:3)). **Vite inlines every `VITE_`-prefixed variable into the shipped JS.** The Instacart key is a **secret** (it can create cart-attributed links under our affiliate ID) and must **never** be `VITE_`-prefixed or referenced in `src/`.

→ We need a **server-side proxy** that holds the key and calls the IDP API on our behalf. We don't have one today — there is **no `supabase/` functions directory** in the repo, and Vercel is serving a pure static SPA. This is the single biggest piece of new scaffolding.

**Recommended:** a **Supabase Edge Function** (`supabase/functions/instacart-recipe/index.ts`). We're already all-in on Supabase, it keeps secrets in Supabase's env, and it can authenticate the caller via the existing Supabase session. (Alternative: a Vercel Serverless/Edge function under `/api`. Either works; pick one runtime to own.)

```
Browser (RecipeDetail)
   │  POST { recipeId }  (with Supabase auth header)
   ▼
Supabase Edge Function  ──── holds INSTACART_API_KEY (secret)
   │  1. fetch ingredients for recipeId from DB
   │  2. POST to connect.instacart.com/idp/v1/products/recipe
   │  3. cache + return products_link_url
   ▼
Instacart IDP API
```

### 3.2 Mapping our data to the API payload

Our ingredient schema maps almost cleanly — minimal transform work:

| Instacart field | Our source | Notes |
|---|---|---|
| `title` | `recipes.title` | direct |
| `image_url` | `recipes.image_url` (Supabase CDN) | must be a public, CDN-hosted URL — ours are ✅ |
| `instructions[]` | `steps.instruction` (ordered by `step_number`) | direct |
| `ingredients[].name` | `ingredients.name` | may want light normalization (strip notes/brands for better matching) |
| `ingredients[].measurements[].quantity` | `ingredients.quantity` (numeric) | direct |
| `ingredients[].measurements[].unit` | `ingredients.unit` | **unit-vocabulary mismatch risk** — our free-text units (and `UnitCombobox`) may not all match Instacart's expected units |
| `landing_page_configuration.partner_linkback_url` | recipe permalink | round-trips the cook back to us |

Schema reference: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) (`ingredients`: `name, quantity, unit, order_index`; note the code also reads a `notes` field). The same `ingredients`/`steps` fetch already lives in [RecipeDetail.jsx](src/components/RecipeDetail.jsx:138) — the Edge Function would do the equivalent query server-side.

**The one real data risk:** **unit normalization.** Our units are free text; Instacart matches better with clean, generic terms. A small mapping/normalization helper (cup/cups → cup, "tbsp" → tablespoon, drop unmeasured units, etc.) will materially improve match quality.

### 3.3 Caching the generated link

We should **not** call the API on every page view (latency + we'd burn rate limit / regenerate identical links). Per Instacart's own guidance, cache the link.

**Recommended:** add a nullable column to `recipes`, e.g.:

- `instacart_link_url text`
- `instacart_link_generated_at timestamptz`

Invalidate (null it out) whenever a recipe's **ingredients change** — i.e., in the edit path in [CreateRecipe.jsx](src/components/CreateRecipe.jsx). The Edge Function regenerates lazily on next request when the cache is empty/stale. This needs a **new migration** (and remember: `supabase_migration/` is gitignored, so any new migration file must be `git add -f`’d — see project memory).

### 3.4 Affiliate attribution wiring

The returned URL contains `aff_id=…&affiliate_platform=idp_partner`. **How our own Impact affiliate ID gets attached to IDP-generated links is the biggest open question** ([§4](#4-open-questions--risks)) — whether it's auto-bound to the API key, passed as a parameter, or requires linking the IDP account to the Impact account. **Confirm with Instacart before assuming we'll be credited.** Without correct attribution, the feature works but earns nothing.

### 3.5 Compliance & legal

- **FTC affiliate disclosure** — once links are monetized, we must disclose the affiliate relationship (a short notice near the button / in a footer). Low effort, **not optional**.
- **Instacart brand compliance** — use the official button asset and styling ([§1.4](#14-the-button--branding)).
- **Program ToS** — Impact + Instacart partner terms; U.S.-resident, 18+ requirement applies to the account owner.

### 3.6 Ongoing maintenance burden (honest assessment)

| Item | Burden |
|---|---|
| Edge Function + secret rotation | **Low** — set once; rotate key occasionally |
| Unit normalization map | **Low–Med** — tweak as we see bad matches |
| API contract drift (Instacart changes fields) | **Low** — but it's an external dependency that can break our button |
| Affiliate/payout reconciliation (Impact dashboard) | **Low** — only matters once earning |
| Brand-guideline re-compliance | **Low** — revisit if Instacart updates assets |

Net: **a weekend to build, near-zero to keep running.** The risk is *external* (program terms / API stability), not internal complexity.

---

## 4. Open questions / risks

These should be resolved **before** committing engineering time:

1. **Affiliate attribution mechanics** — How does *our* Impact ID get bound to IDP-generated `products_link_url`s so we're actually credited? (Confirm with Instacart partner support.)
2. **Live commission terms** — Exact rate, attribution window, and payout under **Impact** (the Tastemakers figures may be stale).
3. **API access & cost** — Is IDP API access free, instant, or approval-gated? Any per-call cost or rate limits at our volume?
4. **Brand asset specs** — Exact button image/SVG, color, and clear-space rules required for approval.
5. **Geographic scope** — Confirmed U.S.-centric; behavior for non-U.S. visitors (most graceful: hide the button outside the U.S.).
6. **Unit/ingredient match quality** — How good is matching on our free-text ingredients without normalization? (Test with the dev server before building UI.)

---

## 5. Suggested implementation path (when/if we proceed)

Phased so we can stop after Phase 0 if the economics or terms don't hold up.

**Phase 0 — Validate (no code):** Get an IDP **dev** API key. Hand-`curl` 3–4 real recipes against `connect.dev.instacart.tools` and eyeball match quality. Read the Impact offer terms. Resolve the [open questions](#4-open-questions--risks). *Decision gate: proceed only if attribution + terms are acceptable.*

**Phase 1 — Backend:** Stand up `supabase/functions/instacart-recipe/` holding `INSTACART_API_KEY`; it auth-checks the caller, fetches ingredients/steps, normalizes units, calls IDP, and returns `products_link_url`. Add the `recipes.instacart_link_url` cache column via a new (force-added) migration.

**Phase 2 — Frontend:** Add an `InstacartButton.jsx` rendered in the Ingredients action row of [RecipeDetail.jsx:365](src/components/RecipeDetail.jsx:365), beside `ExportIngredientsButton` and `SendToShoppingListButton`. Compliant Instacart button asset; loading/error/toast posture matching the existing buttons.

**Phase 3 — Monetize & comply:** Enroll in Impact, wire the affiliate ID, add the FTC disclosure, and (optionally) gate the button to U.S. visitors. Update [README.md](README.md) and the roadmap docs.

**Roadmap note:** if pursued, this is a clean candidate for its own stage item in `refs/ROADMAP.md` with a paired `refs/DATABASE_DECISIONS.md` entry (new column + Edge Function), per the project's living-docs convention.

---

## 6. Recommendation

**Build it for the feature and the portfolio story, not for the money.** The integration is architecturally clean, reuses our existing ingredient data, and demonstrates a serverless-proxy + third-party-commerce-API pattern that's genuinely resume-worthy. The monetization is a free option attached to that work — it won't pay until there's traffic, and it carries a real external dependency (program terms + API stability) we don't control. **Do Phase 0 first**; the open questions around affiliate attribution and live Impact terms are cheap to answer and decide whether the rest is worth it.

---

## Sources

- [Shoppable Recipes (PDF, user-supplied)](https://company.instacart.com/static/pdfs/shoppable-recipes.pdf)
- [Instacart Developer Platform — Introduction](https://docs.instacart.com/developer_platform_api)
- [Create a recipe page (tutorial)](https://docs.instacart.com/developer_platform_api/guide/tutorials/create_a_recipe_page/)
- [Recipe page (concepts)](https://docs.instacart.com/developer_platform_api/guide/concepts/recipe/)
- [Introducing Instacart Tastemakers (announcement, Jul 2023)](https://company.instacart.com/updates/introducing-instacart-tastemakers-a-new-way-to-inspire-your-audience-and-monetize-your-content)
- [The Instacart Developer Platform launch](https://www.instacart.com/company/updates/the-instacart-developer-platform-a-new-way-to-turn-inspiration-into-action)
- [Instacart Affiliate Program: Bye Tastemakers, Hello Impact! (WP Tasty)](https://www.wptasty.com/instacart-affiliate-program)
- [How to Make Money as an Instacart Affiliate (Grocers List)](https://www.grocerslist.com/blog/how-to-make-money-from-instacart-affiliate-program)
- [How to Easily Implement Shoppable Recipes on Your Blog (Bootstrapped Ventures)](https://bootstrapped.ventures/shoppable-recipe/)

> Figures (commission %, attribution window, eligibility) are drawn from the
> above third-party and historical Instacart sources and **should be re-verified
> against the live Impact offer** before being relied on.

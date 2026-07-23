# Monetization — Domains, Ethics, and a Realistic Path

> **Status:** Research only. Nothing here is implemented. This document re-evaluates the
> Digital Cookbook as it exists today (post-Stage 22) and maps every plausible monetization
> domain — what it pays, what it costs, what it requires, and where the ethical lines are.
> It absorbs and extends the shoppable-ingredients research in [INSTACART.md](./INSTACART.md).
>
> **Date:** 2026-07-18 · **Companion docs:** [INSTACART.md](./INSTACART.md) (ingredient
> affiliate deep-dive) · [ROADMAP.md](./ROADMAP.md) Stage N+2b (retail integration gate) ·
> [LIVE.md](./LIVE.md) (hosting costs and ceilings)

---

## TL;DR

- **Nothing monetizes without traffic, and today traffic is ~zero.** The app is a live,
  feature-complete portfolio project with no analytics, no measurable audience, and a
  user-generated corpus in the dozens. Every revenue stream below is a multiplication
  against visitors; the honest first investment is *measurement and distribution*, not
  payment rails.
- **Seven real domains exist**, in rough order of fit: (1) ingredient affiliate commerce
  (Instacart et al. — already researched), (2) kitchen-equipment affiliate links,
  (3) meal-kit CPA partnerships, (4) display advertising, (5) a premium tier,
  (6) donations, (7) print-on-demand physical cookbooks. Two more are **explicitly ruled
  out**: selling user data and pay-to-rank placement.
- **Two prerequisites gate *all* of them:** a Terms of Service + Privacy Policy (none exist
  today — the app hosts user content with no legal agreement covering it), and moving off
  Vercel's Hobby tier, whose terms prohibit commercial use (~$20/mo Pro).
- **Realistic ceiling at each scale:** hobby-that-pays-its-own-hosting at ~10k monthly
  sessions; a few hundred dollars a month at ~50k; food-blog-tier income ($2–5k/mo) only
  at 100k+ pageviews — a level most recipe sites never reach, in a niche facing genuine
  AI-search headwinds. Treat monetization as *wiring installed early, revenue arriving
  late* — the same "feature and portfolio first, revenue as upside" posture INSTACART.md
  already recommends.

---

## 1. Where the app stands today (monetization-relevant inventory)

### 1.1 Assets — things a monetization layer can build on

| Asset | Why it matters for revenue |
|---|---|
| Structured ingredient data (`name, quantity, unit, notes, section`) | Maps ~1:1 onto retailer APIs (Instacart IDP, and the same shape for Walmart/Kroger). The single most monetizable data asset in the app. |
| Shopping list + meal plan loop (Stages N+2a/c, M+1) | "Plan → shop → cook" is exactly the moment a grocery partner pays to intercept. The provenance model even attributes list items to recipes. |
| Recipe deep links + Open Graph unfurls (Stage M) | Shared links look real in DMs — the app's only organic-distribution channel today actually works. |
| Cooking mode, timers, checklists, servings scaling | Genuine kitchen utility = retention = the repeat visits every revenue model needs. Also the surfaces that must **stay clean** of ads. |
| The book/cookbook aesthetic + `cookbooks` collections (Stage 14) | A user's curated cookbook is one step from a print-on-demand physical product — an unusually natural fit most recipe apps don't have. |
| Auth + profiles + follows + notifications | The account system a premium tier would hang off already exists, including OAuth and MFA. |
| GDPR-style data export (Stage 16) | Trust infrastructure — "you can leave with your data" is a real differentiator when asking people to pay. |

### 1.2 Gaps — things that block or cap revenue

| Gap | Impact |
|---|---|
| **No analytics of any kind** (verified: zero instrumentation in `src/` or docs) | Can't measure sessions, pageviews, or funnels — the numbers every ad network and affiliate program is denominated in. Blocking. |
| **No ToS / Privacy Policy / disclosure page** | No legal basis for running ads next to user content, no FTC-compliant affiliate disclosure surface, no GDPR/CCPA story for ad cookies. Blocking. |
| **Vercel Hobby tier** | [Hobby terms prohibit commercial use](./LIVE.md). Any live revenue (ads, affiliate, subscriptions) means Pro (~$20/mo) first. |
| **SPA rendering** | Recipe pages render client-side. Google does execute JS, but ranking against server-rendered recipe sites with `Recipe` schema.org markup is a losing fight. Organic search — the #1 traffic source for every recipe property — is effectively closed until SSR/prerendering (the deferred Next.js migration in [ROADMAP.md](./ROADMAP.md) Stage 7) or an equivalent (expanding `middleware.js` beyond crawler OG stubs). |
| **No server-side secret proxy** | Every affiliate/retail API key must live server-side ([INSTACART.md §3.1](./INSTACART.md)). The Supabase Edge Function scaffolding still doesn't exist. |
| **Tiny UGC corpus, no moderation pipeline** | Ad networks review content quality; a near-empty UGC site with no moderation is a rejection risk (and a brand-safety risk once ads run). |
| **Supabase Free tier** | 7-day inactivity pause and no PITR — fine now, unacceptable the day anyone pays or any partner integration goes live (~$25/mo Pro). |
| **No custom domain** | `*.vercel.app` reads as a demo to ad networks, affiliate managers, and users being asked to pay. ~$12/yr. |

---

## 2. Domains of monetization

Each domain below gets: what it is, fit with this app, short-term vs long-term
implementation, realistic revenue, and its specific ethical considerations. Cross-cutting
ethics live in [§3](#3-ethics-guardrails-cross-cutting).

### 2.1 Ingredient affiliate commerce (Instacart first; generalizes to other retailers)

**The researched path.** [INSTACART.md](./INSTACART.md) covers this end-to-end: the
Instacart Developer Platform API turns a recipe's ingredient list into a hosted shoppable
page; enrollment in Instacart's affiliate program (via **Impact** — Tastemakers is retired)
pays a cut of resulting orders. Historically ~5% of order value with a 7-day window;
current third-party writeups describe Impact terms as **up to ~$10 CPA per new customer
and up to ~15% on qualifying purchases** — materially better than the old figures *if*
they apply, so re-verify against the live Impact offer before modeling anything
([INSTACART.md §2.1](./INSTACART.md) makes the same caveat).

- **Fit:** the best of any domain. The ingredient model maps ~1:1 to the API; the
  ExportIngredientsButton / SendToShoppingListButton pair already established the
  filter-vs-serialize split that makes a partner payload a one-function swap
  ([ROADMAP.md](./ROADMAP.md) Stage 18 / N+2b).
- **Short term (now → first traffic):** run INSTACART.md's **Phase 0 only** — dev API key,
  hand-curl real recipes, read the live Impact terms, resolve the attribution question.
  No code commitment. Optionally build Phases 1–2 (Edge Function proxy + button) for the
  portfolio value; the affiliate enrollment can wait for traffic.
- **Long term:** generalize the proxy-plus-branded-button pattern to Walmart Creator,
  Target Partners, Kroger — each behind its own contract, same architecture. The meal-plan
  "Build shopping list" button becomes the highest-intent placement: a week of groceries
  in one basket is a much larger order than a single recipe.
- **Revenue reality:** per INSTACART.md's funnel math — ~$8/mo at 1k monthly recipe views,
  ~$90/mo at 10k, ~$900/mo at 100k (at the old 5% assumption; a $10-per-new-customer CPA
  skews earlier-stage earnings *up* since a small audience is disproportionately
  new-customer). U.S.-only.
- **Ethics:** FTC disclosure near every button; Instacart brand compliance; the button is
  opt-in commerce (user taps it) rather than injected advertising — the cleanest ethical
  profile of any domain here. One rule to hold: **ingredient lists are never reordered,
  reworded, or padded to improve basket value.** The recipe is the product; the link
  serves the recipe, never the reverse.

### 2.2 Kitchen equipment & pantry affiliate links (Amazon Associates and peers)

Recipe sites' second classic affiliate lane: "the dutch oven this recipe needs." Amazon
Associates pays **4.5% on Kitchen** category items (verified July 2026; **Grocery is only
1%**, which is why Instacart-style order commissions beat Amazon for food itself).

- **Fit:** moderate, with a real product question. The app has no "equipment" concept —
  adding one means either (a) an author-declared optional "Tools" list on recipes
  (schema: a `recipe_tools` table or a `TEXT[]`, one migration), or (b) editorial
  content pages, which don't exist in a pure UGC app. Option (a) is the honest fit:
  authors declare what the recipe genuinely needs, and links attach to that.
- **Short term:** skip. Without traffic, this adds UI complexity for cents. Also Amazon
  Associates **kicks out accounts with no qualifying sales in 180 days** — enrolling
  before traffic exists just burns the application.
- **Long term:** author-declared tools list + affiliate link resolution server-side
  (same Edge Function pattern; Amazon's PA-API key is also a secret). At scale, swap/add
  higher-commission specialist retailers (Sur La Table, Made In, etc. run 5–10%+ programs
  on affiliate networks).
- **Revenue reality:** low single digits per 10k views. Kitchen equipment is bought
  rarely; this is a complement to §2.1, never a headline.
- **Ethics:** links only on **author-declared** tools — never auto-injected into ingredient
  or step text (turning a user's recipe prose into links without consent is both a ToS
  problem and a dark pattern). Disclosure applies. Authors linking their own affiliate
  tags is a policy decision to make *before* it happens organically — recommended answer:
  not permitted; the platform's tags or none, with any future revenue-share done
  explicitly rather than via tag smuggling.

### 2.3 Meal-kit CPA partnerships (HelloFresh, Factor, Blue Apron…)

Meal-kit services pay flat bounties for new-customer signups — typically **$10–20 per
conversion** (HelloFresh's affiliate terms per current third-party listings), far higher
per-event than grocery commissions.

- **Fit:** poor-to-conflicted, and [ROADMAP.md](./ROADMAP.md) Stage N+2b already flags
  them as **conflicts**: meal kits compete with the app's core story ("plan and cook from
  recipes you chose") rather than serving it. A meal-kit ad on a recipe page says "don't
  cook this."
- **Short term:** no.
- **Long term:** only as clearly-labeled display advertising inventory (§2.4) — i.e., if
  an ad network serves a HelloFresh ad, fine; the app should not *editorially* place
  meal-kit CPA links inside recipe surfaces. Document the line now so it doesn't get
  blurred when a $20 CPA looks tempting.
- **Ethics:** the conflict above *is* the ethical consideration: recommending against the
  user's expressed intent because the bounty is higher is the definition of misaligned
  monetization.

### 2.4 Display advertising (AdSense → Mediavine Journey → full Mediavine / Raptive)

The default monetization of the entire recipe-content industry, and the reason most
recipe sites feel terrible. The 2026 landscape (verified this month):

| Network | Entry bar | Notes |
|---|---|---|
| Google AdSense | ~none | Low RPMs (often $3–10 net for food traffic); UGC sites need active moderation to stay policy-clean. The "before you qualify for better" option. |
| **Mediavine Journey** | **1,000 sessions/mo** (lowered Jan 2026), no revenue minimum | 70% revenue share to the site. Auto-upgrades to full Mediavine at $5k trailing-12-month ad revenue. |
| Full Mediavine | $5,000/yr ad revenue | The food-niche standard; historically strict about original content. |
| **Raptive** | **25,000 pageviews/mo** (lowered from 100k) | Mediavine's main competitor, same tier of quality. |

Food-niche RPMs at the Mediavine/Raptive tier historically run **$15–40 gross per 1,000
pageviews** (seasonal: Q4 spikes, Q1 slumps); at Journey's 70% share, model **$10–25 net**.

- **Fit:** workable but tension-laden. The rustic-paper design works *because* the page is
  quiet; programmatic ad units are the single biggest threat to that. There's also an
  approval question: Mediavine's review favors original-content sites, and a UGC recipe
  app is an unusual applicant — approval is plausible with a real audience and visible
  moderation, but not guaranteed.
- **Short term:** none — below 1,000 sessions/mo there is literally no program worth
  joining. The short-term work is the *prerequisites*: analytics to know the session
  count, privacy policy + consent management (GDPR/CCPA CMP — ad networks require one),
  and the SSR/SEO investment that makes reaching 1k sessions possible at all.
- **Long term:** join Journey at ~1k sessions; hold a strict placement policy (below);
  graduate to full Mediavine/Raptive as thresholds allow. Display becomes the revenue
  floor that the more aligned domains (§2.1, §2.5) build above.
- **Revenue reality:** ~1.3 pageviews/session for a browse-style app → 10k sessions ≈ 13k
  pageviews ≈ **$130–330/mo** at Journey rates; 100k pageviews ≈ **$1,500–4,000/mo** at
  full-network rates. These are the numbers that make display the eventual workhorse
  despite its ugliness.
- **Ethics / placement policy (decide now, in writing):**
  - **Never in cooking mode, print output, or PDF export.** The kitchen surfaces are the
    product's soul; a timer with a banner ad is a different product.
  - No interstitials, no auto-play video units, no ads inside the ingredient/step lists.
  - Ad density capped well below network maximums; the grid and recipe page get at most
    quiet, clearly-bounded slots.
  - Consent-gated personalization: run contextual ads for non-consenting users rather
    than nagging consent walls.
  - UGC brand-safety cuts both ways: moderation must be real before ads run *next to*
    user content, and the ToS must cover monetized display of pages containing it.

### 2.5 Premium tier / freemium subscription

What the standalone recipe-app market actually charges (July 2026 comps): AnyList
**$9.99/yr** (family $14.99), Paprika **$4.99 one-time** per platform, ReciMe
**$59.99/yr** (after aggressive 2025–26 price hikes), Samsung Food free with a paid
Food+ tier, NYT Cooking ~$5/mo riding editorial content. The market tolerates
**$10–60/yr** for organizer-class apps.

- **Fit:** good *eventually* — the account, profile, and feature infrastructure exists,
  and the roadmap already contains natural premium candidates. The honest problem is that
  the free competition (including this app's own free tier) is strong, and premium
  conversion in this category is low single digits of MAU.
- **Candidate premium features** (all already flagged in [ROADMAP.md](./ROADMAP.md) as
  deferred-for-cost, which is exactly what a paid tier should absorb):
  - **Per-step video** (Stage 15 explicitly gated video on "is there a paid tier yet?")
  - Expanded storage quotas (cover/step/comment photos beyond a free cap)
  - Cross-device sync of preferences (backdrop, fridge basket, shopping list — currently
    localStorage; the `profiles`-column upgrade path is already documented)
  - Advanced meal planning (multi-week, repeating plans, per-cell serving targets)
  - Nutrition estimates (the deferred USDA FoodData integration — per-recipe compute cost)
  - Print-on-demand discounts (§2.7 bundling)
- **Short term:** nothing user-facing. Two cheap preparations: (a) keep new
  cost-generating features designed with a quota seam (storage caps are the natural one);
  (b) never ship for free something already earmarked premium (video).
- **Long term (the real project):** Stripe (or Paddle, which handles global sales tax as
  merchant-of-record — meaningful for a solo operator), a `subscriptions` table + RLS,
  entitlement checks, billing support, refunds, and tax posture. This is weeks of work
  and real ongoing support load; do not start it below ~5k MAU.
- **Revenue reality:** 5,000 MAU × 2–4% conversion × ~$25/yr ≈ **$2,500–5,000/yr**
  ($200–400/mo) — comparable to display at the same scale, but far better aligned with
  product quality. At 20k MAU it becomes the largest stream.
- **Ethics:** the paywall must be **additive**: features users already have stay free
  (grandfather anything reclassified); safety-relevant features (allergen filtering,
  Stage N) are **never** premium; data export stays free forever (the Stage 16 RPC is a
  trust promise, not a perk); pricing is plain — no dark-pattern trials, one-click
  cancel.

### 2.6 Donations & patronage (Ko-fi / Buy Me a Coffee / GitHub Sponsors)

- **Fit:** trivial to add, zero infrastructure, and the only domain that works at zero
  traffic. A quiet "Support the cookbook" link in the footer / profile dropdown, plus
  GitHub Sponsors on the repo (it's a public portfolio repo — sponsorship there is
  entirely conventional).
- **Short term:** the one thing that can ship **this week**. Note: even donations are
  arguably "commercial use" under Vercel Hobby terms — a footer link to an external Ko-fi
  page is the lowest-risk shape, but the clean answer is the Pro upgrade whenever any
  money flows.
- **Long term:** stays as a token stream; converts into "founding member" credits if a
  premium tier ever launches.
- **Revenue reality:** $0–20/mo. This is a tip jar, not a business model.
- **Ethics:** essentially none to violate, provided it never gates features (that's §2.5's
  job, done properly).

### 2.7 Print-on-demand physical cookbooks

The sleeper. The app's entire visual language is "recipes as books," and Stage 14 built
real `cookbooks` collections. Print-on-demand services (Lulu has a print API; Blurb,
Peecho similar) turn a PDF into a shipped hardcover with **no inventory and per-unit
margin set by the seller** (typical POD base cost for a small hardcover is ~$15–25; sell
at $30–45).

- **Fit:** uniquely strong thematically, and the pipeline is half-built: the print
  stylesheet and html2pdf work from Stage 8 already produce book-shaped pages per recipe.
  Missing: a multi-recipe book compositor (cover, TOC, per-recipe pages, consistent
  pagination — a real chunk of layout work; html2canvas quality may not satisfy print
  DPI, so a server-side render path could be needed), and the POD API integration
  (another Edge Function; the POD key is a secret).
- **Short term:** no build. Cheap validation only: hand-assemble one cookbook PDF from
  existing exports and run it through Lulu's consumer flow to see the quality gap.
- **Long term:** "Print this cookbook" button on a user's own cookbook → priced checkout
  (POD base + platform margin + Stripe fees). Gift season (Q4) is the natural demand
  spike. This monetizes the user's *own* content back to them — which is why the
  copyright line below is the whole game.
- **Revenue reality:** niche but real margin: $8–15 per book sold. Ten books a month is
  ~$100–150 — comparable to display at 10k sessions, from a fraction of the audience,
  with actual delight attached.
- **Ethics / legal:** a user may print a cookbook containing **only their own recipes**
  (or platform-provided content). Printing *others'* public recipes — or Stage 22
  imports of third-party content — is commercial reproduction the platform would be
  facilitating; the compositor must enforce own-content-only (the `author_id` check is
  trivial; the Stage 22 imported-recipe `is_public=false` default already points the
  right direction). Recipe *ingredient lists* are not copyrightable but prose
  instructions and photos are; keep the rule simple and strict.

### 2.8 Sponsored content & brand partnerships

Direct deals (a flour brand sponsors a baking collection; a cookware brand sponsors
cooking mode "presented by") pay far better than programmatic ads per impression — and
are pure fiction below tens of thousands of engaged users.

- **Short term / long term:** not a build item at all; a sales motion that becomes
  available at ~M3–M4 scale ([§5](#5-speculative-gains--milestones--benchmarks)). Listed
  for completeness so the labeling rules exist before the first email arrives.
- **Ethics:** every sponsored surface labeled "Sponsored," no exceptions; sponsorship
  never buys ranking in search/recommendation rails (see §3); no category conflicts with
  user safety (no sponsored placement on allergen-filtered results, ever).

### 2.9 Ruled out entirely

- **Selling or sharing user data** (browsing behavior, shopping lists, dietary/allergen
  profiles). The allergen columns planned in Stage N are *health-adjacent data*;
  monetizing them in any form — including "anonymized trends" sold to CPG brands — is
  off the table. This is the app's single brightest line: shopping-list and dietary data
  is exactly what grocery-adjacent data brokers want most, which is why the refusal has
  to be explicit and documented *before* anyone asks.
- **Pay-to-rank / undisclosed placement** — search results, recommendation rails
  (Stage 17), and the home grid are never for sale. Sponsored slots, if they ever exist,
  are labeled and visually distinct (§2.8).
- **Ads inside safety and kitchen surfaces** — cooking mode, timers, allergen filter UI,
  print/PDF output (restated from §2.4 because it's a permanent rule, not a placement
  preference).

---

## 3. Ethics guardrails (cross-cutting)

The per-domain rules above, condensed into the standing policy. These are commitments to
hold *even when revenue is at stake* — most monetization scandals in the recipe space are
one of these lines being crossed quietly.

1. **Disclosure, always:** FTC-compliant affiliate disclosure adjacent to every monetized
   link, plus a site-level `/disclosure` page. Ships with the *first* affiliate link, not
   after.
2. **The user's intent outranks the payout:** never recommend against what the user is
   trying to do because a competing action pays better (§2.3 is the concrete case).
3. **Content integrity:** user recipes are never modified, reordered, link-injected, or
   padded to serve monetization. Authors own their words.
4. **Ranking integrity:** organic results and recommendations are never pay-influenced;
   sponsored anything is labeled.
5. **Safety surfaces are commerce-free:** allergen/dietary features, cooking mode, timers.
   A safety feature with a monetary thumb on the scale is worse than no feature.
6. **Data is not the product:** no sale or sharing of behavioral, shopping, or dietary
   data. Analytics choice should reflect this (privacy-respecting analytics — e.g.
   Plausible/Umami-class — over invasive tracking, especially pre-ads).
7. **Consent and law before ads:** ToS + Privacy Policy before any monetization touches
   user content; a real CMP before any personalized advertising (GDPR/CCPA).
8. **Free tier dignity:** no retroactive paywalls, no degraded-on-purpose free
   experience, data export free forever, cancellation as easy as signup.
9. **Copyright respect:** platform-side monetization never attaches to content the
   platform can't verify the user owns (§2.7's own-content-only rule; Stage 22 imports
   stay private-by-default).
10. **Honest accounting to yourself:** revenue projections in this doc are speculative
    multiplication, not forecasts. Re-verify every program rate at enrollment (they
    change constantly — Grocery affiliate rates have historically been cut overnight).

---

## 4. What the application still requires

Grouped by category; the milestone table in §5 sequences them. Costs are monthly unless
noted.

### 4.1 Legal & policy (blocking; cheap; do first)

| Item | Cost | Notes |
|---|---|---|
| Terms of Service + Privacy Policy | ~$0 (template + review) | Must cover: UGC license to display (and later, to display ads adjacent), account terms, content rules. Exists **before** any revenue or any real stranger-audience. |
| Affiliate disclosure page + inline disclosure component | dev time only | Ships with the first affiliate feature. |
| Consent management platform (CMP) | free tiers exist | Only needed when display ads / ad cookies arrive. |
| Business formation (LLC) + tax posture | ~$50–500/yr, state-dependent | Not needed for tip-jar/affiliate pennies; needed before a premium tier handles payments at any scale. Paddle-style merchant-of-record defers much of the sales-tax burden. |

### 4.2 Infrastructure

| Item | Cost | Trigger |
|---|---|---|
| **Analytics** (privacy-respecting) | $0–9 | **Now.** Nothing in §5 is measurable without it. |
| Custom domain | ~$12/yr | Now-ish; credibility for users, networks, partners. Supabase redirect-URL update per [LIVE.md](./LIVE.md). |
| Vercel Pro | $20 | The day any monetization goes live (Hobby ToS). |
| Supabase Pro | $25 | First real users or first partner integration (kills the 7-day pause; adds PITR). |
| Supabase Edge Function scaffolding (first serverless proxy) | dev time | First affiliate integration ([INSTACART.md §3.1](./INSTACART.md)). |
| Transactional email (Resend/Postmark-class) | $0–20 | Premium tier receipts; the Stage 11 email-notification deferral also lands here. |
| SSR / prerendering for recipe pages | major dev effort | The load-bearing traffic prerequisite — either the deferred Next.js migration or extending `middleware.js` to serve real prerendered recipe HTML + `Recipe` schema.org JSON-LD to search engines. Without this, organic search traffic — the input to every revenue formula here — stays near zero. |
| Payments (Stripe/Paddle) + entitlements | 2.9%+30¢/txn | Premium tier only (M3+). |

### 4.3 Product & operations

| Item | Trigger |
|---|---|
| Moderation tooling beyond Stage 16 reports (queue triage, content policy, response-time norm) | Before display ads; before any real stranger-audience growth push. |
| Rate limiting / abuse controls (roadmap Stage 7 deferral) | Same trigger as moderation. |
| Content corpus depth — a browsable, searchable body of public recipes (SEO needs indexable pages; ad review needs a non-empty site) | Continuous; the cold-start problem is the real product problem. |
| `Recipe` schema.org structured data on recipe pages | With SSR work — this is what makes recipes eligible for Google's rich recipe results, the single biggest recipe-traffic channel. |
| Retention loop (the follows/notifications/meal-plan features exist; email digest is the missing re-engagement channel) | M1–M2. |

---

## 5. Speculative gains — milestones & benchmarks

> **Everything here is illustrative multiplication, not a forecast.** Each row assumes the
> prior row's prerequisites shipped. "Sessions" per Mediavine's definition; pageviews ≈
> 1.3× sessions for a browse-style app. Affiliate figures extend INSTACART.md's funnel
> (§2.2 there) across the domains above. Industry context worth respecting: recipe-site
> traffic is under structural pressure from AI answer engines — the milestones below are
> *harder* to reach in 2026 than they were in 2020, and most recipe properties never pass
> M2.

### The funnel every domain shares

```
visitors (SEO + shares + follows)
  × pages/visit                → pageviews (display ads)
  × commerce-click rate        → affiliate clicks (Instacart, tools)
  × conversion + AOV + rate    → affiliate revenue
  × MAU × premium conversion   → subscription revenue
```

### Milestone table

| | **M0 — Today** | **M1 — First audience** | **M2 — Pays for itself** | **M3 — Real product** | **M4 — Food-blog tier** |
|---|---|---|---|---|---|
| **User-base benchmark** | ~0 external; seed accounts; corpus ≈ dozens of recipes | **1,000 sessions/mo**; ~200–500 MAU; 25+ genuine registered users; corpus 100+ public recipes | **10,000 sessions/mo** (~13k pageviews); 1–2k MAU; corpus 300+ | **50,000 sessions/mo** (≥25k pageviews unlocks Raptive); ~5k MAU; corpus 1,000+ | **100k+ pageviews/mo**; 15–20k MAU |
| **Programs unlocked** | Donations only | Mediavine **Journey** (1k sessions); Instacart wiring worth finishing | Journey earning meaningfully; Amazon Associates survivable (sales within 180 days) | **Raptive** (25k pv); full Mediavine near ($5k trailing revenue); premium tier viable; POD viable | Direct sponsorships; multi-retailer affiliate deals |
| **Speculative monthly revenue** | **$0** (tip jar: $0–10) | **$10–50** (Journey $10–25 + Instacart single digits + tips) | **$150–450** (display $130–330 + affiliate $30–100 + POD trickle) | **$700–1,800** (display $500–1,250 + affiliate $100–300 + premium $100–250 + POD) | **$2,000–5,500** (display $1.5–4k + premium $300–800 + affiliate $200–500 + sponsors) |
| **Monthly cost base** | $0 | ~$35 (Vercel Pro + domain + analytics) | ~$60 (+ Supabase Pro) | ~$100–150 (+ email, payments overhead, LLC amortized) | ~$200–400 (+ support time — the real cost) |
| **Net** | $0 | **≈ break-even at best** | **+$90–390** — the hosting pays for itself | **+$550–1,700** | **+$1,800–5,100** |
| **What the app still requires to *reach* this milestone** | Analytics · ToS/Privacy · custom domain · donations link · Instacart Phase 0 | SSR/prerender + schema.org markup · moderation + rate limiting · disclosure page · Instacart Phases 1–3 · corpus growth (the hard one) | Email digest / retention loop · Journey placement policy enforced · Amazon tools-list feature · Supabase Pro | Stripe/Paddle + entitlements + premium features (video, storage, sync) · POD compositor · LLC/tax · support channel | Sustained content/SEO operation — at this point it's a part-time business, not a side project |

### Reading the table honestly

- **M0 → M1 is the hardest jump in the entire table** and it is not a monetization
  problem. 1,000 monthly sessions requires either search traffic (blocked on SSR +
  structured data), a sharing flywheel (OG unfurls shipped — links look good, but someone
  has to share them), or a community seed (friends/family/Discord). Every hour spent on
  payment rails before M1 is an hour not spent on the thing that actually gates revenue.
- **Where the money shifts:** display carries M1–M3 (it scales with raw traffic and
  demands nothing of users), then premium + commerce overtake it if the product is good —
  which is the healthy trajectory, since display is the least-aligned stream.
- **Seasonality:** food traffic and ad rates both spike Oct–Dec (holiday baking) and slump
  Jan–Feb. Any single-month reading will mislead; judge milestones on 3-month averages.
- **Kill criteria are as useful as milestones:** if 12 months of genuine distribution
  effort doesn't reach M1, the correct conclusion is that this remains a portfolio piece
  with a tip jar — which per [INSTACART.md §6](./INSTACART.md) was the honest baseline
  all along. The wiring keeps its resume value either way.

---

## 6. Recommended sequencing

**Now (costs ≈ nothing, unblocks everything):**
1. Add privacy-respecting analytics — establish the baseline number every decision here
   depends on.
2. Write ToS + Privacy Policy + disclosure page (static routes; template-based).
3. Add the donations link (footer + repo).
4. Run INSTACART.md **Phase 0** (validation only — dev key, curl, read live Impact terms).
5. Decide on and register a custom domain.

**Next (portfolio-valuable regardless of revenue):**
6. Build the Instacart Edge Function + button (Phases 1–2) — the serverless-proxy pattern
   is the reusable asset for every later integration.
7. Start the SSR/prerender + schema.org work — the true traffic unblocker, and the largest
   single engineering item in this doc.
8. Grow the corpus and moderation posture toward something an ad network would approve.

**At M1 (first 1,000 sessions):** Vercel Pro, Impact enrollment (Phase 3), Mediavine
Journey application, placement policy enforced from day one.

**At M3 (only if reached):** premium tier + POD — the aligned revenue that can eventually
retire the display dependence.

---

## Sources

- [INSTACART.md](./INSTACART.md) — in-repo deep-dive (IDP API, Impact migration, funnel math, proxy architecture); its own sources listed there.
- [Mediavine — official requirements](https://www.mediavine.com/mediavine-requirements/) · [Journey overview (Productive Blogging, 2026)](https://www.productiveblogging.com/everything-you-need-to-know-about-journey-by-mediavine/) · [Mediavine/Raptive entry-requirement changes (This Week in Blogging)](https://thisweekinblogging.com/mediavine-raptive-requirements/) — Journey at 1,000 sessions (Jan 2026), full Mediavine at $5k trailing revenue, Raptive lowered to 25k pageviews.
- [Amazon Associates commission schedule](https://affiliate-program.amazon.com/help/node/topic/GRXPHT8U84RAYDXZ) · [category-rate roundup (AzonPress, 2026)](https://azonpress.com/amazon-affiliate-commission-rates/) — Kitchen 4.5%, Grocery 1%.
- [Instacart affiliate page](https://www.instacart.com/company/affiliate) · [Instacart IDP conversion-tracking docs](https://docs.instacart.com/developer_platform_api/guide/concepts/launch_activities/conversions_and_payments/) · [third-party program review (CommissionDex, 2026)](https://commissiondex.com/programs/instacart-affiliate/) — current Impact terms (~$10 new-customer CPA / up to ~15%); re-verify at enrollment.
- [HelloFresh affiliate listings (Post Affiliate Pro)](https://www.postaffiliatepro.com/affiliate-program-directory/hellofresh-affiliate-program/) · [food-program roundup (Lasso, 2026)](https://getlasso.co/niche/food/) — meal-kit CPA ranges ($10–20).
- Recipe-app pricing comps: [RecipeOne comparison (2026)](https://www.recipeone.app/blog/best-recipe-manager-apps) · [Nutrola pricing comparison (2026)](https://nutrola.app/en/blog/top-10-recipe-apps-2026-features-pricing-compared) — AnyList $9.99/yr, Paprika $4.99 one-time, ReciMe $59.99/yr, Samsung Food+ freemium.

> All program rates, thresholds, and revenue shares above were checked July 2026 against
> the sources listed and **must be re-verified at enrollment time** — affiliate terms and
> ad-network requirements change without notice.

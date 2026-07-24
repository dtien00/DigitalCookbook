# Setting the tab logo (favicon) — how it works

*Taught: 2026-07-24 · Source: `src/img/Kitchi Logo v1.svg` + `index.html:5` (task, not yet shipped) · Patterns: build-tool static assets (`public/`) · declarative document-head resources*

## The problem
The browser tab shows a little icon next to the page title — the **favicon**. Right now
`index.html:5` points it at `/vite.svg`, a file that doesn't exist in this repo, so the tab
falls back to the browser's blank default. We want it to be the Kitchi logo instead.

## How it works

The favicon is not JavaScript, not React, not a component. It's **one line of HTML** in the
document `<head>`:

```html
<link rel="icon" type="image/svg+xml" href="/vite.svg" />   <!-- index.html:5 -->
```

The browser reads `<head>` before it renders anything, sees `rel="icon"`, fetches whatever
`href` points at, and paints it in the tab. Three attributes carry the meaning:
- `rel="icon"` — "this linked resource is the tab icon" (the *role*).
- `type="image/svg+xml"` — "it's an SVG" (lets the browser skip guessing).
- `href="/vite.svg"` — *where to fetch it from*. This is the part that's currently wrong.

### Why `href="/vite.svg"` fails, and where `/` points

`index.html` is Vite's entry file. When the browser (or Vite's dev server) sees a
**root-absolute** URL like `/vite.svg` — leading slash — it resolves it against the *site root*,
not against the folder `index.html` sits in. In a default Vite project (confirmed: no
`publicDir` or `base` override in [vite.config.js](../../vite.config.js)), the site root maps to
the **`public/` directory**. There is no `public/` folder here at all, so `/vite.svg` 404s and
the tab goes blank. (This line is Vite's scaffolding default — it was never pointed at a real
file.)

### The fix, in three moves
1. Create a `public/` directory.
2. Put the logo inside it — rename to `kitchi-logo.svg` (no spaces; spaces in a URL must be
   `%20`-encoded and are an avoidable footgun).
3. Point the href at it: `href="/kitchi-logo.svg"`.

The file in `public/` is served verbatim at `/kitchi-logo.svg`. Done — no import, no build step,
no component.

### Why not just reference `src/img/Kitchi Logo v1.svg` directly?
Because `src/` is *not* served at a stable URL. Vite treats `src/` assets as things to be
**imported, fingerprinted, and rewritten** (`import logoUrl from './img/...svg'` yields something
like `/assets/kitchi-logo.4f3a1b.svg`). You can't hardcode that hashed path in `index.html`. For
a fixed, unhashed resource the document references by name, `public/` is the right home. (For a
logo you render *inside* React — say in the navbar — you'd do the opposite and import it from
`src/`; different job, different mechanism. See Pattern 1.)

### The SVG itself
[src/img/Kitchi Logo v1.svg](../../src/img/Kitchi%20Logo%20v1.svg) is a `1147×1046` viewBox with
three stacked `<path>`s: a near-white background (`#fefefe`), a green layer (`#3fab3e`), and an
orange whisk/utensil (`#f86e12`). It has a `viewBox`, so it scales crisply to the ~16–32px the
tab renders it at — the single biggest reason SVG favicons beat a fixed-size PNG. One caveat: at
16px the fine detail collapses; squint-test it (Pattern 2's verification step).

## Dependencies, and what each is doing for you
- **Vite** (build tool / dev server) — owns the rule "`public/` is copied to the site root
  verbatim; `src/` assets get imported and fingerprinted." It's what makes `/kitchi-logo.svg`
  resolve in both `npm run dev` and the production build. *Without it:* you'd manually copy the
  file into your web server's document root and manage cache-busting by hand.
- **The browser's HTML parser** (platform) — reads `<link rel="icon">` from `<head>` and fetches
  the icon with zero JS. *Without it:* there is no "without it" — this is the web platform. The
  point is that a favicon needs **no framework**; reaching for React here would be over-engineering.

## Pattern: build-tool static assets — the `public/` escape hatch
**Also known as:** "static/public directory," "unprocessed assets," "copy-as-is assets" (Vite
`public/`, Create-React-App `public/`, Next.js `public/`, Webpack `CopyWebpackPlugin`).
**Problem it solves:** a bundler wants to *fingerprint* most assets (hash their contents into the
filename) so browsers can cache them forever yet still pick up changes. But a few files must live
at a **fixed, predictable URL** the bundler can't rewrite — `favicon`, `robots.txt`,
`site.webmanifest`, files named in hand-written HTML. You need one folder that opts out of
processing.
**The recipe:**
1. Identify the asset's consumer. Does *your code* reference it (import) or does something
   *outside your code* (the browser via HTML, an external crawler) reference it by a fixed name?
2. Code-referenced → import it from `src/`; let the bundler hash and rewrite the URL.
3. Externally-referenced-by-fixed-name → drop it in the tool's public/static dir; reference it
   with a root-absolute path (`/name.ext`).
4. Never hardcode a `src/` asset's path — it changes every build.
**Here:** the favicon is referenced by hand-written HTML (`index.html:5`), so it's a case-3 asset
→ `public/kitchi-logo.svg`, referenced as `/kitchi-logo.svg`.
**Reach for it again when:** favicon, `robots.txt`, `manifest.json`, OG preview images, anything a
crawler or hand-written `<head>` names by fixed path. **Not when:** the asset appears inside a
component (`<img src={...}>`) — import it from `src/` so it's hashed and tree-shaken.

## Pattern: declarative document-head resources
**Also known as:** "resource hints," "document metadata," "the `<head>` contract."
**Problem it solves:** a page needs to tell the browser about resources and metadata that aren't
body content — its icon, its title, its stylesheet, its social-preview image. Rather than
scripting these, you *declare* them as tags in `<head>` and the browser acts on them during parse.
**The recipe:**
1. Decide what document-level fact you're stating (icon? title? preload a font?).
2. Find the tag that declares it (`<link rel="icon">`, `<title>`, `<meta>`, `<link rel="preconnect">`).
3. Put it in `<head>` with a resolvable `href`/`content`.
4. Verify by *observing the browser chrome*, not the page body — the tab, the share card, the
   network panel.
**Here:** `index.html` already uses this pattern four times — `<link rel="icon">` (line 5),
`<link rel="preconnect">` for Google Fonts (lines 7–8), the Lora `<link rel="stylesheet">`
(line 9), and `<title>Digital Cookbook</title>` (line 10). The favicon fix is just making the
line-5 declaration point at a real resource.
**Reach for it again when:** adding OG/Twitter preview cards, a web-app manifest for
"add to home screen," a theme-color meta, preloading a critical font. **Not when:** the thing is
page content the user scrolls through — that's the `<body>` / React's job.

## Do it yourself next time
1. **Ask: who references this asset — my code, or the browser/an external tool by fixed name?**
   That single question routes you to `import from src/` vs. `public/`.
2. If `public/`: create the folder at the project root (sibling of `index.html`), drop the file
   in with a **lowercase, hyphenated, space-free** name.
3. Point the `<head>` tag at it with a **root-absolute** path (`/name.ext`), and set `type=`.
4. **Verify in the browser chrome:** `npm run dev`, look at the tab. Hard-refresh
   (Ctrl+Shift+R) — favicons are cached aggressively and a stale one lies to you. Squint at 16px:
   if the logo is mud, you need a simplified small-size variant, not the full artwork.
5. For production confidence: `npm run build` then check the icon still resolves — `public/`
   contents land at the root of `dist/`.

## Further reading
- MDN — [`<link rel="icon">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel/icon)
- Vite — [Static Asset Handling / the `public` directory](https://vite.dev/guide/assets.html#the-public-directory)

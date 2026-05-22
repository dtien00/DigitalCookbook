# Going Live — Hosting the Digital Cookbook on the Open Web

This doc explains how to make the Digital Cookbook reachable from anywhere on the internet (not just your LAN). The app is a static Vite/React build that talks to **hosted** Supabase, so you do **not** need to stand up your own server — you only need a place to serve the built HTML/JS/CSS.

---

## Current deployment

| | |
|---|---|
| **Live URL** | https://digital-cookbook-ruddy.vercel.app |
| **Host** | Vercel (Hobby tier) |
| **Production branch** | `main` — every push auto-deploys; PR branches get preview URLs |
| **First deployed** | 2026-05-21 |
| **Supabase Site URL** | `https://digital-cookbook-ruddy.vercel.app` |
| **Supabase Redirect URLs** | `https://digital-cookbook-ruddy.vercel.app/**`, `http://localhost:5173/**` |
| **Email confirmation** | ON — signups receive a verification link before they can log in |

To redeploy: push to `main`. To preview a branch: open a PR; Vercel auto-comments with the preview URL. To rotate Supabase keys or change env vars: Vercel Dashboard → project → **Settings → Environment Variables**, then trigger a redeploy.

---

There are two paths depending on what you want:

| Path | Use when | Effort | Persistence |
|---|---|---|---|
| **A. Cloudflare Tunnel** | You want to share a link with a friend *right now* without deploying anything. | ~1 minute | Ephemeral — link dies when you close your laptop. |
| **B. Static host (Vercel / Netlify / CF Pages)** | You want a real URL, auto-deploys from `git push`, custom domain. | ~15 minutes one-time | Permanent, free tier comfortably covers a solo cookbook. |

Most readers want **Path B**. Path A is the "show my friend in Discord right now" escape hatch.

---

## Path A — Cloudflare Tunnel (ephemeral, no signup)

Your `vite.config.js` already sets `server.allowedHosts: true`, which makes Vite accept requests from a `trycloudflare.com` hostname (it would otherwise reject them as a DNS-rebinding attempt).

1. Install the tunnel client once:
   - Windows: `winget install --id Cloudflare.cloudflared`
   - macOS: `brew install cloudflared`
2. In one terminal: `npm run dev`
3. In a second terminal: `cloudflared tunnel --url http://localhost:5173`
4. Cloudflare prints a `https://<random>.trycloudflare.com` URL. Anyone on the internet can open it.

**Caveats.**
- The URL changes every time you restart the tunnel — don't share it as a permanent link.
- The site only works while your laptop is awake and `npm run dev` is running.
- This is *the dev server* exposed publicly. Don't use it for anything you wouldn't show in a screen-share.
- Supabase auth emails (signup confirm, password reset) will link to whatever you set as the Supabase Site URL — if that's `localhost:5173`, those flows are broken on the tunnel. For a quick demo of public browsing, that's fine. For sign-in flows, deploy properly (Path B).

---

## Path B — Vercel (recommended permanent host)

Vercel is the lowest-friction option for Vite/React: it auto-detects the framework, builds on every `git push`, and supports the `VITE_*` env vars you already use. Netlify and Cloudflare Pages are equivalents — see the alternatives section if you prefer one of them.

### B1. Prerequisites

- The project is pushed to a GitHub repo. (It already is — your default branch is `main`.)
- You have a Supabase project with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your local `.env.local`. The anon key is safe to ship publicly — Row-Level Security on every table is what actually protects data. The **service-role** key (if you ever have one) must never leave your machine or the seed script.

### B2. Verify the production build works locally

Run this once before deploying so you catch problems on your machine, not in CI:

```powershell
npm run build
npm run preview
```

`build` writes static files to `dist/`. `preview` serves them on http://localhost:4173. Click around — if anything 404s or the Supabase calls fail, fix that *first*. Production hosts will reproduce exactly this behavior.

### B3. Deploy to Vercel

1. Go to https://vercel.com and sign in with GitHub.
2. Click **Add New → Project** and import the `DigitalCookbook` repo.
3. Vercel auto-detects Vite. Leave the defaults:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
4. Expand **Environment Variables** and add both, scoped to Production + Preview + Development:
   - `VITE_SUPABASE_URL` = (the value from your `.env.local`)
   - `VITE_SUPABASE_ANON_KEY` = (the value from your `.env.local`)
5. Click **Deploy**.

In ~60 seconds you'll have a live URL like `https://digital-cookbook-<hash>.vercel.app`. Every subsequent push to `main` redeploys automatically. PR branches get their own preview URLs.

### B4. Wire Supabase to the new URL (don't skip this)

By default, Supabase still thinks your site lives at `http://localhost:5173`, so signup-confirm and password-reset emails will link there. Fix it:

1. Open the Supabase dashboard → your project → **Authentication → URL Configuration**.
2. **Site URL**: set to your Vercel URL (e.g. `https://digital-cookbook.vercel.app`).
3. **Redirect URLs**: add **both**:
   - `https://digital-cookbook.vercel.app/**`
   - `http://localhost:5173/**` (keep this so local dev still works)
   - If you later add a custom domain, add `https://yourdomain.com/**` too.

Trailing `/**` matters — it lets Supabase redirect back to any path within your domain.

### B5. Smoke-test the live site

- Open the production URL in an incognito window. The public recipe grid should render (anonymous browse, from Stage 2).
- Sign up with a throwaway address. Confirm the email link points to your Vercel domain, not localhost.
- Sign in, create a recipe with a cover image (exercises Supabase Storage), bookmark it, like it, comment on it.
- Open DevTools → Network and confirm requests go to your Supabase project URL.

If any of this fails, see **Troubleshooting** below.

---

## Path B alternatives — Netlify and Cloudflare Pages

Both work just as well; pick based on which dashboard you find friendlier.

### Netlify

1. https://app.netlify.com → **Add new site → Import an existing project → GitHub**.
2. Build command: `npm run build`. Publish directory: `dist`.
3. Site settings → **Environment variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Do the same Supabase URL configuration step as B4 with your `*.netlify.app` URL.

### Cloudflare Pages

1. https://dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git**.
2. Framework preset: **Vite**. Build command: `npm run build`. Output: `dist`.
3. Settings → **Environment variables**: add the two `VITE_SUPABASE_*` vars (set them for **both** Production and Preview environments).
4. Same Supabase URL configuration step as B4 with your `*.pages.dev` URL.

### Notes about SPA routing

If you ever add `react-router-dom` (currently deferred per ROADMAP Stage 1), you'll need a "rewrite all paths to /index.html" rule so refreshing `/recipe/123` doesn't 404:

- **Vercel**: zero config — it auto-detects Vite and adds the SPA fallback.
- **Netlify**: create `public/_redirects` containing `/*  /index.html  200`.
- **Cloudflare Pages**: create `public/_redirects` containing `/*  /index.html  200`.

Today the app uses state-based routing, so you can skip this — but worth knowing.

---

## Custom domain (optional)

Once the `*.vercel.app` URL works, pointing your own domain at it is the easy part:

1. Buy a domain (Cloudflare Registrar and Namecheap are both fine; Cloudflare's prices are at-cost).
2. In Vercel → Project → **Settings → Domains**, add your domain. Vercel shows you the DNS records to set (one `A` record or a `CNAME` to `cname.vercel-dns.com`).
3. Add the records at your registrar. SSL is provisioned automatically within minutes.
4. Go back to Supabase → Auth → URL Configuration and **add the new domain** to Site URL and Redirect URLs (as in B4). Keep the `*.vercel.app` redirect too — Vercel preview deploys still use it.

---

## Updating the live site

After Vercel/Netlify/Pages is set up, the deploy workflow is just:

```powershell
git push origin main
```

The host builds and deploys in ~60 seconds. Watch the deploy log in the dashboard if you want progress, or just wait for the email notification.

PR branches deploy to their own preview URLs automatically — useful for showing a stage's work to someone before merging to `main`.

---

## Ongoing maintenance

### Will exceeding Hobby limits auto-upgrade to Pro?

**No.** Vercel will not silently move you to a paid plan — upgrades require explicit click-through. If you hit a limit, the offending resource is throttled or paused until the next monthly reset (functions stop, bandwidth fails, builds queue). The site goes offline; your wallet doesn't get charged. (Exception: Vercel may require an upgrade if they determine the project is commercial use. A personal cookbook is fine.)

You get warning emails at 75% / 90% / 100% of each metric — toggle them on at Vercel → Settings → Notifications.

### Hobby ceilings worth knowing

| Metric | Hobby limit | Reality at solo-cookbook scale |
|---|---|---|
| Edge requests | 1M / mo | The one to actually watch |
| Fast Data Transfer | 100 GB / mo | Non-issue |
| Serverless function GB-hours | 100 GB-hrs / mo | Non-issue (static SPA) |
| Build execution | 6,000 min / mo | ~30s per push, non-issue |

Supabase Free has its own ceilings — the 500 MB DB and 1 GB Storage limits are already noted above, but the gotcha is the **7-day inactivity pause**. If no one hits the project for a week, Supabase pauses it and the first request after that hangs ~30s while it spins back up. Visiting the live URL occasionally keeps it warm.

### Monthly checklist

1. **Vercel usage** — Dashboard → project → Usage. Eyeball Edge Requests.
2. **Supabase status** — dashboard should show "Active." If paused, click "Restore."
3. **Supabase storage** — Storage tab. Recipe images grow over time.
4. **`npm audit`** — patch high/critical advisories on a stage branch with a preview URL check.
5. **Smoke-test live** — sign in, create/edit a recipe, log out. Catches Auth URL regressions.

### Rollback

Vercel → Deployments → find a known-good build → **Promote to Production**. No git revert needed for a fast rollback.

### Key rotation

The anon key is public-safe by design, but rotation is cheap insurance:

1. Supabase → Settings → API → "Reset anon key"
2. Vercel → Settings → Environment Variables → update `VITE_SUPABASE_ANON_KEY`
3. Trigger a redeploy (push any commit, or Vercel → Deployments → "Redeploy")

Service-role keys (if ever used by [scripts/seed-test-accounts.js](scripts/seed-test-accounts.js)) live only in local `credentials.env` and rotate the same way.

---

## Security and cost notes

- **Anon key exposure is fine.** The `VITE_SUPABASE_ANON_KEY` ships inside the bundled JS. This is by design — every Supabase web app does it. RLS policies (see `supabase_migration_*.sql`) are the real access control. Audit those before going public.
- **Service-role key**: if `scripts/seed-test-accounts.js` ever uses one, it must stay in `.env.local` (already gitignored) and never be set as a `VITE_*` env var — anything `VITE_*` gets baked into the public bundle.
- **Costs at solo-cookbook scale**: zero. Vercel/Netlify/CF Pages free tiers all include far more bandwidth than a small site will consume. Supabase free tier covers 500MB database + 1GB Storage + 50k monthly active users.
- **Public exposure changes the threat model.** Anyone can now create accounts and recipes. If that becomes a problem, consider Supabase Auth → enable email confirmation (already supported by your code's success-toast path), or add rate limits at the Vercel edge.

---

## Troubleshooting

**Build fails with `Module not found` on the host but works locally.** You almost certainly have a file with case-mismatched imports (Windows is case-insensitive, Linux build agents aren't). Search for the named import and check the actual filename matches exactly.

**Live site loads but Supabase calls all 401 / 403.** The env vars probably aren't set. Open DevTools → Network → click a failing request → check the URL. If it's `undefined/rest/v1/...` then `VITE_SUPABASE_URL` wasn't injected at build time. Add it in the host dashboard and trigger a redeploy.

**Signup or password-reset email links go to localhost.** You skipped step B4. Set Site URL in Supabase Auth settings.

**Email magic-link / password-reset opens the right domain but the app shows "Auth session missing".** The redirect URL list in Supabase doesn't include your production domain. Add `https://yourdomain.com/**` (with trailing `/**`) and try again.

**Anonymous browse works but signed-in users see no recipes.** RLS is working as designed, but `auth.uid()` isn't getting set — usually means the Supabase client was initialized before the session was restored from localStorage. Hard refresh; if it persists, check the browser console for Supabase errors.

**Custom domain shows "site not found" but the `*.vercel.app` URL works.** DNS propagation. Wait 10–60 minutes. Use https://www.whatsmydns.net to check if your new records have spread.

---

## Future: should this be a skill?

Hold off creating a deployment skill until *after* the first successful deploy. The first-time setup (B1–B5) is a one-shot workflow — wrapping it in a skill before you've actually done it adds friction without saving time. After deploy, the useful skill would be **`ship-live`** — a small checklist agent that runs whenever you want to push a meaningful change:

- Confirm `npm run build` is clean.
- Confirm `git status` is clean and you're on the branch the host deploys from.
- Grep the diff for new auth flows / new redirect paths that would need to be added to Supabase Auth Redirect URLs.
- Remind you to smoke-test the live URL in incognito after the deploy email arrives.

That's worth ~10 minutes of skill authoring *once you'll use it weekly*. If deploys stay rare, the checklist living here in LIVE.md is enough.

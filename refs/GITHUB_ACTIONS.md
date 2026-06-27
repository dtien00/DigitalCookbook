# CI/CD with GitHub Actions — Integration README

> **Status:** Proposal / reference. **Not yet implemented** — there is no `.github/workflows/`
> directory in the repo today. Deploys currently happen via Vercel's automatic git-push build; there
> is **no test/lint gate** before code reaches `main`. This README describes GitHub Actions and
> exactly how a CI pipeline would slot into Digital Cookbook.
>
> Companion docs: [STACKS_EXPAND.md](./STACKS_EXPAND.md) (why), [DOCKER.md](./DOCKER.md) and
> [TERRAFORM.md](./TERRAFORM.md) (the other two proposed additions).

---

## 1. What GitHub Actions is

**GitHub Actions is GitHub's built-in CI/CD service.** You commit YAML *workflow* files under
`.github/workflows/`; GitHub runs them on triggers (push, pull request, schedule, manual) on
hosted runner VMs, for free on public repos like `dtien00/DigitalCookbook`.

**Core concepts:**

| Term | What it is |
|---|---|
| **Workflow** | A YAML file in `.github/workflows/` describing an automated process. |
| **Trigger (`on:`)** | What starts it — `push`, `pull_request`, `workflow_dispatch` (manual), `schedule` (cron). |
| **Job** | A unit that runs on one runner; jobs run in parallel unless they declare dependencies. |
| **Step** | A single command (`run:`) or reusable **action** (`uses:`) inside a job. |
| **Runner** | The VM executing a job (`ubuntu-latest` is the default). |
| **Secret** | An encrypted repo/org value (e.g. an API key) exposed to workflows as `${{ secrets.NAME }}`. |
| **Service container** | A sidecar container (e.g. `postgres`) a job can spin up for integration tests. |

**Why it's the recommended CI here:** the repo is already on GitHub, so there's **nothing to host or
run** (unlike Jenkins, which is a server you operate). A useful pipeline is ~25 lines of YAML and
pays off **every pull request, today, at zero traffic.** This is the highest *real* (non-portfolio)
value item in [STACKS_EXPAND.md](./STACKS_EXPAND.md).

---

## 2. How CI fits Digital Cookbook

### 2.1 The gap it closes

Right now the project already *has* the quality commands — they just aren't *enforced*:

- `npm run lint` → `eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0`
- `npm run build` → `vite build`

Nothing stops a lint error or a broken build from being merged except remembering to run them. CI
makes them a **required gate** on every PR. Combined with a GitHub **branch-protection rule** on
`main`, a red pipeline blocks the merge button.

### 2.2 How it coexists with Vercel

Vercel keeps doing the **deploy**; Actions adds the **gate** in front of it:

```
PR opened ──► GitHub Actions: lint + build  ──►  ✅ required check
                                                  │
merge to main ──► Vercel auto-build & deploy ─────┘  (unchanged)
```

You generally do **not** add a deploy step to Actions — that would duplicate Vercel. CI's job here is
*verification*, not shipping. (A deploy step only becomes worthwhile if/when a non-Vercel target
appears — see the optional GHCR job in §3.3.)

### 2.3 Env vars during CI builds

`vite build` **succeeds without real Supabase credentials**: `import.meta.env.VITE_*` is replaced at
build (becoming `undefined` if unset), and the `createClient(...)` call in
[src/lib/supabaseClient.js](../src/lib/supabaseClient.js) only executes in the browser at runtime —
not during the build. So CI can build with **harmless placeholder values** (or none). Use repo
**secrets** only if you want the build to mirror prod exactly; they are never required to make the
build pass.

---

## 3. Proposed workflows

### 3.1 `.github/workflows/ci.yml` — the must-have gate

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  lint-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build
        env:
          # Placeholders — build inlines these but never executes createClient at build time.
          # Swap for ${{ secrets.VITE_SUPABASE_URL }} etc. only if you want prod-identical builds.
          VITE_SUPABASE_URL: https://placeholder.supabase.co
          VITE_SUPABASE_ANON_KEY: placeholder-anon-key
```

That's the whole high-value pipeline. Everything below is optional.

### 3.2 (Optional) Migration smoke test — *with an honest caveat*

Tempting: spin up a `postgres` service container and apply
[supabase_migration/](../supabase_migration/) in order to catch SQL errors before they hit the cloud
dashboard. **The caveat is real:** those migrations reference **Supabase-specific schemas** —
`auth.users`, `auth.uid()`, the `storage` schema, and RLS policies — that a *vanilla* `postgres:16`
image does **not** have. A naive `psql -f` will fail on the first `auth.*` reference.

Two honest options:

- **Use the Supabase CLI in CI** (`supabase db start` / `supabase db reset`), which provides the
  Supabase-flavored Postgres + `auth`/`storage` schemas the migrations assume. Heavier, but actually
  representative.
- **Bootstrap the missing schemas** (create `auth`/`storage` schemas + stub `auth.uid()`) before
  applying — brittle, but cheap. Only worth it for catching gross syntax errors.

> Don't ship a migration test that lies — a green check against a schema the migrations don't really
> target gives false confidence. If you do this, do it via the Supabase CLI. (And remember
> `supabase_migration/` is **gitignored** — the workflow would need it force-added or relocated to a
> tracked path first; see the project's migration memory.)

### 3.3 (Optional) Build & push the Docker image to GHCR

Ties into [DOCKER.md](./DOCKER.md): on merge to `main`, build the image and push it to GitHub
Container Registry so a tagged artifact exists for a future AWS/Azure reference deploy.

```yaml
name: Image

on:
  push:
    branches: [main]

jobs:
  build-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write          # required to push to GHCR
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/dtien00/digital-cookbook:latest
          build-args: |
            VITE_SUPABASE_URL=${{ secrets.VITE_SUPABASE_URL }}
            VITE_SUPABASE_ANON_KEY=${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

Only add this once the Dockerfile exists and you actually have a downstream consumer for the image.

---

## 4. Integration checklist (phased)

- [ ] Add `.github/workflows/ci.yml` (§3.1) — lint + build on PRs and `main`.
- [ ] In GitHub repo **Settings → Branches**, add a branch-protection rule on `main` requiring the
      `lint-and-build` check to pass before merge.
- [ ] (Optional) Add repo **secrets** `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` only if you want
      prod-identical CI builds (not required for the gate to work).
- [ ] (Optional) Add the migration smoke test **via the Supabase CLI** (§3.2) — only if the manual
      paste-and-run process is causing real pain.
- [ ] (Optional) Add the GHCR image job (§3.3) once [Docker](./DOCKER.md) lands and there's a
      consumer for the image.
- [ ] Leave Vercel deploy as-is — CI gates, Vercel ships.

**Effort:** ~half a day for the core gate + branch protection. The optional jobs are incremental.

---

## 5. Jenkins / GitLab CI — why Actions instead (per the brief)

The original brief named "Jenkins / GitLab CLI." For this project:

- **GitHub Actions** — recommended. Repo is on GitHub; zero infra to host; free for public repos.
- **GitLab CI** — equivalent capability, but only relevant if you *mirror* the repo to GitLab to
  demonstrate `.gitlab-ci.yml` specifically. Pure overhead otherwise. The pipeline shape (lint →
  build → optional image) translates almost 1:1 if you ever do.
- **Jenkins** — **skip for this project.** Jenkins is a *self-hosted server* you must run, patch, and
  secure; it's heavyweight and dated for a solo static SPA. It retains résumé value in large/legacy
  enterprises, so if you want the line, stand up a throwaway `jenkins/jenkins` container locally,
  wire one `Jenkinsfile` doing the same lint+build, screenshot it — don't make it load-bearing for
  Digital Cookbook. See [STACKS_EXPAND.md §2.2](./STACKS_EXPAND.md).

---

## 6. Gotchas & cautions

- **`cache: npm`** in `setup-node` needs the committed `package-lock.json` (present) to key the cache.
- **`npm ci` (not `npm install`)** in CI — it's faster and fails on lockfile drift, which is what you
  want from a gate.
- **`--max-warnings 0`** means the lint job fails on *warnings*, not just errors. That's already the
  project's local posture — CI just enforces it. Expect existing warnings (if any) to surface
  immediately; fix them or the gate stays red.
- **Don't duplicate Vercel's deploy** in Actions unless you've left Vercel. CI = verify; Vercel =
  ship.
- **Migration testing is not free parity** (§3.2) — only meaningful through the Supabase CLI, and the
  SQL files are gitignored.

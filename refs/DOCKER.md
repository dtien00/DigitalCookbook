# Docker — Integration README

> **Status:** ✅ **Implemented** (PR #75). The repo now ships a multi-stage [`Dockerfile`](../Dockerfile),
> [`nginx.conf`](../nginx.conf) (SPA fallback), and [`.dockerignore`](../.dockerignore); CI builds the
> image on every change. The design discussion below is kept as the rationale — **as shipped it differs
> from the proposal in a few ways:** the nginx config lives at repo root (`nginx.conf`, not
> `docker/nginx.conf`), the build stage uses `node:22-alpine`, only the two Supabase build args are
> wired (no `VITE_ENV_LABEL`), and **no `docker-compose.yml` shipped** — the local-Supabase dev loop in
> §3.4 remains a future option.
>
> Companion docs: [STACKS_EXPAND.md](./STACKS_EXPAND.md) (why), [GITHUB_ACTIONS.md](./GITHUB_ACTIONS.md)
> (also implemented), [TERRAFORM.md](./TERRAFORM.md) (still a proposal).

---

## 1. What Docker is

**Docker packages an application plus its runtime into a portable, immutable *image*.** A running
instance of an image is a *container*: an isolated process with its own filesystem, dependencies,
and network, but sharing the host kernel (so it's far lighter than a VM). The point is **"it runs
the same everywhere"** — your laptop, a teammate's machine, CI, and any cloud all execute the
identical artifact.

**Core concepts, briefly:**

| Term | What it is |
|---|---|
| **Image** | A read-only, layered snapshot built from a `Dockerfile`. The deployable artifact. |
| **Container** | A running (or stopped) instance of an image. |
| **`Dockerfile`** | The recipe: base image + copy + build + run steps. Each step is a cached layer. |
| **Registry** | Where images are stored/shared (Docker Hub, GitHub Container Registry / GHCR, AWS ECR, Azure ACR). |
| **`docker-compose.yml`** | Declares a multi-container local environment (app + db + …) you bring up with one command. |
| **Multi-stage build** | One `Dockerfile` with a heavy "build" stage and a tiny "runtime" stage, so the shipped image carries only the built output — not the toolchain. |

**Why it matters even for a static SPA:** Docker is the *lingua franca* of modern deployment. CI
runners, AWS ECS/Fargate, Azure Container Apps, and Kubernetes all consume Docker images. Adopting
it here is both a real dev-parity win **and** the prerequisite that makes every later infra option
possible.

---

## 2. How Docker fits Digital Cookbook

### 2.1 The honest scope — what it does and does *not* change

- **It does NOT replace Vercel.** Vercel builds the site **from source** on `git push`; it does not
  deploy your `Dockerfile`. So a container here is for **(a) local dev parity** and **(b) a portable
  artifact for non-Vercel deploy targets** (the AWS/Azure reference deploys in
  [STACKS_EXPAND.md §4](./STACKS_EXPAND.md)). Production keeps flowing through Vercel unchanged.
- **It does NOT containerize the Supabase backend in prod** — Supabase is managed cloud. Docker only
  touches the *frontend build/serve* and, optionally, a *local* Supabase for development.

### 2.2 The one gotcha that drives the whole design: `VITE_*` is inlined at **build time**

This is the single most important fact for Dockerizing this app. Vite **statically replaces** every
`import.meta.env.VITE_*` reference at **build** time and bakes the value into the JS bundle
([src/lib/supabaseClient.js](../src/lib/supabaseClient.js) reads `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` this way). Consequences:

- The Supabase **URL + anon key must be present when `vite build` runs** — i.e. they're **build
  arguments**, not runtime container env vars. Setting `-e VITE_SUPABASE_URL=…` on `docker run` does
  **nothing**, because the bundle is already frozen.
- A built image is therefore **environment-specific** (the anon key is compiled in). That's
  acceptable here: the anon key is *public by design* (RLS does the real access control — see
  [middleware.js](../middleware.js) and the project's RLS model). Do **not** ever pass a Supabase
  **service-role** key as a build arg — it would land in the public bundle.

### 2.3 Replicating the Vercel SPA rewrite

[vercel.json](../vercel.json) rewrites every path to `/index.html` so the client router
(`react-router-dom`) can handle deep links. The container's static server must do the same with a
`try_files … /index.html` fallback (shown below). Without it, refreshing `/recipe/abc` 404s.

---

## 3. Proposed files

### 3.1 `Dockerfile` (multi-stage: build with Node, serve with nginx)

```dockerfile
# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install deps against the lockfile for reproducible builds
COPY package.json package-lock.json ./
RUN npm ci

# VITE_* must exist at build time (see README §2.2). Passed as build args.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ENV_LABEL=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_ENV_LABEL=$VITE_ENV_LABEL

COPY . .
RUN npm run build         # → /app/dist

# ---- Runtime stage ----
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
# nginx runs in the foreground by default in this base image
```

### 3.2 `docker/nginx.conf` (the SPA fallback — mirrors `vercel.json`)

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;

  # SPA deep-link fallback — equivalent to vercel.json's blanket rewrite.
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Cache fingerprinted assets aggressively; never cache index.html.
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
  location = /index.html { add_header Cache-Control "no-cache"; }
}
```

> **Note:** nginx does **not** reproduce the OG-unfurl logic in [middleware.js](../middleware.js)
> (that's Vercel Edge–specific). A container deploy that needs link unfurls would re-implement it as
> a small reverse-proxy/edge step — out of scope for dev parity, relevant only for a full non-Vercel
> production port.

### 3.3 `.dockerignore`

Keep the build context small and secrets out of it:

```
node_modules
dist
.git
.env
.env.local
.env.*.local
credentials.env
.vercel
.context
print_tests
supabase_migration
*.log
```

### 3.4 `docker-compose.yml` (local dev convenience)

```yaml
services:
  web:
    build:
      context: .
      args:
        VITE_SUPABASE_URL: ${VITE_SUPABASE_URL}
        VITE_SUPABASE_ANON_KEY: ${VITE_SUPABASE_ANON_KEY}
        VITE_ENV_LABEL: "docker-local"
    ports:
      - "8080:80"
```

Compose reads `${VITE_*}` from your shell or a local `.env` (already gitignored — see
[.gitignore](../.gitignore)).

> **Local Supabase — use the official CLI, not hand-rolled compose.** The full Supabase stack
> (Postgres + GoTrue + Storage + Studio + Kong) is ~10 services. Don't transcribe that by hand;
> `supabase start` (from the Supabase CLI) runs the whole thing in Docker for you and prints a local
> URL + anon key. Point `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` at those for a fully offline
> dev loop. Applying the gitignored [supabase_migration/](../supabase_migration/) SQL into that local
> DB is the natural pairing — and a real improvement over today's manual cloud-dashboard process
> (cf. the `apply-migration` skill).

---

## 4. Developer workflow

| Goal | Command |
|---|---|
| Build the image (passing build args) | `docker build -t digital-cookbook --build-arg VITE_SUPABASE_URL=… --build-arg VITE_SUPABASE_ANON_KEY=… .` |
| Run it | `docker run --rm -p 8080:80 digital-cookbook` → open `http://localhost:8080` |
| One-shot via compose | `docker compose up --build` |
| Local full-stack dev (optional) | `supabase start` (separate), then `npm run dev` or compose pointed at it |

For **active** day-to-day coding you still use `npm run dev` (HMR, fast). The container is for
**verifying the production build**, **onboarding parity**, and **producing the artifact** CI/clouds
consume.

---

## 5. Integration checklist (phased, reversible)

- [ ] Add `Dockerfile`, `docker/nginx.conf`, `.dockerignore` (§3.1–3.3).
- [ ] Verify `docker run` serves the app **and** deep links (`/recipe/<id>` refresh) work via the
      `try_files` fallback.
- [ ] Add `docker-compose.yml` for one-command local serve (§3.4).
- [ ] (Optional) Document the `supabase start` + migration-apply local loop in
      [TESTING.md](./TESTING.md).
- [ ] (Optional, ties into CI) Have [GitHub Actions](./GITHUB_ACTIONS.md) build the image and push to
      **GHCR** on merge, so a tagged artifact exists for any future AWS/Azure deploy.
- [ ] Leave Vercel untouched — it keeps building from source. Nothing about prod changes.

**Effort:** ~half a day for the Dockerfile + nginx + compose; another half-day if you wire the local
Supabase loop. Fully reversible (delete the files; Vercel never knew).

---

## 6. Gotchas & cautions

- **Build-time vs runtime env** (§2.2) — the #1 source of "why is my Supabase URL undefined in the
  container." It's baked at build; you cannot inject it at `docker run`.
- **Never bake the service-role key** into an image. Only the public anon key + URL belong in the
  bundle.
- **`npm ci` needs `package-lock.json`** in the build context (it's committed — good) and will fail
  if it drifts from `package.json`. That's a feature: it catches lockfile drift.
- **Image ≠ Vercel parity for edge logic** — the OG middleware ([middleware.js](../middleware.js))
  and Vercel's CDN headers aren't reproduced by the nginx image. The container is "the SPA," not
  "all of production."
- **`supabase_migration/` is gitignored** — it won't be in the Docker build context (and shouldn't
  be; the frontend image doesn't need it). The local-dev DB loop applies it out-of-band.

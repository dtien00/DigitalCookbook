# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
# ^ The "secret in ARG/ENV" check is a false positive here: VITE_SUPABASE_ANON_KEY
#   is public-by-design (it ships in the browser bundle; RLS is the real guard)
#   and only exists in the discarded build stage, never the final nginx image.

# Multi-stage build: compile the Vite bundle with Node, then serve the static
# output from a tiny nginx image. The final image carries no Node runtime or
# source — just the built assets behind nginx.

# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Supabase's project URL + anon key are public-by-design (Row-Level Security is
# the real guard, not key secrecy), and Vite inlines VITE_* at build time. Pass
# them as build args so the bundle can reach Supabase:
#   docker build --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... .
# Omitting them still produces a valid build — the app just can't connect.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Copy manifests first so the dependency layer caches across source-only changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Serve stage ----
FROM nginx:1.27-alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

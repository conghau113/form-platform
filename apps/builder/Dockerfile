# syntax=docker/dockerfile:1
#
# Multi-stage build for @app/builder (Vite SPA → nginx). Build context MUST be the repo
# root (pnpm workspace) — the builder consumes built `dist/` from workspace packages
# (@org/form-renderer-web, …). See docker-compose.yml `build.context: .`.

# ---- build: Vite production bundle ----
FROM node:25-alpine AS build
RUN corepack enable
WORKDIR /repo

# The API origin the SPA calls from the browser, baked in at build time. Vite only
# exposes VITE_-prefixed vars; turbo.json declares it so strict env-mode passes it through.
ARG VITE_API_BASE
ENV VITE_API_BASE=$VITE_API_BASE

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@app/builder

# ---- runtime: static files served by nginx with SPA fallback ----
FROM nginx:alpine AS runtime
COPY apps/builder/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/builder/dist /usr/share/nginx/html
EXPOSE 80

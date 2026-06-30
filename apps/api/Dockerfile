# syntax=docker/dockerfile:1
#
# Multi-stage build for @app/api. Build context MUST be the repo root (the pnpm
# workspace), not apps/api — the API consumes built `dist/` from sibling workspace
# packages (@org/form-core, …) via turbo. See docker-compose.yml `build.context: .`.

# ---- build: install the whole workspace, build the API + its workspace deps ----
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo

# OpenSSL is required by the Prisma query engine (musl build) at generate time.
RUN apk add --no-cache openssl

# Whole workspace copied (host node_modules/dist excluded via .dockerignore so the
# install resolves the correct musl/linux binaries instead of the host's).
COPY . .

RUN pnpm install --frozen-lockfile
# Builds @app/api and every workspace package it depends on (turbo ^build), and runs
# the API's own build = `prisma generate && tsc` → apps/api/dist + generated client.
RUN pnpm turbo run build --filter=@app/api

# Drop dev-only dependencies so the runtime copy is lean. `prisma` is a prod dep of
# @app/api, so the CLI survives for `migrate deploy`; regenerate the client afterwards
# because pruning rewrites node_modules.
RUN pnpm prune --prod
RUN cd apps/api && pnpm exec prisma generate

# ---- runtime: slim image carrying the built workspace + prod node_modules ----
FROM node:20-alpine AS runtime
RUN corepack enable
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /repo

COPY --from=build /repo /repo

WORKDIR /repo/apps/api
EXPOSE 3001
# Apply pending migrations against the configured DATABASE_URL, then start the server.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]

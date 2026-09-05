# Build context is the REPO ROOT, not backend/:
#
#     docker build -f backend/Dockerfile .
#
# backend/package.json pins typescript and the eslint packages with `catalog:`,
# and a catalog only resolves when pnpm can see the workspace's
# pnpm-workspace.yaml. Building from backend/ on its own — which is what
# publish.sh used to do — fails at `pnpm install` with:
#
#     ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC
#     No catalog entry 'eslint' was found for catalog 'default'.
#
# It also needs the root for a second reason now: the API depends on the
# `common` workspace package and compiles against its build output.
# See the root .dockerignore for what is kept out of the context.
FROM node:24-slim

# corepack activates the exact pnpm pinned by `packageManager` in the root
# package.json, so CI and a laptop build with the same version.
RUN corepack enable

WORKDIR /app

# Manifests first: a source-only change then reuses the cached install layer.
# pnpm-workspace.yaml is what makes the `catalog:` specs resolvable. The one
# lockfile covers every package, and --frozen-lockfile validates it against
# every importer in it, so web and parsing must contribute their manifests even
# though --filter never installs them.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY common/package.json ./common/
COPY backend/package.json ./backend/
COPY web/package.json ./web/
COPY parsing/package.json ./parsing/

# --frozen-lockfile so a build fails loudly on a lockfile that does not match
# package.json, instead of silently resolving something newer than what was
# tested. `common` is filtered in explicitly: --filter backend alone links the
# workspace dependency without installing the typescript it builds with.
# Dev dependencies are deliberately installed — nest build needs the Nest CLI.
RUN pnpm install --frozen-lockfile --filter backend --filter common

COPY common/ ./common/
COPY backend/ ./backend/

# `common` first, then nest build; backend's own build script chains the two.
RUN pnpm --filter backend run build

WORKDIR /app/backend

# 3001 all the way through: main.ts, both compose files, and the host port
# the Cloudflare tunnel resolves to. No translation anywhere.
EXPOSE 3001

# /health pings Mongo and 503s when it is unreachable, so the container turns
# unhealthy when the database dies rather than only when the process does.
# node 24 ships global fetch; there is no curl in node:24-slim.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Compiled output, not ts-node-at-boot: the process starts in milliseconds and
# a type error can no longer reach production as a runtime crash.
CMD ["node", "dist/main.js"]

# Build context is the REPO ROOT, not backend/:
#
#     docker build -f backend/Dockerfile .
#
# backend/package.json pins ts-node, typescript and the eslint packages with
# `catalog:`, and a catalog only resolves when pnpm can see the workspace's
# pnpm-workspace.yaml. Building from backend/ on its own — which is what
# publish.sh used to do — fails at `pnpm install` with:
#
#     ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC
#     No catalog entry 'eslint' was found for catalog 'default'.
#
# The image running in production predates the catalog, which is why nobody
# noticed. See the root .dockerignore for what is kept out of the context.
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
COPY backend/package.json ./backend/
COPY web/package.json ./web/
COPY parsing/package.json ./parsing/

# --frozen-lockfile so a build fails loudly on a lockfile that does not match
# package.json, instead of silently resolving something newer than what was
# tested. Dev dependencies are deliberately installed: `pnpm start` is
# `ts-node backend.ts`, so ts-node and typescript are runtime dependencies here
# in all but name.
RUN pnpm install --frozen-lockfile --filter backend

WORKDIR /app/backend

COPY backend/ ./

# 3001 all the way through: backend.ts, both compose files, and the host port
# the Cloudflare tunnel resolves to. No translation anywhere.
EXPOSE 3001

CMD ["pnpm", "start"]

# syntax=docker/dockerfile:1
#
# NestJS API image. BUILD FROM THE REPO ROOT so the monorepo workspace
# (packages/shared + root lockfile) is in the build context:
#
#   docker build -f apps/api/Dockerfile -t archivato-api .
#
# Debian slim (not alpine) because Prisma's engine and bcrypt (native) are
# smoother on glibc.

FROM node:20-slim AS base
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

# ---- Dependencies (cached on lockfile changes) ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# `--omit=optional` skips geoip-lite, the ONLY optional dependency — a 154 MB
# MaxMind database downloaded in a postinstall hook. It dominates both the build
# time and the image size, and it is dead weight on a managed host:
#   * behind a CDN, the `CF-IPCountry` header short-circuits it anyway; and
#   * on a small instance the ~150 MB in-memory DB will not fit (Render free = 512 MB).
# `common/geo.ts` loads it through a lazy require in a try/catch, so its absence
# degrades cleanly to header-only geolocation (same as GEOIP_FALLBACK=false).
# Drop this flag only if you must resolve country on a host that injects no geo header.
RUN npm ci --omit=optional

# ---- Build shared → generate Prisma client → build API ----
FROM deps AS build
# The ROOT tsconfig is required, not optional: packages/shared/tsconfig.json and
# apps/api/tsconfig.json both `extends: "../../tsconfig.base.json"`, and that file
# is what sets `target: ES2022`. Omit it and tsc cannot read it, silently falls
# back to the ES5 default, and the build dies on a wall of misleading errors:
#   error TS5083: Cannot read file '/app/tsconfig.base.json'.
#   error TS2802: Type 'Set<string>' can only be iterated through when using
#                 '--downlevelIteration' or a '--target' of 'es2015' or higher.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace @archivato/shared \
 && npm run prisma:generate --workspace @archivato/api \
 && npm run build --workspace @archivato/api

# ---- Runtime ----
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
# node_modules carries the generated Prisma client + the @archivato/shared
# workspace symlink, which resolves to packages/shared/dist below.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

EXPOSE 3001
# Apply pending migrations, then boot. Call the binaries directly (no `npm run
# --workspace`) so the runtime image doesn't need the full workspace layout.
# For zero-downtime rollouts, run the migrate step as a separate release command
# and drop it from here.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]

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
RUN npm ci

# ---- Build shared → generate Prisma client → build API ----
FROM deps AS build
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

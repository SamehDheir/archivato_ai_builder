# syntax=docker/dockerfile:1
#
# Next.js web image (standalone output). BUILD FROM THE REPO ROOT so the
# monorepo workspace (packages/shared + root lockfile) is in the build context:
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://example.com \
#     -t archivato-web .
#
# NOTE: NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time,
# so they must be passed as build args (not just runtime env).

FROM node:20-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

# ---- Build ----
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build --workspace @archivato/web

# ---- Runtime ----
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Standalone bundle mirrors the monorepo layout under /app (server at
# apps/web/server.js, deps in /app/node_modules).
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]

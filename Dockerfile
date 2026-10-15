# One image for the whole stack: the API (with MCP and the background worker), the dashboard
# and the public site. docker-compose.yml runs it three times with different commands.
#
#   docker compose up -d --build
#
# Build arguments are baked into the two Next.js apps, so changing them needs a rebuild.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /openseo

# ── Dependencies, cached until a package.json or the lockfile changes ────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/
COPY apps/web/package.json apps/web/
COPY packages/crawler/package.json packages/crawler/
COPY packages/shared/package.json packages/shared/
COPY packages/yepapi/package.json packages/yepapi/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ── Build the dashboard and the site ─────────────────────────────────────────
FROM deps AS build
# Where the two Next.js apps forward /api to: the api service inside compose.
ARG API_URL=http://api:4100
# Public addresses, used for links, canonical URLs and the sitemap.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3200
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3101
ARG NEXT_PUBLIC_API_URL=http://localhost:4100
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=
ARG NEXT_PUBLIC_GITHUB_URL=
ENV API_URL=$API_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_PUBLIC_GITHUB_URL=$NEXT_PUBLIC_GITHUB_URL
COPY . .
RUN pnpm --filter @openseo/app build && pnpm --filter @openseo/web build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /openseo /openseo
USER node
EXPOSE 4100 3200 3101
# The API by default: apply database migrations, then start. Compose overrides this for the
# dashboard and the site.
WORKDIR /openseo/apps/api
CMD ["sh", "-c", "node_modules/.bin/tsx src/db/migrate.ts && exec node_modules/.bin/tsx src/server.ts"]

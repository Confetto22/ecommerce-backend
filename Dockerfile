
ARG NODE_VERSION=22-alpine

########################################
# base: shared runtime tooling
#   - libc6-compat: needed by some node native deps on Alpine
#   - openssl:      required by the Prisma query engine on Alpine
#   - dumb-init:    proper PID 1 for signal handling / graceful shutdown
########################################
FROM node:${NODE_VERSION} AS base
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl dumb-init

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

########################################
# deps: install ALL deps (incl. dev) with a reproducible lockfile install
########################################
FROM base AS deps

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

########################################
# development: hot-reload target used by docker-compose for local dev
# Source is mounted as a volume at runtime, so we don't COPY it in here.
########################################
FROM base AS development

ENV NODE_ENV=development

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

EXPOSE 3000
CMD ["dumb-init", "npm", "run", "start:dev"]

########################################
# build: compile TypeScript, generate Prisma client
# A dummy DATABASE_URL lets `prisma generate` run without a live DB.
########################################
FROM base AS build

ENV NODE_ENV=development
ARG DATABASE_URL="postgresql://user:pass@localhost:5432/placeholder?schema=public"
ENV DATABASE_URL=${DATABASE_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build

########################################
# prune: drop dev dependencies for the runtime image
########################################
FROM base AS prune

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

########################################
# production: minimal runtime image
########################################
FROM base AS production

ENV NODE_ENV=production \
    PORT=8080

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 --ingroup nodejs nestjs

COPY --from=prune --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/generated ./generated
COPY --from=build --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nestjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:${PORT}/health/liveness || exit 1

# APP_MODE (api|worker) will branch runtime behavior in src/main.ts (Phase 0 §E1).
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]

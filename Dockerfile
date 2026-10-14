# ==========================================
# ACUMEN - Multi-stage Production Dockerfile
# ==========================================

# 1. Dependencies Stage
FROM node:22-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY scripts ./scripts/

RUN npm ci

# 2. Builder Stage
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV DATABASE_URL="file:/tmp/build.db"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# 3. Production Runner Stage
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# sqlite3 CLI: lets the entrypoint backfill legacy NULL columns before
# `prisma db push` (otherwise push refuses and demands --force-reset).
RUN apt-get update && apt-get install -y openssl ca-certificates sqlite3 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8000
# Canonical data paths. These MUST match the mounted volumes in compose.yaml
# and any external stack (Dockge): changing them orphans existing databases.
ENV DATABASE_URL="file:/app/prisma/dev.db"
ENV UPLOAD_DIR="/app/uploads"

# Prepare directories and permissions for the built-in node user (UID 1000)
RUN mkdir -p /app/prisma /app/uploads && \
    chown -R node:node /app

COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/prisma ./prisma
# A second copy of the schema OUTSIDE the /app/prisma mount point: when a
# volume is mounted at /app/prisma it shadows the schema.prisma inside it,
# so `prisma db push` would run against a stale schema and skip new columns
# (e.g. Document.tag). The entrypoint always pushes with this baked copy.
COPY --chown=node:node --from=builder /app/prisma/schema.prisma ./schema.prisma
COPY --chown=node:node --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh

USER node

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]


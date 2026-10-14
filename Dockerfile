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

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8000
# Stateful data lives OUTSIDE /app/prisma on purpose: mounting a volume at
# /app/prisma would shadow the schema.prisma baked into the image, so
# `prisma db push` would run against a stale schema and skip new columns.
ENV DATA_DIR="/data"
ENV DATABASE_URL="file:/data/acumen.db"
ENV UPLOAD_DIR="/data/uploads"

# Prepare directories and permissions for the built-in node user (UID 1000)
RUN mkdir -p /data /data/uploads /app/uploads && \
    chown -R node:node /app /data

COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh

USER node

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]


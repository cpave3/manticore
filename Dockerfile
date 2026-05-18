# syntax=docker/dockerfile:1
# ─── Build stage ───────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

# Install build deps (node-gyp for better-sqlite3) + pnpm
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY package.json pnpm-lock.yaml ./
RUN corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ─── Runtime stage ─────────────────────────────────────────────────────────
FROM node:22-slim
WORKDIR /app

ENV NODE_ENV=production
ENV MANTICORE_DB_PATH=/data/manticore.db
ENV MANTICORE_HOST=0.0.0.0

RUN corepack enable

VOLUME ["/data"]
EXPOSE 3456

COPY package.json pnpm-lock.yaml ./
RUN corepack prepare pnpm@latest --activate && pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dashboard/dist ./dashboard/dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/package.json ./package.json

CMD ["node", "dist/index.js"]

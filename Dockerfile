# syntax=docker/dockerfile:1

# ---- deps: install dependencies, compiling native addons (better-sqlite3,
#      pdf-parse's optional @napi-rs/canvas) for this image's own platform ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: build the Next.js app ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner: production image ----
# Deliberately NOT output: "standalone" — its dependency tracer dropped
# pdfjs-dist's optional @napi-rs/canvas (DOMMatrix polyfill), which pdf-parse
# needs at runtime even for text-only extraction, crashing every /api/compare
# request. Shipping the full, already-installed node_modules sidesteps having
# to special-case every native/optional dependency the tracer might miss.
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
VOLUME ["/app/data"]

USER nextjs
EXPOSE 3000

CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]

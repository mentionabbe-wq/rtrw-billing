# syntax=docker/dockerfile:1
# Monorepo single image: builds the React UI + NestJS API and serves both on :3000.
# Build context = repo root (contains rtrw-billing-backend/ and rtrw-billing-frontend/).
# node:20-slim (Debian/glibc) so argon2 uses prebuilt binaries (no native toolchain).

# ---- 1. build frontend ----
FROM node:20-slim AS fe
WORKDIR /fe
COPY rtrw-billing-frontend/package*.json ./
RUN npm install
COPY rtrw-billing-frontend/ ./
RUN npm run build -- --outDir dist

# ---- 2. build backend ----
FROM node:20-slim AS be
WORKDIR /app
COPY rtrw-billing-backend/package*.json ./
RUN npm install
COPY rtrw-billing-backend/ ./
RUN npm run build

# ---- 3. runtime ----
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
# pg_dump utk fitur backup otomatis DB. Harus client v16 (server Postgres 16;
# bawaan Debian bookworm hanya v15 → "server version mismatch") — ambil dari
# repo resmi PGDG (mendukung amd64 & arm64).
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
     | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
     > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 \
  && apt-get purge -y gnupg && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY rtrw-billing-backend/package*.json ./
RUN npm install --omit=dev
COPY --from=be /app/dist ./dist
COPY --from=fe /fe/dist ./client
COPY rtrw-billing-backend/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]

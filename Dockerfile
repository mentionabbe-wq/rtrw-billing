# syntax=docker/dockerfile:1
# Monorepo single image: builds the React UI + NestJS API and serves both on :3000.
# Build context = repo root (contains rtrw-billing-backend/ and rtrw-billing-frontend/).

# ---- 1. build frontend ----
FROM node:20-alpine AS fe
WORKDIR /fe
COPY rtrw-billing-frontend/package*.json ./
RUN npm ci
COPY rtrw-billing-frontend/ ./
RUN npm run build -- --outDir dist

# ---- 2. build backend ----
FROM node:20-alpine AS be
WORKDIR /app
COPY rtrw-billing-backend/package*.json ./
RUN npm ci
COPY rtrw-billing-backend/ ./
RUN npm run build

# ---- 3. runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY rtrw-billing-backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=be /app/dist ./dist
COPY --from=fe /fe/dist ./client
COPY rtrw-billing-backend/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]

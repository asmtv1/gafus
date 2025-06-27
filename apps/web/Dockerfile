# ─────────────────────────────────────────────
# deps-слой c готовым Prisma-клиентом
# ─────────────────────────────────────────────
FROM gafus/prisma-base:latest AS prisma-base

# ─────────────────────────────────────────────
# Stage 1: build frontend
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

##
## 1) Устанавливаем зависимости workspaces
##
#  Копируем корневой lock и package.json
COPY package.json package-lock.json ./
#  Копируем package.json самого фронта, чтобы npm понял «workspace = apps/web»
COPY apps/web/package.json apps/web/package.json

#  Устанавливаем dev-зависимости всех пакетов (turbo, typescript и т.д.)
RUN npm ci

##
## 2) Копируем исходники и собираем Next.js
##
COPY . .
#  Собираем только фронт: npm v10 понимает флаг --workspace
RUN npm run build --workspace=apps/web

# ─────────────────────────────────────────────
# Stage 2: runtime (production)
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

#
# 1) node_modules
#
#   a) общие prod-зависимости всех пакетов
COPY --from=builder /app/node_modules ./node_modules
#   b) патчим prisma-модули заранее сгенерированными бинарями
COPY --from=prisma-base /app/node_modules/.prisma            ./node_modules/.prisma
COPY --from=prisma-base /app/node_modules/@prisma            ./node_modules/@prisma

#
# 2) само Next-приложение (готовая сборка + статика)
#
COPY --from=builder /app/apps/web/.next       ./apps/web/.next
COPY --from=builder /app/apps/web/public      ./apps/web/public
COPY --from=builder /app/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json

#
# 3) Запуск
#
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["../../node_modules/.bin/next", "start"]
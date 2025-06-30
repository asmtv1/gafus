# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────
# Stage 0: prisma-base (готовый @prisma/client)
# ─────────────────────────────────────────────
FROM gafus/prisma-base:latest AS prisma-base

# ─────────────────────────────────────────────
# Stage 1: builder (Next.js build с pnpm)
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# 1️⃣ Устанавливаем corepack + pnpm
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# 2️⃣ Копируем workspace файлы + lockfile
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./

# 3️⃣ Устанавливаем зависимости
RUN pnpm install --frozen-lockfile

# 4️⃣ Копируем исходники проекта полностью
COPY . .

# 5️⃣ Билдим только frontend
RUN pnpm build --filter @gafus/web...

# ─────────────────────────────────────────────
# Stage 2: runner (production)
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# 1️⃣ Устанавливаем corepack + pnpm
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# 2️⃣ Копируем pnpm workspace файлы + lockfile для prune
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./

# 3️⃣ Копируем node_modules:
#   a) общие зависимости всех пакетов
COPY --from=builder /app/node_modules ./node_modules
#   b) prisma клиент + бинарники
COPY --from=prisma-base /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma-base /app/node_modules/@prisma ./node_modules/@prisma

# 4️⃣ Копируем билд фронта и конфиг
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json

# 5️⃣ Удаляем devDependencies, оставляя только production
RUN pnpm prune --prod

# 6️⃣ Открываем порт и запускаем Next.js
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "next", "start"]
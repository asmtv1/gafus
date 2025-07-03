# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────
# Stage 1: builder
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# 1️⃣ Устанавливаем pnpm
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# 2️⃣ Копируем корневые файлы
COPY package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/webpush/package.json ./packages/webpush/package.json

# 3️⃣ Устанавливаем зависимости
RUN pnpm install --frozen-lockfile

# 4️⃣ Копируем весь исходный код
COPY . .

# 5️⃣ Собираем webpush
RUN pnpm --filter @gafus/webpush run build

# ─────────────────────────────────────────────
# Stage 2: runner
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# 1️⃣ Устанавливаем pnpm
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# 2️⃣ Копируем только нужные файлы
COPY package.json pnpm-lock.yaml ./
COPY packages/webpush/package.json ./packages/webpush/package.json

# 3️⃣ Устанавливаем только production-зависимости
RUN pnpm install --prod --filter @gafus/webpush...

# 4️⃣ Копируем собранный билд
COPY --from=builder /app/packages/webpush/dist ./packages/webpush/dist

# 5️⃣ Запускаем
WORKDIR /app/packages/webpush
CMD ["node", "dist/webpush/src/index.js"]
# --- Stage 0: Prisma клиент сгенерирован ---
FROM gafus/prisma-base:latest AS prisma

# --- Stage 1: Build stage ---
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# Копируем весь workspace (монорепу) сразу
COPY . .

# Установка всех зависимостей и сборка
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @gafus/queues run build
RUN pnpm --filter @gafus/bull-board run build

# --- Stage 2: Runtime stage ---
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# Копируем workspace-файлы
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./

# Копируем package.json для bull-board и queues
COPY apps/bull-board/package.json ./apps/bull-board/package.json
COPY packages/queues/package.json ./packages/queues/package.json

# Устанавливаем прод-зависимости
RUN pnpm install --filter @gafus/queues... --prod --frozen-lockfile \
 && pnpm install --filter @gafus/bull-board... --prod --frozen-lockfile

# Копируем собранные dist-артефакты
COPY --from=builder /app/apps/bull-board/dist ./apps/bull-board/dist
COPY --from=builder /app/packages/queues/dist ./packages/queues/dist

# ⬇️ Если в dist есть импорты типа `./push-queue.js`, то они должны быть с расширением `.js`
# ⬇️ Можно также скопировать src, если нужно
# COPY --from=builder /app/packages/queues/src ./packages/queues/src

WORKDIR /app/apps/bull-board

CMD ["node", "dist/apps/bull-board/bull-board.js"]